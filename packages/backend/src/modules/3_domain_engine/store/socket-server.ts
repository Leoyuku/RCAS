/**
 * @fileoverview Socket.io 实时推送层
 *
 * 职责：
 * - 接管 HTTP server，初始化 socket.io
 * - 监听 RundownStore 的业务事件，实时推送给已连接的前端客户端
 * - 前端连接时立即推送全量快照（防止页面空白）
 * - 连接/断开事件记录日志
 *
 * 推送事件清单（前端监听）：
 *   snapshot              连接成功后的全量快照 { rundowns: IRundown[] }
 *   rundown:created       Rundown 创建  { id, rundown }
 *   rundown:updated       Rundown 更新  { id, rundown }
 *   rundown:deleted       Rundown 删除  { id }
 */

import { Server as HttpServer }               from 'http';
import { Server as SocketIOServer, Socket }   from 'socket.io';
import { rundownStore }                        from './rundown-store';
import { logger }                              from '../../../shared/logger';
import { IRundown }                            from '../../../../../core-lib/src/models/rundown-model';

// ─── 类型定义（前端可复用） ───────────────────────────────────────────────────

export interface ServerToClientEvents {
    snapshot:            (payload: { rundowns: IRundown[] }) => void;
    'rundown:created':   (payload: { id: string; rundown: IRundown }) => void;
    'rundown:updated':   (payload: { id: string; rundown: IRundown }) => void;
    'rundown:deleted':   (payload: { id: string }) => void;
}

export interface ClientToServerEvents {
    // 前端目前只监听，不需要向服务端发送事件
    // 预留接口，后续可扩展（如前端请求特定 Rundown）
}

// ─── SocketServer 类 ──────────────────────────────────────────────────────────

export class SocketServer {
    private _io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

    constructor(httpServer: HttpServer) {
        this._io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
            cors: {
                origin: process.env.SOCKET_CORS_ORIGIN || '*',
                methods: ['GET', 'POST'],
            },
            // 心跳配置：保持连接健康，快速检测断线
            pingTimeout:  10000, // 10s 无响应则断开
            pingInterval: 5000,  // 每 5s 发一次心跳
        });

        this._setupConnectionHandler();
        this._subscribeToStore();

        logger.info('[SocketServer] Initialized. Waiting for client connections.');
    }

    // ── 连接处理 ──────────────────────────────────────────────────────────────

    private _setupConnectionHandler(): void {
        this._io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
            const clientID = socket.id;
            const clientIP = socket.handshake.address;

            logger.info(`[SocketServer] Client connected: ${clientID} (${clientIP}), total: ${this._io.engine.clientsCount}`);

            // 连接后立即推送全量快照
            const snapshot = rundownStore.getAllRundowns();
            socket.emit('snapshot', { rundowns: snapshot });
            logger.debug(`[SocketServer] Sent snapshot to ${clientID}: ${snapshot.length} rundown(s)`);

            socket.on('disconnect', (reason) => {
                logger.info(`[SocketServer] Client disconnected: ${clientID}, reason: ${reason}, remaining: ${this._io.engine.clientsCount}`);
            });

            socket.on('error', (err) => {
                logger.error(`[SocketServer] Socket error from ${clientID}:`, {
                    message: err.message,
                });
            });
        });
    }

    // ── 订阅 RundownStore 事件 ────────────────────────────────────────────────

    private _subscribeToStore(): void {

        rundownStore.on('rundownCreated', (id, rundown) => {
            logger.debug(`[SocketServer] Broadcasting rundown:created → ${id}`);
            this._io.emit('rundown:created', { id, rundown });
        });

        rundownStore.on('rundownUpdated', (id, rundown) => {
            logger.debug(`[SocketServer] Broadcasting rundown:updated → ${id}`);
            this._io.emit('rundown:updated', { id, rundown });
        });

        rundownStore.on('rundownDeleted', (id) => {
            logger.debug(`[SocketServer] Broadcasting rundown:deleted → ${id}`);
            this._io.emit('rundown:deleted', { id });
        });
    }

    // ── 工具方法 ──────────────────────────────────────────────────────────────

    get clientCount(): number {
        return this._io.engine.clientsCount;
    }

    async close(): Promise<void> {
        return new Promise((resolve) => {
            this._io.close(() => resolve());
        });
    }
}