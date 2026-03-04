/**
 * @fileoverview 全局配置模块
 *
 * 所有 process.env 的读取集中在这里，避免散落在各个文件中。
 * 其他模块通过 import { config } from '../../shared/config' 使用。
 */

export const config = {
    // 运行环境
    nodeEnv:     process.env.NODE_ENV      || 'development',
    isProduction: process.env.NODE_ENV     === 'production',

    // HTTP 服务器
    port: parseInt(process.env.PORT        || '3000'),

    // 日志
    logLevel:    process.env.LOG_LEVEL     || 'info',

    // MOS 设备身份
    mosID:       process.env.MOS_ID        || 'rcas.mos',
    mosSerial:   process.env.MOS_SERIAL    || 'SN-RCAS-001',

    // MOS 监听端口
    mosPortLower: parseInt(process.env.MOS_PORT_LOWER || '10540'),
    mosPortUpper: parseInt(process.env.MOS_PORT_UPPER || '10541'),
    mosPortQuery: parseInt(process.env.MOS_PORT_QUERY || '10542'),

    // 联调模式（主动连接对端）
    mosConnectHost:      process.env.MOS_CONNECT_HOST,
    mosConnectID:        process.env.MOS_CONNECT_ID        || 'quick.mos',
    mosConnectPortLower: parseInt(process.env.MOS_CONNECT_PORT_LOWER || '11540'),
    mosConnectPortUpper: parseInt(process.env.MOS_CONNECT_PORT_UPPER || '11541'),
    mosConnectPortQuery: parseInt(process.env.MOS_CONNECT_PORT_QUERY || '11542'),

    // Socket.io
    socketCorsOrigin: process.env.SOCKET_CORS_ORIGIN || '*',

    // 版本
    version: process.env.npm_package_version || '1.0.0',
} as const;
