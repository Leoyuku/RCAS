/**
 * @fileoverview RuntimeOverrideStore — Part 级别运行时覆盖的内存存储
 *
 * 职责：
 * - 维护 partId → PartOverride 的内存 Map
 * - 提供 set / clear / get / getAll 接口
 *
 * 不持久化：覆盖是导播的临时操作意图，系统重启后节目单由 NCS 重新推送，
 * 覆盖自然失效，不需要跨重启保留。
 *
 * 生命周期边界：
 * - NCS 推新节目单 → 旧 partId 消失 → 覆盖自然失效（Map.get 返回 undefined）
 * - 导播主动右键清除 → 调用 clear()
 * - 不需要 used 标记，不需要定时清除
 */

import { logger } from '../../shared/logger'

export interface PartOverride {
    partId: string
    sourceId: string
    ddrFile?: string      // ← 新增：DDR 覆盖时的文件路径
    createdAt: number
}

class RuntimeOverrideStore {
    private _overrides = new Map<string, PartOverride>()

    set(partId: string, sourceId: string, ddrFile?: string): PartOverride {
        const override: PartOverride = { partId, sourceId, ddrFile, createdAt: Date.now() }
        this._overrides.set(partId, override)
        logger.info(`[RuntimeOverrideStore] Set override: part="${partId}" → source="${sourceId}"${ddrFile ? ` file="${ddrFile}"` : ''}`)
        return override
    }

    clear(partId: string): boolean {
        const existed = this._overrides.has(partId)
        this._overrides.delete(partId)
        if (existed) logger.info(`[RuntimeOverrideStore] Cleared override: part="${partId}"`)
        return existed
    }

    get(partId: string): PartOverride | undefined {
        return this._overrides.get(partId)
    }

    getAll(): PartOverride[] {
        return Array.from(this._overrides.values())
    }
}

export const runtimeOverrideStore = new RuntimeOverrideStore()