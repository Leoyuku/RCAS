/**
 * @fileoverview Socket.io 实时推送层
 *
 * 职责：
 * - 接管 HTTP server，初始化 socket.io
 * - 监听 RundownStore 的业务事件，实时推送给已连接的前端客户端
 * - 前端连接时立即推送全量摘要快照
 * - 连接/断开事件记录日志
 *
 * 推送事件清单（服务端 → 前端）：
 *   snapshot                连接成功后的快照 { summaries: RundownSummary[] }
 *   rundown:created         Rundown 创建  { id, rundown, lifecycle }
 *   rundown:updated         Rundown 更新  { id, rundown }
 *   rundown:deleted         Rundown 删除  { id }
 *   rundown:activated       Rundown 激活  { id, rundown }
 *   rundown:standby         Rundown 待命  { id }
 *   rundown:lifecycle       生命周期变化  { id, lifecycle }
 *
 * 接收事件清单（前端 → 服务端）：
 *   activate                导播请求激活某个 Rundown  { id }
 */

import { rundownEngine } from '../engine/rundown-engine';
import { Server as HttpServer }             from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { rundownStore }                     from './rundown-store';
import { runtimeOverrideStore } from '../../4_playout_controllers/runtime-override-store'
import { logger }                           from '../../../shared/logger';
import { ServerToClientEvents, ClientToServerEvents } from '../../../../../core-lib/src/socket/socket-contracts';
import { tricasterDriver } from '../../4_playout_controllers/tricaster/tricaster-driver'

// ─── 类型定义（前端可复用） ───────────────────────────────────────────────────

/* export interface ServerToClientEvents {
    snapshot:              (payload: { summaries: RundownSummary[] }) => void;
    'rundown:created':     (payload: { id: string; rundown: IRundown; lifecycle: LifecycleStatus }) => void;
    'rundown:updated':     (payload: { id: string; rundown: IRundown }) => void;
    'rundown:deleted':     (payload: { id: string }) => void;
    'rundown:activated':   (payload: { id: string; rundown: IRundown }) => void;
    'rundown:standby':     (payload: { id: string }) => void;
    'rundown:lifecycle':   (payload: { id: string; lifecycle: LifecycleStatus }) => void;
}

export interface ClientToServerEvents {
    activate: (payload: { id: string }, callback?: (result: { ok: boolean; error?: string }) => void) => void;
} */

// ─── SocketServer 类 ──────────────────────────────────────────────────────────

export class SocketServer {
    private _io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

    constructor(httpServer: HttpServer) {
        this._io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
            cors: {
                origin: process.env.SOCKET_CORS_ORIGIN || '*',
                methods: ['GET', 'POST'],
            },
            pingTimeout:  10000,
            pingInterval: 5000,
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

            // 连接后立即推送全量摘要快照（含 persisted 的）
            const summaries = rundownStore.getAllSummaries();
            // 连接后立即推送全量摘要快照
            socket.emit('snapshot', { summaries });

            // 补推当前覆盖状态
            const currentOverrides = runtimeOverrideStore.getAll()
            if (currentOverrides.length > 0) {
                // 补推 Tricaster 当前连接状态
                socket.emit('device:status', { tricaster: tricasterDriver.connectionStatus })
                // 补推当前覆盖状态
                socket.emit('runtime:overrides', { overrides: currentOverrides })
            }

            // 如果当前有 active/on-air 的 Rundown（runtime-snapshot 恢复的情况）
            // 补推完整数据，前端才能渲染详细列表
            const activeRundown = rundownStore.getActiveRundown();
            if (activeRundown) {
                const lifecycle = rundownStore.getLifecycle(activeRundown._id) ?? 'active';
                socket.emit('rundown:activated', {
                    id: activeRundown._id,
                    rundown: activeRundown,
                });
            }
            logger.debug(`[SocketServer] Sent snapshot to ${clientID}: ${summaries.length} rundown(s)`);

            // 处理前端激活请求
            socket.on('activate', (payload, callback) => {
                logger.info(`[SocketServer] Activate request from ${clientID}: "${payload?.id}"`);
                const ok = rundownStore.activate(payload?.id);
                if (callback) callback(ok ? { ok: true } : { ok: false, error: `Rundown "${payload?.id}" not found` });
            });

            socket.on('disconnect', (reason) => {
                logger.info(`[SocketServer] Client disconnected: ${clientID}, reason: ${reason}, remaining: ${this._io.engine.clientsCount}`);
            });

            socket.on('error', (err) => {
                logger.error(`[SocketServer] Socket error from ${clientID}:`, { message: err.message });
            });

            // intent: TAKE
            socket.on('intent:take', (callback) => {
                logger.info(`[SocketServer] intent:take from ${clientID}`);
                const result = rundownEngine.intentTake();
                if (callback) callback(result);
            });

            // intent: RUN
            socket.on('intent:run', (callback) => {
                logger.info(`[SocketServer] intent:run from ${clientID}`)
                const result = rundownEngine.intentRun()
                if (callback) callback(result)
            })

            // intent: SEND TO PREVIEW
            socket.on('intent:sendToPreview', (callback) => {
                logger.info(`[SocketServer] intent:sendToPreview from ${clientID}`);
                const result = rundownEngine.intentSendToPreview();
                if (callback) callback(result);
            });

            // intent: SET NEXT
            socket.on('intent:setNext', (payload, callback) => {
                logger.info(`[SocketServer] intent:setNext from ${clientID}: "${payload?.partId}"`);
                const result = rundownEngine.intentSetNext(payload?.partId);
                if (callback) callback(result);
            });

            // intent: SET PART OVERRIDE
            socket.on('intent:setPartOverride', (payload, callback) => {
                logger.info(`[SocketServer] intent:setPartOverride from ${clientID}: part="${payload?.partId}" → source="${payload?.sourceId}"`)
                if (!payload?.partId || !payload?.sourceId) {
                    if (callback) callback({ ok: false, error: 'partId and sourceId are required' })
                    return
                }
                runtimeOverrideStore.set(payload.partId, payload.sourceId)
                // 广播最新覆盖状态给所有客户端（多端同步）
                this._io.emit('runtime:overrides', { overrides: runtimeOverrideStore.getAll() })
                if (callback) callback({ ok: true })
            })

            // intent: CLEAR PART OVERRIDE
            socket.on('intent:clearPartOverride', (payload, callback) => {
                logger.info(`[SocketServer] intent:clearPartOverride from ${clientID}: part="${payload?.partId}"`)
                if (!payload?.partId) {
                    if (callback) callback({ ok: false, error: 'partId is required' })
                    return
                }
                runtimeOverrideStore.clear(payload.partId)
                this._io.emit('runtime:overrides', { overrides: runtimeOverrideStore.getAll() })
                if (callback) callback({ ok: true })
            })
        });
    }

    // ── 订阅 RundownStore 事件 ────────────────────────────────────────────────

    private _subscribeToStore(): void {

        rundownStore.on('rundownCreated', (id, rundown) => {
            const lifecycle = rundownStore.getLifecycle(id) ?? 'standby';
            logger.debug(`[SocketServer] Broadcasting rundown:created → ${id} (${lifecycle})`);
            this._io.emit('rundown:created', { id, rundown, lifecycle });
        });

        rundownStore.on('rundownUpdated', (id, rundown) => {
            logger.debug(`[SocketServer] Broadcasting rundown:updated → ${id}`);
            this._io.emit('rundown:updated', { id, rundown });
        });

        rundownStore.on('rundownDeleted', (id) => {
            logger.debug(`[SocketServer] Broadcasting rundown:deleted → ${id}`);
            this._io.emit('rundown:deleted', { id });
        });

        rundownStore.on('rundownActivated', (id, rundown) => {
            logger.debug(`[SocketServer] Broadcasting rundown:activated → ${id}`);
            this._io.emit('rundown:activated', { id, rundown });
        });

        rundownStore.on('rundownStandby', (id) => {
            logger.debug(`[SocketServer] Broadcasting rundown:standby → ${id}`);
            this._io.emit('rundown:standby', { id });
        });

        rundownStore.on('lifecycleChanged', (id, lifecycle) => {
            logger.debug(`[SocketServer] Broadcasting rundown:lifecycle → ${id} (${lifecycle})`);
            this._io.emit('rundown:lifecycle', { id, lifecycle });
        });

        // 订阅 Tricaster 连接状态变化
        tricasterDriver.on('statusChanged', (status) => {
            logger.debug(`[SocketServer] Broadcasting device:status → tricaster: ${status}`)
            this._io.emit('device:status', { tricaster: status })
        })

        // 订阅 engine runtime 变化，推送给所有前端客户端
        rundownEngine.on('runtimeChanged', (runtime) => {
            logger.debug(`[SocketServer] Broadcasting runtime:state → engineState: ${runtime.engineState}`);
            this._io.emit('runtime:state', runtime);
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