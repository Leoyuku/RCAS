/**
 * @fileoverview Socket.io 实时推送层
 *
 * 职责：
 * - 接管 HTTP server，初始化 socket.io
 * - 监听 RundownStore 的所有事件，实时推送给已连接的前端客户端
 * - 前端连接时立即推送全量快照（防止页面空白）
 * - 连接/断开事件记录日志
 *
 * 推送事件清单（前端监听）：
 *   snapshot              连接成功后的全量快照 { rundowns: IMOSRunningOrder[] }
 *   ro:created            RO 创建  { roID, ro }
 *   ro:replaced           RO 替换  { roID, ro }
 *   ro:deleted            RO 删除  { roID }
 *   ro:metadata-updated   元数据更新 { roID }
 *   ro:status-changed     播出状态  { roID, status }
 *   ro:ready-to-air       上播状态  { roID, airStatus }
 *   ro:story-changed      Story 变更 { roID, changeType, ro }
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { rundownStore } from './rundown-store';
import { logger } from './logger';
import { IMOSRunningOrder } from '../modules/1_mos_connection/internals/model';
import { IMOSObjectAirStatus } from '../modules/1_mos_connection/internals/model';

// ─── 类型定义（前端可复用） ───────────────────────────────────────────────────

export interface ServerToClientEvents {
    snapshot:             (payload: { rundowns: IMOSRunningOrder[] }) => void;
    'ro:created':         (payload: { roID: string; ro: IMOSRunningOrder }) => void;
    'ro:replaced':        (payload: { roID: string; ro: IMOSRunningOrder }) => void;
    'ro:deleted':         (payload: { roID: string }) => void;
    'ro:metadata-updated':(payload: { roID: string }) => void;
    'ro:status-changed':  (payload: { roID: string; status: string }) => void;
    'ro:ready-to-air':    (payload: { roID: string; airStatus: IMOSObjectAirStatus }) => void;
    'ro:story-changed':   (payload: { roID: string; changeType: string; ro: IMOSRunningOrder | undefined }) => void;
}

export interface ClientToServerEvents {
    // 前端目前只监听，不需要向服务端发送事件
    // 预留接口，后续可扩展（如前端请求特定 RO）
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
            // 前端不会出现"连上了但数据为空"的情况
            const snapshot = rundownStore.getAllRundowns();
            socket.emit('snapshot', { rundowns: snapshot });
            logger.debug(`[SocketServer] Sent snapshot to ${clientID}: ${snapshot.length} RO(s)`);

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

        rundownStore.on('roCreated', (roID, ro) => {
            logger.debug(`[SocketServer] Broadcasting ro:created → ${roID}`);
            this._io.emit('ro:created', { roID, ro });
        });

        rundownStore.on('roReplaced', (roID, ro) => {
            logger.debug(`[SocketServer] Broadcasting ro:replaced → ${roID}`);
            this._io.emit('ro:replaced', { roID, ro });
        });

        rundownStore.on('roDeleted', (roID) => {
            logger.debug(`[SocketServer] Broadcasting ro:deleted → ${roID}`);
            this._io.emit('ro:deleted', { roID });
        });

        rundownStore.on('roMetadataUpdated', (roID) => {
            logger.debug(`[SocketServer] Broadcasting ro:metadata-updated → ${roID}`);
            this._io.emit('ro:metadata-updated', { roID });
        });

        rundownStore.on('roStatusChanged', (roID, status) => {
            logger.debug(`[SocketServer] Broadcasting ro:status-changed → ${roID} ${status}`);
            this._io.emit('ro:status-changed', { roID, status });
        });

        rundownStore.on('roReadyToAirChanged', (roID, airStatus) => {
            logger.debug(`[SocketServer] Broadcasting ro:ready-to-air → ${roID} ${airStatus}`);
            this._io.emit('ro:ready-to-air', { roID, airStatus });
        });

        // story 级别变更：同时推送更新后的完整 RO
        // 前端不需要自己再拼装，直接替换本地状态即可
        rundownStore.on('storyChanged', (roID, changeType) => {
            const ro = rundownStore.getRundown(roID);
            logger.debug(`[SocketServer] Broadcasting ro:story-changed → ${roID} (${changeType})`);
            this._io.emit('ro:story-changed', { roID, changeType, ro });
        });
    }

    // ── 对外接口 ──────────────────────────────────────────────────────────────

    /** 获取当前连接的客户端数量 */
    get clientCount(): number {
        return this._io.engine.clientsCount;
    }

    /** 优雅关闭 */
    async dispose(): Promise<void> {
        return new Promise((resolve) => {
            this._io.close(() => {
                logger.info('[SocketServer] Closed.');
                resolve();
            });
        });
    }
}