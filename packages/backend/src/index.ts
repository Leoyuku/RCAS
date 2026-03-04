/**
 * @fileoverview RCAS Backend 入口
 *
 * 启动顺序：
 *   1. 加载环境变量（dotenv，必须最先执行）
 *   2. 初始化日志系统
 *   3. 初始化 MosConnector（含磁盘数据恢复 + MOS 端口监听）
 *   4. 创建 HTTP server
 *   5. 挂载 socket.io（必须在 HTTP server 创建之后）
 *   6. 启动 HTTP server 监听
 *   7. 注册进程信号处理（优雅关闭）
 *
 * 优雅关闭顺序：
 *   1. 停止接受新 HTTP 请求
 *   2. 关闭所有 socket.io 连接
 *   3. 关闭 MOS 连接
 *   4. 等待持久化防抖写入完成
 *   5. 退出进程
 */

// ── 必须第一行：加载 .env 文件 ────────────────────────────────────────────────
import 'dotenv/config';

import http                           from 'http';
import express, { Request, Response } from 'express';
import cors                           from 'cors';
import { MosConnector }               from './modules/1_mos_connection/mos-connection';
import { rundownStore }               from './modules/3_store/rundown-store';
import { SocketServer }               from './modules/3_store/socket-server';
import { logger }                     from './shared/logger';

// ─── 主启动流程 ───────────────────────────────────────────────────────────────

(async () => {
    logger.info('╔══════════════════════════════════════╗');
    logger.info('║       RCAS Backend Starting...       ║');
    logger.info('╚══════════════════════════════════════╝');

    // ── 1. 初始化 MOS 连接（含数据恢复） ──────────────────────────────────────
    const mosConnector = new MosConnector();
    try {
        await mosConnector.init();
    } catch (err) {
        logger.error('[Startup] Failed to initialize MOS connector:', err);
        process.exit(1);
    }

    // ── 2. 初始化 Express ──────────────────────────────────────────────────────
    const app  = express();
    const port = parseInt(process.env.PORT || '3000');

    app.use(express.json());
    app.use(cors());

    // ── REST API ───────────────────────────────────────────────────────────────

    /** 健康检查 */
    app.get('/health', (_req: Request, res: Response) => {
        const devices = mosConnector.getConnectedDevices();
        res.json({
            status:           'ok',
            uptime:           Math.floor(process.uptime()),
            mosConnected:     mosConnector.isAnyDeviceConnected(),
            connectedDevices: devices,
            rundownCount:     rundownStore.count,
            rundownIDs:       rundownStore.getAllIDs(),
            socketClients:    socketServer.clientCount,
            version:          process.env.npm_package_version || '1.0.0',
            nodeEnv:          process.env.NODE_ENV || 'development',
        });
    });

    /** 获取所有节目单摘要 */
    app.get('/rundowns', (_req: Request, res: Response) => {
        const all = rundownStore.getAllRundowns();
        res.json({
            count:    all.length,
            rundowns: all.map(ro => ({
                roID:       ro.ID,
                roSlug:     ro.Slug,
                storyCount: ro.Stories.length,
            })),
        });
    });

    /** 获取单个节目单完整数据 */
    app.get('/rundowns/:roID', (req: Request, res: Response) => {
        const roID = req.params['roID'] as string;
        const ro   = rundownStore.getRundown(roID);
        if (!ro) {
            res.status(404).json({ error: `RO not found: ${roID}` });
            return;
        }
        res.json(ro);
    });

    // ── 3. 创建 HTTP server ────────────────────────────────────────────────────
    // 必须用 http.createServer(app) 而不是 app.listen()
    // socket.io 需要接管这个 server 才能共享同一个端口
    const httpServer = http.createServer(app);

    // ── 4. 挂载 socket.io ─────────────────────────────────────────────────────
    // socketServer 在此声明，供 /health 接口引用 clientCount
    const socketServer = new SocketServer(httpServer);

    // ── 5. 启动监听 ───────────────────────────────────────────────────────────
    await new Promise<void>((resolve) => {
        httpServer.listen(port, () => resolve());
    });

    logger.info('╔══════════════════════════════════════╗');
    logger.info('║         RCAS Backend Ready           ║');
    logger.info(`║  MOS  : 10540 / 10541 / 10542        ║`);
    logger.info(`║  HTTP : http://localhost:${port}         ║`);
    logger.info(`║  WS   : ws://localhost:${port}           ║`);
    logger.info('╚══════════════════════════════════════╝');

    // ── 6. 优雅关闭 ───────────────────────────────────────────────────────────

    let isShuttingDown = false;

    const gracefulShutdown = async (signal: string): Promise<void> => {
        if (isShuttingDown) {
            logger.warn(`[Shutdown] Already shutting down, ignoring ${signal}`);
            return;
        }
        isShuttingDown = true;
        logger.info(`[Shutdown] Received ${signal}, starting graceful shutdown...`);

        // 步骤1：停止接受新 HTTP 请求
        await new Promise<void>((resolve) => {
            httpServer.close(() => {
                logger.info('[Shutdown] HTTP server closed.');
                resolve();
            });
        });

        // 步骤2：关闭所有 socket.io 连接（前端会触发自动重连）
        await socketServer.dispose();

        // 步骤3：关闭 MOS 连接（主动断开，NCS 知道是计划内关闭）
        try {
            await mosConnector.dispose();
        } catch (err) {
            logger.error('[Shutdown] Error closing MOS connections:', err);
        }

        // 步骤4：等待持久化防抖定时器全部触发（600ms > 防抖的 500ms）
        logger.info('[Shutdown] Waiting for pending disk writes...');
        await new Promise(resolve => setTimeout(resolve, 600));

        logger.info('[Shutdown] Graceful shutdown complete. Bye.');
        process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (err: Error) => {
        logger.error('[FATAL] Uncaught Exception:', {
            message: err.message,
            stack:   err.stack,
        });
        process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
        logger.error('[FATAL] Unhandled Promise Rejection:', {
            reason: reason instanceof Error ? reason.message : String(reason),
        });
        process.exit(1);
    });

})();