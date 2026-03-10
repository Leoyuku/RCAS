/**
 * @fileoverview TricasterDriver — 连接 RundownEngine 与 TricasterClient
 *
 * 职责：
 * - 监听 RundownEngine 的 runtimeChanged 事件
 * - 根据 runtime 状态变化，决定发送哪些 shortcut 命令
 * - 维护并上报 DriverStatus 给前端
 *
 * 第三轮范围（当前）：
 *   ✅ TAKE → main_background_take shortcut
 *   ✅ onAirPartId 变化 → 连接状态上报
 *   ❌ Timeline Builder / Resolver（第四轮补全）
 */

import { EventEmitter }      from 'eventemitter3'
import { tricasterClient, TricasterConnectionStatus } from './tricaster-client'
import { rundownEngine }     from '../../3_domain_engine/engine/rundown-engine'
import { logger }            from '../../../shared/logger'
import type { RundownRuntime } from '../../../../../core-lib/src/socket/socket-contracts'

// ─── 事件类型 ─────────────────────────────────────────────────────────────────

export interface TricasterDriverEvents {
    statusChanged: (status: TricasterConnectionStatus) => void
}

// ─── TricasterDriver ──────────────────────────────────────────────────────────

export class TricasterDriver extends EventEmitter<TricasterDriverEvents> {

    private _lastOnAirPartId: string | null = null

    init(): void {
        // 监听 engine runtime 变化
        rundownEngine.on('runtimeChanged', (runtime) => {
            this._onRuntimeChanged(runtime)
        })

        // 监听 Tricaster 连接状态变化，转发给上层
        tricasterClient.on('statusChanged', (status) => {
            logger.info(`[TricasterDriver] Connection status: ${status}`)
            this.emit('statusChanged', status)
        })

        // 监听 Tricaster 状态通知
        tricasterClient.on('stateChanged', (key, data) => {
            logger.debug(`[TricasterDriver] State notification: ${key}`)
        })

        // 启动连接
        tricasterClient.connect()

        logger.info('[TricasterDriver] Initialized.')
    }

    // ── Runtime 变化处理 ──────────────────────────────────────────────────────

    private _onRuntimeChanged(runtime: RundownRuntime): void {

        // onAirPartId 发生变化 → 执行 TAKE
        if (runtime.onAirPartId !== null &&
            runtime.onAirPartId !== this._lastOnAirPartId) {

            logger.info(`[TricasterDriver] TAKE detected: "${runtime.onAirPartId}" → sending main_background_take`)
            const ok = tricasterClient.sendShortcut('main_background_take')

            if (ok) {
                logger.info('[TricasterDriver] main_background_take sent ✅')
            } else {
                logger.warn('[TricasterDriver] main_background_take failed — Tricaster not connected')
            }

            this._lastOnAirPartId = runtime.onAirPartId
        }
    }

    // ── 状态查询 ──────────────────────────────────────────────────────────────

    get connectionStatus(): TricasterConnectionStatus {
        return tricasterClient.overallStatus
    }
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const tricasterDriver = new TricasterDriver()