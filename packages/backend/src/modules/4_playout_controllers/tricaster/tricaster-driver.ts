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
import type { DeviceCommand } from '../../3_domain_engine/engine/resolver'

// ─── 事件类型 ─────────────────────────────────────────────────────────────────

export interface TricasterDriverEvents {
    statusChanged: (status: TricasterConnectionStatus) => void
}

// ─── TricasterDriver ──────────────────────────────────────────────────────────

export class TricasterDriver extends EventEmitter<TricasterDriverEvents> {

    private _lastOnAirPartId: string | null = null

    init(): void {
        // 监听 State Loop 输出的命令集
        rundownEngine.on('commandsReady', (commands) => {
            this._dispatchCommands(commands)
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

    private _dispatchCommands(commands: DeviceCommand[]): void {
        for (const cmd of commands) {
            logger.info(`[TricasterDriver] Dispatching: ${cmd.shortcut}${cmd.value ? ` = ${cmd.value}` : ''} (layer: ${cmd.layer})`)
            tricasterClient.sendShortcut(cmd.shortcut, cmd.value)
        }
    }

    // ── 状态查询 ──────────────────────────────────────────────────────────────

    get connectionStatus(): TricasterConnectionStatus {
        return tricasterClient.overallStatus
    }
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const tricasterDriver = new TricasterDriver()