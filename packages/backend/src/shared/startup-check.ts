/**
 * @fileoverview 启动自检模块
 *
 * 在应用正式启动前，主动验证运行环境是否满足要求。
 * 遵循"快速失败"原则：发现致命问题立即退出，给出明确的错误原因，
 * 而不是让系统带病运行，在播出中途才崩溃。
 *
 * 检查项分两类：
 *   - FATAL（致命）：检查失败则拒绝启动，必须人工修复后再试
 *   - WARNING（警告）：记录日志但允许继续启动，运维尽快处理
 *
 * 使用方式：
 *   在 index.ts 最早期调用，位于 MosConnector.init() 之前
 *   await runStartupChecks();
 */

import * as net  from 'net';
import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';
import { config } from './config';
import { logger } from './logger';

// ─── 类型 ─────────────────────────────────────────────────────────────────────

type CheckResult = {
    passed:  boolean;
    level:   'FATAL' | 'WARNING';
    message: string;
    detail?: string;
};

// ─── 公开入口 ─────────────────────────────────────────────────────────────────

/**
 * 执行所有启动自检。
 * 任何 FATAL 级别的检查失败，都会抛出异常，调用方应退出进程。
 */
export async function runStartupChecks(): Promise<void> {
    logger.info('[StartupCheck] Running pre-flight checks...');

    const results: CheckResult[] = await Promise.all([
        checkMosPort(config.mosPortLower, 'lower'),
        checkMosPort(config.mosPortUpper, 'upper'),
        checkMosPort(config.mosPortQuery, 'query'),
        checkDirectoryWritable(
            path.resolve(process.cwd(), 'data', 'rundowns'),
            'data/rundowns (persistence)'
        ),
        checkDirectoryWritable(
            path.resolve(process.cwd(), 'logs'),
            'logs (logging)'
        ),
        checkConfig(),
        checkDiskSpace(path.resolve(process.cwd()), 500), // 500MB 最低要求
    ]);

    // ── 汇总结果 ──────────────────────────────────────────────────────────────

    const fatals   = results.filter(r => !r.passed && r.level === 'FATAL');
    const warnings = results.filter(r => !r.passed && r.level === 'WARNING');
    const passed   = results.filter(r => r.passed);

    // 打印通过的项
    for (const r of passed) {
        logger.info(`[StartupCheck] ✅ ${r.message}`);
    }

    // 打印警告项
    for (const r of warnings) {
        logger.warn(`[StartupCheck] ⚠️  ${r.message}${r.detail ? ` — ${r.detail}` : ''}`);
    }

    // 打印致命错误
    for (const r of fatals) {
        logger.error(`[StartupCheck] ❌ ${r.message}${r.detail ? ` — ${r.detail}` : ''}`);
    }

    // ── 决策 ──────────────────────────────────────────────────────────────────

    if (fatals.length > 0) {
        logger.error(`[StartupCheck] ${fatals.length} fatal error(s) found. Aborting startup.`);
        logger.error('[StartupCheck] Please fix the issues above and restart.');
        throw new Error(`Startup checks failed: ${fatals.map(r => r.message).join('; ')}`);
    }

    logger.info(
        `[StartupCheck] All checks passed` +
        (warnings.length > 0 ? ` (${warnings.length} warning(s))` : '') +
        `. Proceeding with startup.`
    );
}

// ─── 各项检查实现 ─────────────────────────────────────────────────────────────

/**
 * 检查 TCP 端口是否可用（未被占用）
 * 原理：尝试在该端口上 listen，成功则端口可用，立即关闭；失败则端口被占用。
 */
function checkMosPort(port: number, label: string): Promise<CheckResult> {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                resolve({
                    passed:  false,
                    level:   'FATAL',
                    message: `MOS port ${port} (${label}) is already in use`,
                    detail:  'Another process is occupying this port. Check with: ' +
                             (process.platform === 'win32'
                                 ? `netstat -ano | findstr :${port}`
                                 : `lsof -i :${port}`),
                });
            } else {
                resolve({
                    passed:  false,
                    level:   'FATAL',
                    message: `MOS port ${port} (${label}) check failed`,
                    detail:  err.message,
                });
            }
        });

        server.once('listening', () => {
            server.close(() => {
                resolve({
                    passed:  true,
                    level:   'FATAL',
                    message: `MOS port ${port} (${label}) is available`,
                });
            });
        });

        server.listen(port, '0.0.0.0');
    });
}

/**
 * 检查目录是否存在且可读写
 * 如果目录不存在，尝试创建它（首次启动场景）
 */
function checkDirectoryWritable(dirPath: string, label: string): Promise<CheckResult> {
    return new Promise((resolve) => {
        try {
            // 不存在则尝试创建
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            // 写入测试文件验证可写权限
            const testFile = path.join(dirPath, '.write-test');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);

            resolve({
                passed:  true,
                level:   'FATAL',
                message: `Directory OK: ${label}`,
            });
        } catch (err) {
            resolve({
                passed:  false,
                level:   'FATAL',
                message: `Directory not writable: ${label}`,
                detail:  `Path: ${dirPath} — ${(err as Error).message}`,
            });
        }
    });
}

/**
 * 检查关键配置项
 * 检测明显的配置错误，避免带着错误配置启动
 */
function checkConfig(): Promise<CheckResult> {
    return new Promise((resolve) => {
        const issues: string[] = [];

        // MOS ID 不能是默认占位值（提醒运维填写真实值）
        if (!config.mosID || config.mosID === 'rcas.mos') {
            // 这是警告，不是致命错误——默认值可以工作，但不推荐生产环境使用
        }

        // 端口范围合法性
        const ports = [config.mosPortLower, config.mosPortUpper, config.mosPortQuery];
        for (const port of ports) {
            if (isNaN(port) || port < 1024 || port > 65535) {
                issues.push(`Invalid port value: ${port} (must be 1024–65535)`);
            }
        }

        // 三个 MOS 端口不能相同
        const portSet = new Set(ports);
        if (portSet.size !== ports.length) {
            issues.push('MOS ports (lower/upper/query) must all be different');
        }

        // HTTP 端口合法性
        if (isNaN(config.port) || config.port < 1024 || config.port > 65535) {
            issues.push(`Invalid HTTP port: ${config.port}`);
        }

        // HTTP 端口不能与 MOS 端口冲突
        if (ports.includes(config.port)) {
            issues.push(`HTTP port ${config.port} conflicts with a MOS port`);
        }

        // 生产环境：白名单为空时给出警告
        if (config.isProduction && config.mosAllowedNcsIDs.length === 0) {
            resolve({
                passed:  false,
                level:   'WARNING',
                message: 'MOS_ALLOWED_NCS_IDS is empty in production',
                detail:  'Any device can connect. Set MOS_ALLOWED_NCS_IDS to restrict access.',
            });
            return;
        }

        if (issues.length > 0) {
            resolve({
                passed:  false,
                level:   'FATAL',
                message: 'Configuration validation failed',
                detail:  issues.join('; '),
            });
        } else {
            resolve({
                passed:  true,
                level:   'FATAL',
                message: 'Configuration is valid',
            });
        }
    });
}

/**
 * 检查磁盘可用空间
 * 广电场景下日志和持久化数据会持续写入，磁盘满会导致静默数据丢失
 */
function checkDiskSpace(checkPath: string, minFreeMB: number): Promise<CheckResult> {
    return new Promise((resolve) => {
        try {
            const stats     = fs.statfsSync(checkPath);
            const freeMB    = Math.floor((stats.bfree * stats.bsize) / (1024 * 1024));
            const totalMB   = Math.floor((stats.blocks * stats.bsize) / (1024 * 1024));
            const freePercent = Math.floor((freeMB / totalMB) * 100);

            if (freeMB < minFreeMB) {
                resolve({
                    passed:  false,
                    level:   'WARNING',
                    message: `Low disk space: ${freeMB}MB free (${freePercent}% of ${Math.floor(totalMB / 1024)}GB)`,
                    detail:  `Minimum recommended: ${minFreeMB}MB. Logs and persistence data may fail to write.`,
                });
            } else {
                resolve({
                    passed:  true,
                    level:   'WARNING',
                    message: `Disk space OK: ${freeMB}MB free (${freePercent}% of ${Math.floor(totalMB / 1024)}GB)`,
                });
            }
        } catch (err) {
            // statfsSync 在某些平台可能不支持，降级为警告
            resolve({
                passed:  false,
                level:   'WARNING',
                message: 'Disk space check skipped',
                detail:  `statfsSync not available on this platform: ${(err as Error).message}`,
            });
        }
    });
}