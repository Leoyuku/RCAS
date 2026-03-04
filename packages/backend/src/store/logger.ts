/**
 * @fileoverview 结构化日志模块（基于 winston）
 *
 * 功能：
 * - 控制台输出（开发环境带颜色，生产环境 JSON 格式）
 * - 文件输出（按日期滚动，自动清理旧日志）
 * - 日志级别由环境变量控制
 *
 * 使用方式：
 *   import { logger } from './Logger';
 *   logger.info('消息');
 *   logger.error('错误', err);
 *   logger.warn('警告');
 *   logger.debug('调试信息');  // 只在 LOG_LEVEL=debug 时输出
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// ─── 日志目录 ─────────────────────────────────────────────────────────────────

const LOG_DIR = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ─── 日志级别 ─────────────────────────────────────────────────────────────────

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── 格式定义 ─────────────────────────────────────────────────────────────────

/** 控制台格式：开发环境带颜色和对齐，生产环境 JSON */
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
                ? ' ' + JSON.stringify(meta)
                : '';
            return `${timestamp} ${level}: ${message}${metaStr}`;
        })
    );

/** 文件格式：始终使用 JSON，便于日志分析工具处理 */
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// ─── 创建 Logger ──────────────────────────────────────────────────────────────

export const logger = winston.createLogger({
    level: LOG_LEVEL,
    transports: [
        // 控制台
        new winston.transports.Console({
            format: consoleFormat,
        }),

        // 综合日志文件（info 及以上）
        new winston.transports.File({
            filename: path.join(LOG_DIR, 'rcas.log'),
            format: fileFormat,
            level: 'info',
            maxsize: 10 * 1024 * 1024,  // 10MB 滚动
            maxFiles: 7,                 // 保留 7 个文件（约 70MB）
            tailable: true,
        }),

        // 错误日志单独文件（便于快速排查）
        new winston.transports.File({
            filename: path.join(LOG_DIR, 'rcas.error.log'),
            format: fileFormat,
            level: 'error',
            maxsize: 5 * 1024 * 1024,
            maxFiles: 14,
            tailable: true,
        }),
    ],
});

// ─── 未捕获异常处理 ───────────────────────────────────────────────────────────

logger.exceptions.handle(
    new winston.transports.File({
        filename: path.join(LOG_DIR, 'rcas.exceptions.log'),
        format: fileFormat,
    })
);

logger.rejections.handle(
    new winston.transports.File({
        filename: path.join(LOG_DIR, 'rcas.rejections.log'),
        format: fileFormat,
    })
);

logger.info(`[Logger] Initialized. Level: ${LOG_LEVEL}, Dir: ${LOG_DIR}`);