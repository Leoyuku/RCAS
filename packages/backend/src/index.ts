/**
 * @fileoverview RCAS Backend 入口
 *
 * 启动顺序：
 *   1. 加载环境变量（dotenv，必须最先执行）
 *   2. 启动自检（端口、目录、配置、磁盘空间）
 *   3. 初始化 RundownStore（订阅 MosCache 事件）
 *   4. 从磁盘恢复持久化索引（不自动激活）
 *   5. 初始化 MOS 连接（开始监听 NCS）
 *   6. 创建 HTTP server + 挂载 socket.io
 *   7. 启动 HTTP server 监听
 *   8. 注册进程信号处理（优雅关闭）
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
import { rundownEngine } from './modules/3_domain_engine/engine/rundown-engine';

import http                           from 'http';
import express, { Request, Response } from 'express';
import cors                           from 'cors';
import { MosConnector }               from './modules/1_mos_connection/mos-connection';
import { rundownStore }               from './modules/3_domain_engine/store/rundown-store';
import { SocketServer }               from './modules/3_domain_engine/store/socket-server';
import { logger }                     from './shared/logger';
import { config }                     from './shared/config';
import { runStartupChecks }           from './shared/startup-check';
import { tricasterDriver } from './modules/4_playout_controllers/tricaster/tricaster-driver'

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
    rundownEngine.init();
    tricasterDriver.init()

    // ── 3. 从磁盘恢复持久化索引（不自动激活） ─────────────────────────────────
    await rundownStore.restore();
    
    // ── 3.5 恢复播出运行时快照（必须在 rundownStore.restore() 之后）─────────
    rundownEngine.restoreFromSnapshot()

    // ── 4. 初始化 MOS 连接 ────────────────────────────────────────────────────
    const mosConnector = new MosConnector();
    try {
        await mosConnector.init();
    } catch (err) {
        logger.error('[Startup] Failed to initialize MOS connector:', err);
        process.exit(1);
    }

    // ── 5. 初始化 Express ──────────────────────────────────────────────────────
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

    /** 获取所有已知 Rundown 摘要（含 persisted 未激活的） */
    app.get('/rundowns', (_req: Request, res: Response) => {
        const summaries = rundownStore.getAllSummaries();
        res.json({
            count:     summaries.length,
            rundowns:  summaries,
        });
    });

    /** 获取单个 Rundown 完整数据（仅内存中激活/待命的） */
    app.get('/rundowns/:id', (req: Request, res: Response) => {
        const id = req.params['id'] as string;
        const r  = rundownStore.getRundown(id);
        if (!r) {
            res.status(404).json({ error: `Rundown "${id}" not found or not loaded` });
            return;
        }
        res.json(r);
    });

    /** 激活一个 Rundown（导播手动选择） */
    app.post('/rundowns/:id/activate', (req: Request, res: Response) => {
        const id = req.params['id'] as string;
        const ok = rundownStore.activate(id);
        if (!ok) {
            res.status(404).json({ error: `Rundown "${id}" not found` });
            return;
        }
        const rundown = rundownStore.getRundown(id);
        res.json({ ok: true, id, lifecycle: rundownStore.getLifecycle(id), rundown });
    });

    // ── 6. 创建 HTTP server + 挂载 socket.io ──────────────────────────────────
    const httpServer   = http.createServer(app);
    const socketServer = new SocketServer(httpServer);

    // ── 7. 启动监听 ───────────────────────────────────────────────────────────
    await new Promise<void>((resolve) => {
        httpServer.listen(config.port, () => resolve());
    });

    logger.info('╔══════════════════════════════════════╗');
    logger.info('║         RCAS Backend Ready           ║');
    logger.info(`║  MOS  : ${config.mosPortLower} / ${config.mosPortUpper} / ${config.mosPortQuery}        ║`);
    logger.info(`║  HTTP : http://localhost:${config.port}         ║`);
    logger.info(`║  WS   : ws://localhost:${config.port}           ║`);
    logger.info('╚══════════════════════════════════════╝');

    // ── 8. 优雅关闭 ───────────────────────────────────────────────────────────
    const shutdown = async (signal: string) => {
        logger.info(`[Shutdown] Received ${signal}, shutting down gracefully...`);

        httpServer.close(() => {
            logger.info('[Shutdown] HTTP server closed.');
        });

        await socketServer.close();
        logger.info('[Shutdown] Socket.io closed.');

        await mosConnector.dispose();
        logger.info('[Shutdown] MOS connector closed.');

        logger.info('[Shutdown] Goodbye.');
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

})();