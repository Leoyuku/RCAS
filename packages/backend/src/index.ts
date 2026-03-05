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

    // ── 2. 初始化 RundownStore（订阅 MosCache 事件） ──────────────────────────
    rundownStore.init();

    // ── 3. 初始化 MOS 连接（含磁盘数据恢复） ──────────────────────────────────
    const mosConnector = new MosConnector();
    try {
        await mosConnector.init();
    } catch (err) {
        logger.error('[Startup] Failed to initialize MOS connector:', err);
        process.exit(1);
    }

    // ── 4. 初始化 Express ──────────────────────────────────────────────────────
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
            rundowns: all.map(r => ({
                id:           r.externalId,
                name:         r.name,
                segmentCount: r.segments?.length ?? 0,
                status:       r.status,
            })),
        });
    });

    /** 获取单个节目单完整数据 */
    app.get('/rundowns/:id', (req: Request, res: Response) => {
        const id = req.params['id'] as string;
        const r  = rundownStore.getRundown(id);
        if (!r) {
            res.status(404).json({ error: `Rundown not found: ${id}` });
            return;
        }
        res.json(r);
    });

    // ── 5. 创建 HTTP server + 挂载 socket.io ──────────────────────────────────
    const httpServer   = http.createServer(app);
    const socketServer = new SocketServer(httpServer);

    // ── 6. 启动监听 ───────────────────────────────────────────────────────────
    await new Promise<void>((resolve) => {
        httpServer.listen(config.port, () => resolve());
    });

    logger.info('╔══════════════════════════════════════╗');
    logger.info('║         RCAS Backend Ready           ║');
    logger.info(`║  MOS  : ${config.mosPortLower} / ${config.mosPortUpper} / ${config.mosPortQuery}        ║`);
    logger.info(`║  HTTP : http://localhost:${config.port}         ║`);
    logger.info(`║  WS   : ws://localhost:${config.port}           ║`);
    logger.info('╚══════════════════════════════════════╝');

    // ── 7. 优雅关闭 ───────────────────────────────────────────────────────────
    const shutdown = async (signal: string) => {
        logger.info(`[Shutdown] Received ${signal}, shutting down gracefully...`);

        // 停止接受新请求
        httpServer.close(() => {
            logger.info('[Shutdown] HTTP server closed.');
        });

        // 关闭 socket.io
        await socketServer.close();
        logger.info('[Shutdown] Socket.io closed.');

        // 关闭 MOS 连接
        await mosConnector.dispose();
        logger.info('[Shutdown] MOS connector closed.');

        logger.info('[Shutdown] Goodbye.');
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

})();