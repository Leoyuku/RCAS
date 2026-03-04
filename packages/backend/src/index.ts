/**
 * @fileoverview RCAS Backend 入口
 *
 * 启动顺序：
 * 1. 初始化日志系统
 * 2. 初始化 MosConnector（含磁盘恢复 + MOS 监听）
 * 3. 启动 Express HTTP 服务器
 * 4. 注册优雅关闭信号处理
 */

import express from 'express';
import { MosConnector } from './modules/1_mos_connection/mos-connection';
import { rundownStore } from './store/rundown-store';
import { logger } from './store/logger';

// ─── 主启动流程 ───────────────────────────────────────────────────────────────

(async () => {
    logger.info('========================================');
    logger.info('  RCAS Backend Starting...');
    logger.info('========================================');

    // 1. 初始化 MOS 连接（含数据恢复）
    const mosConnector = new MosConnector();
    await mosConnector.init();

    // 2. 初始化 Express
    const app = express();
    app.use(express.json());

    const port = parseInt(process.env.PORT || '3000');

    // ── 健康检查接口 ──────────────────────────────────────────────────────────
    app.get('/health', (_req, res) => {
        const devices = mosConnector.getConnectedDevices();
        res.json({
            status: 'ok',
            uptime: Math.floor(process.uptime()),
            mosConnected: devices.length > 0,
            connectedDevices: devices,
            rundownCount: rundownStore.count,
            rundownIDs: rundownStore.getAllIDs(),
        });
    });

    // ── 节目单查询接口 ────────────────────────────────────────────────────────
    app.get('/rundowns', (_req, res) => {
        const all = rundownStore.getAllRundowns();
        res.json({ count: all.length, rundowns: all });
    });

    app.get('/rundowns/:roID', (req, res) => {
        const ro = rundownStore.getRundown(req.params.roID);
        if (!ro) {
            res.status(404).json({ error: `RO not found: ${req.params.roID}` });
            return;
        }
        res.json(ro);
    });

    // 3. 启动 HTTP 服务器
    const server = app.listen(port, () => {
        logger.info(`[HTTP] Server listening on http://localhost:${port}`);
        logger.info(`[HTTP] Health check: http://localhost:${port}/health`);
    });

    // ── 优雅关闭 ──────────────────────────────────────────────────────────────

    let isShuttingDown = false;

    async function gracefulShutdown(signal: string): Promise<void> {
        if (isShuttingDown) return;
        isShuttingDown = true;

        logger.info(`[Shutdown] Received ${signal}, starting graceful shutdown...`);

        // 1. 停止接受新的 HTTP 请求
        server.close(() => {
            logger.info('[Shutdown] HTTP server closed.');
        });

        // 2. 关闭 MOS 连接（让 NCS 知道我们在主动断开，而非崩溃）
        try {
            await mosConnector.dispose();
            logger.info('[Shutdown] MOS connections closed.');
        } catch (err) {
            logger.error('[Shutdown] Error closing MOS connections:', err);
        }

        logger.info('[Shutdown] Graceful shutdown complete.');
        process.exit(0);
    }

    // 标准 Unix 信号
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));  // Docker/Kubernetes stop
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));   // Ctrl+C

    // 未捕获异常：记录后退出（让 supervisor/pm2 重启）
    process.on('uncaughtException', (err) => {
        logger.error('[FATAL] Uncaught Exception:', { error: err.message, stack: err.stack });
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        logger.error('[FATAL] Unhandled Promise Rejection:', { reason });
        process.exit(1);
    });

    logger.info('========================================');
    logger.info('  RCAS Backend Ready.');
    logger.info(`  MOS: listening on 10540/10541/10542`);
    logger.info(`  HTTP: http://localhost:${port}`);
    logger.info('========================================');
})();