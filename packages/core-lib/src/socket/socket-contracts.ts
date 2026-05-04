/**
 * @file socket-contracts.ts
 * @description 前后端 Socket.io 通信契约。
 *
 * 这是唯一真相来源（Single Source of Truth）。
 * 后端 socket-server.ts 和前端 store 都从这里引入，永远不会漂移。
 *
 * 依赖关系：
 *   core-lib  ←  backend (socket-server.ts)
 *   core-lib  ←  frontend (store)
 *   backend   ✗  frontend  （禁止直接依赖）
 * 后端 socket-server.ts 和前端 store 都从这里引入，永远不会漂移。
 */

import { IRundown } from '../models/rundown-model';  // ← 唯一改动，../ 而不是 ./
import { IPart } from '../models/part-model';

// ─── Rundown 生命周期状态 ─────────────────────────────────────────────────────

export type LifecycleStatus = 'persisted' | 'standby' | 'active' | 'on-air';

// ─── Rundown 摘要（列表展示用） ───────────────────────────────────────────────

export interface RundownSummary {
    id:           string;
    name:         string;
    lifecycle:    LifecycleStatus;
    segmentCount: number;
}

// ─── Socket 事件契约 ──────────────────────────────────────────────────────────

export interface ServerToClientEvents {
    snapshot:            (payload: { summaries: RundownSummary[] }) => void;
    'rundown:created':   (payload: { id: string; rundown: IRundown; lifecycle: LifecycleStatus }) => void;
    'rundown:updated':   (payload: { id: string; rundown: IRundown }) => void;
    'rundown:deleted':   (payload: { id: string }) => void;
    'rundown:activated': (payload: { id: string; rundown: IRundown }) => void;
    'rundown:standby':   (payload: { id: string }) => void;
    'runtime:state': (payload: RundownRuntime) => void;
    'rundown:lifecycle': (payload: { id: string; lifecycle: LifecycleStatus }) => void;
    'device:status': (payload: { tricaster: DeviceConnectionStatus }) => void;
    'runtime:overrides': (payload: {
        overrides: Array<{ partId: string; sourceId: string; ddrFile?: string; createdAt: number }>
    }) => void;
    'runtime:tempParts': (payload: {
        tempParts: Record<string, { parts: Record<string, IPart>; order: string[] }>
    }) => void;
    }

export interface ClientToServerEvents {
    activate: (
        payload: { id: string },
        callback?: (result: { ok: boolean; error?: string }) => void
    ) => void;

    'intent:run': (callback?: (result: { ok: boolean; error?: string }) => void) => void;
    'intent:stop': (callback: (result: { ok: boolean; error?: string }) => void) => void
    'intent:take':          (callback?: (result: { ok: boolean; error?: string }) => void) => void;
    'intent:sendToPreview': (callback?: (result: { ok: boolean; error?: string }) => void) => void;
    'intent:setNext':       (payload: { partId: string }, callback?: (result: { ok: boolean; error?: string }) => void) => void;
    'intent:setPartOverride': (
    payload: { partId: string; sourceId: string; ddrFile?: string },
    callback?: (result: { ok: boolean; error?: string }) => void
    ) => void;

    'intent:clearPartOverride': (
        payload: { partId: string },
        callback?: (result: { ok: boolean; error?: string }) => void
    ) => void;

    'intent:insertTempPart': (
        payload: { segmentId: string; sourceId: string; order: string[] },
        callback?: (result: { ok: boolean; error?: string }) => void
    ) => void;

    'intent:removeTempPart': (
        payload: { partId: string },
        callback?: (result: { ok: boolean; error?: string }) => void
    ) => void;
}

// ─── Runtime Engine 状态 ─────────────────────────────────────────────────────

/**
 * Engine 状态机的六个核心状态
 */
export type EngineState = 'STOPPED' | 'READY' | 'RUNNING' | 'TAKING' | 'TRANSITION' | 'ERROR'

/**
 * Runtime 状态快照（服务端维护，推送给前端）
 */
export interface RundownRuntime {
    rundownId:     string
    engineState:   EngineState
    onAirPartId:   string | null
    previewPartId: string | null
    nextPartId:    string | null
    // ── 时间统计（v21）──────────────────────────────────────
    /** 当前故事 onAir 开始时间戳（ms），用于前端计算实际播出时长 */
    onAirAt?: number
    /** 已完成故事的偏差累计（ms），正数=累计超时，负数=累计提前 */
    accumFinishedDiffMs?: number

    /** 临时插入的 Part ID 集合 */
    tempPartIds?: string[]
}

// ─── 设备连接状态（与 tricaster-client.ts 保持一致，core-lib 本地声明） ──────
export type DeviceConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR'