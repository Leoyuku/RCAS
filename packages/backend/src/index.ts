/**
 * @fileoverview RCAS Backend 入口
 *
 * 启动顺序：
 *   1. 加载环境变量（dotenv，必须最先执行）
 *   2. 启动自检（端口、目录、配置、磁盘空间）
 *   3. 初始化 MosConnector（含磁盘数据恢复 + MOS 端口监听）
 *   4. 创建 HTTP server + 挂载 socket.io
 *   5. 启动 HTTP server 监听
 *   6. 注册进程信号处理（优雅关闭）
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
import { rundownStore }               from './modules/3_domain_engine/store/rundown-store';
import { SocketServer }               from './modules/3_domain_engine/store/socket-server';
import { logger }                     from './shared/logger';
import { config }                     from './shared/config';
import { runStartupChecks }           from './shared/startup-check';

// ─── 主启动流程 ───────────────────────────────────────────────────────────────

(async () => {
    logger.info('╔══════════════════════════════════════╗');
    logger.info('║       RCAS Backend Starting...       ║');
    logger.info('╚══════════════════════════════════════╝');

    // ── 1. 启动自检 ───────────────────────────────────────────────────────────
    try {
        await runStartupChecks();
    } catch (err) {
        logger.error('[Startup] Pre-flight checks failed. Aborting.');
        process.exit(1);
    }

    // ── 2. 初始化 MOS 连接（含数据恢复） ──────────────────────────────────────
    const mosConnector = new MosConnector();
    try {
        await mosConnector.init();
    } catch (err) {
        logger.error('[Startup] Failed to initialize MOS connector:', err);
        process.exit(1);
    }

    // ── 3. 初始化 Express ──────────────────────────────────────────────────────
    const app = express();
    app.use(express.json());
    app.use(cors());

    // ── REST API ───────────────────────────────────────────────────────────────

    /** 健康检查 */
    app.get('/health', (_req: Request, res: Response) => {
        res.json({
            status:           'ok',
            uptime:           Math.floor(process.uptime()),
            mosConnected:     mosConnector.isAnyDeviceConnected(),
            connectedDevices: mosConnector.getConnectedDevices(),
            rundownCount:     rundownStore.count,
            rundownIDs:       rundownStore.getAllIDs(),
            socketClients:    socketServer.clientCount,
            version:          config.version,
            nodeEnv:          config.nodeEnv,
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

    // ── 4. 创建 HTTP server + 挂载 socket.io ──────────────────────────────────
    const httpServer   = http.createServer(app);
    const socketServer = new SocketServer(httpServer);

    // ── 5. 启动监听 ───────────────────────────────────────────────────────────
    await new Promise<void>((resolve) => {
        httpServer.listen(config.port, () => resolve());
    });

    logger.info('╔══════════════════════════════════════╗');
    logger.info('║         RCAS Backend Ready           ║');
    logger.info(`║  MOS  : ${config.mosPortLower} / ${config.mosPortUpper} / ${config.mosPortQuery}        ║`);
    logger.info(`║  HTTP : http://localhost:${config.port}         ║`);
    logger.info(`║  WS   : ws://localhost:${config.port}           ║`);
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

        await new Promise<void>((resolve) => {
            httpServer.close(() => {
                logger.info('[Shutdown] HTTP server closed.');
                resolve();
            });
        });

        await socketServer.dispose();

        try {
            await mosConnector.dispose();
        } catch (err) {
            logger.error('[Shutdown] Error closing MOS connections:', err);
        }

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