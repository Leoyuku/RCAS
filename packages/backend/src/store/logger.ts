/**
 * @fileoverview 结构化日志模块（基于 winston）
 *
 * 功能：
 * - 控制台：开发环境带颜色和时间戳，生产环境 JSON 格式
 * - 文件：按大小滚动，自动保留最近 N 个文件
 *   - rcas.log          所有 info 及以上日志（10MB × 7 个）
 *   - rcas.error.log    仅 error 日志（5MB × 14 个）
 *   - rcas.exceptions.log  未捕获异常
 *   - rcas.rejections.log  未处理的 Promise 拒绝
 * - 日志级别由环境变量 LOG_LEVEL 控制（默认 info）
 *
 * 使用：
 *   import { logger } from './logger';
 *   logger.info('消息');
 *   logger.error('错误', { error: err.message, stack: err.stack });
 *   logger.warn('警告');
 *   logger.debug('调试信息');  // 只在 LOG_LEVEL=debug 时输出
 */

import winston from 'winston';
import path    from 'path';
import fs      from 'fs';

// ─── 日志目录 ─────────────────────────────────────────────────────────────────

const LOG_DIR = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ─── 配置 ─────────────────────────────────────────────────────────────────────

const LOG_LEVEL     = process.env.LOG_LEVEL   || 'info';
const IS_PRODUCTION = process.env.NODE_ENV    === 'production';

// ─── 格式 ─────────────────────────────────────────────────────────────────────

const consoleFormat = IS_PRODUCTION
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    )
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length
                ? ' ' + JSON.stringify(meta, null, 0)
                : '';
            return `${timestamp} ${level}: ${message}${metaStr}`;
        })
    );

const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// ─── Logger 实例 ──────────────────────────────────────────────────────────────

export const logger = winston.createLogger({
    level: LOG_LEVEL,
    transports: [
        new winston.transports.Console({ format: consoleFormat }),

        new winston.transports.File({
            filename: path.join(LOG_DIR, 'rcas.log'),
            format:   fileFormat,
            level:    'info',
            maxsize:  10 * 1024 * 1024, // 10MB
            maxFiles: 7,
            tailable: true,
        }),

        new winston.transports.File({
            filename: path.join(LOG_DIR, 'rcas.error.log'),
            format:   fileFormat,
            level:    'error',
            maxsize:  5 * 1024 * 1024,  // 5MB
            maxFiles: 14,
            tailable: true,
        }),
    ],
});

// 未捕获异常和 Promise 拒绝写入专用文件
logger.exceptions.handle(
    new winston.transports.File({
        filename: path.join(LOG_DIR, 'rcas.exceptions.log'),
        format:   fileFormat,
    })
);
logger.rejections.handle(
    new winston.transports.File({
        filename: path.join(LOG_DIR, 'rcas.rejections.log'),
        format:   fileFormat,
    })
);

logger.info(`[Logger] Ready. Level: "${LOG_LEVEL}", Dir: "${LOG_DIR}"`);