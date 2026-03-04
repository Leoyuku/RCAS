/**
 * @fileoverview RCAS Backend 入口
 *
 * 启动顺序（顺序不可调换）：
 *   1. 加载环境变量（dotenv，必须最先执行）
 *   2. 初始化日志系统
 *   3. 初始化 MosConnector（含磁盘数据恢复 + MOS 端口监听）
 *   4. 启动 Express HTTP 服务器
 *   5. 注册进程信号处理（优雅关闭）
 *
 * 优雅关闭顺序（SIGTERM / SIGINT）：
 *   1. 停止接受新 HTTP 请求
 *   2. 关闭 MOS 连接（让 NCS 知道是主动断开，而非崩溃）
 *   3. 等待所有待写入的持久化操作完成（防抖定时器）
 *   4. 退出进程
 */

// ── 必须第一行：加载 .env 文件 ────────────────────────────────────────────────
import 'dotenv/config';

import express, { Request, Response } from 'express';
import cors                           from 'cors';
import { MosConnector }               from './modules/1_mos_connection/mos-connection';
import { rundownStore }               from './store/rundown-store';
import { logger }                     from './store/logger';

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

    /** 健康检查：运维监控、负载均衡器、EXE 托盘状态显示 */
    app.get('/health', (_req: Request, res: Response) => {
        const devices = mosConnector.getConnectedDevices();
        res.json({
            status:           'ok',
            uptime:           Math.floor(process.uptime()),
            mosConnected:     mosConnector.isAnyDeviceConnected(),
            connectedDevices: devices,
            rundownCount:     rundownStore.count,
            rundownIDs:       rundownStore.getAllIDs(),
            version:          process.env.npm_package_version || '1.0.0',
            nodeEnv:          process.env.NODE_ENV || 'development',
        });
    });

    /** 获取所有节目单（列表，不含完整 Story 内容） */
    app.get('/rundowns', (_req: Request, res: Response) => {
        const all = rundownStore.getAllRundowns();
        res.json({
            count:    all.length,
            rundowns: all.map(ro => ({
                // 只返回摘要，避免大量数据传输
                roID:        ro.ID,
                roSlug:      ro.Slug,
                storyCount:  ro.Stories.length,
            })),
        });
    });

    /** 获取单个节目单完整数据 */
    app.get('/rundowns/:roID', (req: Request, res: Response) => {
        const roID = req.params['roID'] as string;
        const ro = rundownStore.getRundown(roID);
        if (!ro) {
            res.status(404).json({ error: `RO not found: ${req.params.roID}` });
            return;
        }
        res.json(ro);
    });

    // ── 3. 启动 HTTP 服务器 ────────────────────────────────────────────────────
    const server = app.listen(port, () => {
        logger.info('╔══════════════════════════════════════╗');
        logger.info('║         RCAS Backend Ready           ║');
        logger.info(`║  MOS : 10540 / 10541 / 10542         ║`);
        logger.info(`║  HTTP: http://localhost:${port}         ║`);
        logger.info('╚══════════════════════════════════════╝');
    });

    // ── 4. 优雅关闭 ───────────────────────────────────────────────────────────

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
            server.close(() => {
                logger.info('[Shutdown] HTTP server closed.');
                resolve();
            });
        });

        // 步骤2：关闭 MOS 连接
        // 主动断开让 NCS 知道是计划内关闭，避免 NCS 触发告警
        try {
            await mosConnector.dispose();
        } catch (err) {
            logger.error('[Shutdown] Error closing MOS connections:', err);
        }

        // 步骤3：等待持久化防抖定时器全部触发完成
        // WRITE_DEBOUNCE_MS = 500ms，等待 600ms 确保所有数据都写入磁盘
        logger.info('[Shutdown] Waiting for pending writes to complete...');
        await new Promise(resolve => setTimeout(resolve, 600));

        logger.info('[Shutdown] Graceful shutdown complete. Bye.');
        process.exit(0);
    };

    // 标准 Unix 进程信号
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker stop / systemd stop
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));  // Ctrl+C / Windows 关闭

    // 未捕获异常：记录完整信息后退出，让 pm2/supervisor 重启
    process.on('uncaughtException', (err: Error) => {
        logger.error('[FATAL] Uncaught Exception — process will exit:', {
            message: err.message,
            stack:   err.stack,
        });
        process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
        logger.error('[FATAL] Unhandled Promise Rejection — process will exit:', {
            reason: String(reason),
        });
        process.exit(1);
    });

})();