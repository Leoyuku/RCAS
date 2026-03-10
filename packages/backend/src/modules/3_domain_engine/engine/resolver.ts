/**
 * @fileoverview Resolver + Diff Engine
 *
 * 核心原则：纯函数，无副作用
 *   resolve(timelineObjects, now) → DesiredState
 *   diff(desiredState, lastSentState) → Command[]
 *
 * 规范 13.3：Resolver 算法
 *   - 同一 Layer 取 priority 最高的对象
 *   - priority 相同时取 startTime 最晚的（最新的优先）
 *   - 对象的 enable.start <= now < enable.start + enable.duration
 *
 * 规范 13.4：Diff Engine
 *   - diff(Desired, lastSentState) → 命令集（决定发哪些命令）
 *   - diff(Desired, Actual) → 检测状态分叉（可靠性验证）
 */

import type { ITimelineObject } from '../../../../../core-lib/src/models/timeline-model'
import { logger } from '../../../shared/logger'

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

/**
 * 单个 Layer 的期望状态
 */
export interface LayerState {
    shortcut:  string
    value?:    string
    objectId:  string
    priority:  number
    startTime: number
}

/**
 * 所有 Layer 的期望状态集合
 * key: layerId（如 'video.preview'、'video.take'）
 */
export type DesiredState = Map<string, LayerState>

/**
 * 设备命令
 */
export interface DeviceCommand {
    layer:    string
    shortcut: string
    value?:   string
    objectId: string
}

// ─── Resolver：纯函数 ─────────────────────────────────────────────────────────

/**
 * 从 TimelineObjects 计算当前时刻每个 Layer 的期望状态
 *
 * 算法：
 * 1. 过滤出当前时刻激活的对象（enable.start <= now < end）
 * 2. 按 Layer 分组
 * 3. 每个 Layer 取 priority 最高的，priority 相同取 startTime 最晚的
 */
export function resolve(
    objects:  ITimelineObject[],
    now:      number
): DesiredState {

    const desired: DesiredState = new Map()

    for (const obj of objects) {
        const { start, duration } = obj.enable

        // 过滤：当前时刻是否激活
        const startTime = typeof start === 'number' ? start : now
        const endTime   = duration !== undefined ? startTime + duration : Infinity

        if (now < startTime || now >= endTime) continue

        // 只处理 tricaster_shortcut 类型
        if (obj.content?.type !== 'tricaster_shortcut') continue

        const current = desired.get(obj.layer)

        // 取 priority 最高的，priority 相同取 startTime 最晚的
        if (!current ||
            obj.priority > current.priority ||
            (obj.priority === current.priority && startTime > current.startTime)
        ) {
            desired.set(obj.layer, {
                shortcut:  obj.content.shortcut,
                value:     obj.content.value,
                objectId:  obj.id,
                priority:  obj.priority,
                startTime,
            })
        }
    }

    logger.debug(`[Resolver] Resolved ${desired.size} active layers from ${objects.length} objects`)
    return desired
}

// ─── Diff Engine：纯函数 ──────────────────────────────────────────────────────

/**
 * 对比 desiredState 和 lastSentState，生成最小命令集
 *
 * 只发送"发生变化"的命令，避免重复发送相同状态
 */
export function diff(
    desired:       DesiredState,
    lastSentState: DesiredState
): DeviceCommand[] {

    const commands: DeviceCommand[] = []

    // 检查新增或变化的 Layer
    for (const [layer, state] of desired) {
        const last = lastSentState.get(layer)

        const changed = !last ||
            last.shortcut !== state.shortcut ||
            last.value    !== state.value

        if (changed) {
            commands.push({
                layer,
                shortcut: state.shortcut,
                value:    state.value,
                objectId: state.objectId,
            })
        }
    }

    // 检查消失的 Layer（需要清空）
    for (const [layer] of lastSentState) {
        if (!desired.has(layer)) {
            // Layer 消失了，不发命令（Tricaster 保持最后状态）
            logger.debug(`[DiffEngine] Layer "${layer}" disappeared, no clear command needed`)
        }
    }

    logger.debug(`[DiffEngine] ${commands.length} commands from diff`)
    return commands
}