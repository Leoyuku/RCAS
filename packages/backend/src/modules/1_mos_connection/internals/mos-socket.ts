/**
 * @file tcp-connector.ts
 * @description [内部实现] 负责所有底层的、原始的TCP连接管理。
 * 包含一个TCP服务器和一个TCP客户端，分别对应MOS的高、低端口。
 * 它将物理的socket事件，转换为我们系统内部的、统一的EventBus事件。
 */

import * as net from 'net';
import { eventBus } from '../../../shared/event-bus';
import { logger } from '../../../shared/logger';
import { config } from '../../../shared/config';

// 定义一个接口来追踪所有的TCP连接
interface ActiveConnections {
    [connectionId: string]: net.Socket;
}

/**
 * TCP连接器，封装了MOS高低端口的连接逻辑
 */
export class TCPConnector {
    private upperPortServer: net.Server;
    private lowerPortClient: net.Socket | null = null;
    private activeConnections: ActiveConnections = {};
    private lowerPortRetryTimeout: NodeJS.Timeout | null = null;

    constructor() {
        // --- Upper Port (我们是 Server) ---
        this.upperPortServer = net.createServer((socket) => this.handleNewUpperPortConnection(socket));

        // --- Lower Port (我们是 Client) ---
        // 我们不在这里立即连接，而是在 start() 方法中，以允许更好的控制
    }

    /**
     * 启动所有连接服务
     */
    public start(): void {
        // 启动高端口服务器
        this.upperPortServer.listen(config.mos.upperPort, () => {
            logger.info(`[TCP Connector] Upper Port Server listening on port ${config.mos.upperPort}`);
        });

        this.upperPortServer.on('error', (err) => {
            logger.error(`[TCP Connector] Upper Port Server error: ${err.message}`);
        });

        // 启动低端口客户端的第一次连接
        logger.info(`[TCP Connector] Initiating connection to Lower Port at ${config.mos.ncsHost}:${config.mos.lowerPort}`);
        this.connectLowerPort();
    }

    /**
     * 发送数据到指定的连接
     * @param connectionId 连接的唯一ID
     * @param data 要发送的Buffer
     */
    public send(connectionId: string, data: Buffer): boolean {
        const socket = this.activeConnections[connectionId];
        if (socket && socket.writable) {
            socket.write(data);
            return true;
        }
        logger.warn(`[TCP Connector] Attempted to send data to non-existent or non-writable connection: ${connectionId}`);
        return false;
    }

    /**
     * 处理来自NCS的新连接 (Upper Port)
     */
    private handleNewUpperPortConnection(socket: net.Socket): void {
        const connectionId = `upper_${socket.remoteAddress}:${socket.remotePort}`;
        this.registerConnection(connectionId, socket);
    }

    /**
     * 主动连接到NCS (Lower Port)
     */
    private connectLowerPort(): void {
        // 如果已有连接或正在重试，则不执行任何操作
        if (this.lowerPortClient || this.lowerPortRetryTimeout) {
            return;
        }

        const client = new net.Socket();
        this.lowerPortClient = client; // 立即赋值，避免重入
        const connectionId = `lower_${config.mos.ncsHost}:${config.mos.lowerPort}`;

        client.connect(config.mos.lowerPort, config.mos.ncsHost, () => {
            // 连接成功，注册它
            this.registerConnection(connectionId, client);
        });

        client.on('error', (err) => {
            logger.error(`[TCP Connector] Lower Port client error: ${err.message}`);
            // 错误事件通常会紧跟着一个 close 事件，我们在 close 事件中处理重连
        });
    }

    /**
     * 注册一个新的、已建立的连接，并为其绑定事件监听器
     */
    private registerConnection(connectionId: string, socket: net.Socket): void {
        logger.info(`[TCP Connector] Connection established: ${connectionId}`);
        this.activeConnections[connectionId] = socket;

        // --- 发布连接成功事件 ---
        eventBus.emit('tcp:connected', { connectionId });

        // --- 监听数据事件 ---
        socket.on('data', (data: Buffer) => {
            logger.debug(`[TCP Connector] Raw data received from ${connectionId}`);
            // --- 发布原始数据事件 ---
            eventBus.emit('tcp:rawDataReceived', { connectionId, data });
        });

        // --- 监听关闭事件 ---
        socket.on('close', (hadError: boolean) => {
            logger.warn(`[TCP Connector] Connection closed: ${connectionId} (hadError: ${hadError})`);
            delete this.activeConnections[connectionId];
            
            // --- 发布连接断开事件 ---
            eventBus.emit('tcp:disconnected', { connectionId });

            // 如果是低端口断开了，则启动重连机制
            if (connectionId.startsWith('lower_')) {
                this.lowerPortClient?.destroy();
                this.lowerPortClient = null;
                this.scheduleLowerPortReconnect();
            }
        });

        socket.on('error', (err) => {
            // 确保错误被记录，close事件会处理后续
            logger.error(`[TCP Connector] Socket-level error on ${connectionId}: ${err.message}`);
        });
    }

    /**
     * 安排低端口的重连
     */
    private scheduleLowerPortReconnect(): void {
        if (this.lowerPortRetryTimeout) {
            clearTimeout(this.lowerPortRetryTimeout);
        }

        const retryDelay = 5000; // 5秒后重连
        logger.info(`[TCP Connector] Scheduling reconnect to Lower Port in ${retryDelay / 1000} seconds...`);
        
        this.lowerPortRetryTimeout = setTimeout(() => {
            this.lowerPortRetryTimeout = null;
            this.connectLowerPort();
        }, retryDelay);
    }
}
