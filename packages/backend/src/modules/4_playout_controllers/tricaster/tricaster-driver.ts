/**
 * @fileoverview TricasterDriver — 连接 PlayoutController 与 TricasterClient
 *
 * 职责：
 * - 实现 ISwitcherDriver 接口，供 PlayoutController 调用
 * - 维护 switcherMap：sourceId → { switcherName, previewSrc }
 *   （从 Tricaster /v1/dictionary?key=switcher 动态查询，不手动维护）
 * - 监听 change_notifications "switcher" key，自动更新映射表
 * - 暴露 getSwitcherSlots() 供 /api/device/inputs 接口使用
 *
 * v11 改动：
 * - 删除 commandsReady 死代码（Timeline/Resolver 路径已废弃）
 * - 新增 switcherMap 动态查询和 diff 逻辑
 * - stateChanged handler 接入真实逻辑
 * - 新增 normalizeSourceId（本地用，与 core-lib source-utils 保持一致）
 */

import { EventEmitter } from 'eventemitter3'
import { tricasterClient, TricasterConnectionStatus } from './tricaster-client'
import { deviceConfigService } from '../config/device-config.service'
import { logger } from '../../../shared/logger'
import type { SourceConfig } from '../interfaces/device-config'

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

/** switcherMap 中每个槽位的信息（仅静态配置字段） */
export interface SwitcherSlot {
    /** Tricaster iso_label 原始值，直接用于 shortcut 命令的 value */
    switcherName: string
    /** 预览帧 WebSocket 的 name 参数，由 physical_input_number 转小写得来 */
    previewSrc: string
    /** physical_input_number 原始值，保留用于诊断 */
    physicalInput: string
}

export interface TricasterDriverEvents {
    statusChanged: (status: TricasterConnectionStatus) => void
    /** switcherMap 更新时触发，payload 是最新的完整 map */
    switcherMapUpdated: (map: Map<string, SwitcherSlot>) => void
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * sourceId 归一化：去除所有空格，转大写
 * 与 core-lib/src/utils/source-utils.ts 中的 normalizeSourceId 保持一致
 * 后端本地复制一份，避免跨包 import 的路径复杂度
 *
 * 示例："CAM 1" → "CAM1"，"cam1" → "CAM1"
 */
function normalizeSourceId(id: string): string {
    return id.replace(/\s+/g, '').toUpperCase()
}

// ─── TricasterDriver ──────────────────────────────────────────────────────────

export class TricasterDriver extends EventEmitter<TricasterDriverEvents> {
    /**
     * 动态映射表：归一化 sourceId → SwitcherSlot
     * key 示例："CAM1"（由 iso_label "CAM 1" 归一化得来）
     * 启动时从 Tricaster 查询建立，change_notifications 触发时自动更新
     */
    private _switcherMap: Map<string, SwitcherSlot> = new Map()

    /** 上次 switcherMap 的序列化快照，用于 diff 比较 */
    private _lastSwitcherMapSnapshot: string = ''

    // ── 初始化 ────────────────────────────────────────────────────────────────

    init(): void {
        // 监听 Tricaster 连接状态变化，转发给上层
        tricasterClient.on('statusChanged', (status) => {
            logger.info(`[TricasterDriver] Connection status: ${status}`)
            this.emit('statusChanged', status)

            // 控制通道连接成功后，立即查询一次 switcherMap
            // （通知通道可能稍晚连接，不等它）
            if (status === 'CONNECTED') {
                this._fetchAndUpdateSwitcherMap()
            }
        })

        // 监听 change_notifications，处理 "switcher" key
        tricasterClient.on('stateChanged', (key) => {
            if (key === 'switcher') {
                logger.debug('[TricasterDriver] Received switcher change notification, refreshing map...')
                this._fetchAndUpdateSwitcherMap()
            }
            // 其他 key（tally / ddr_playlist 等）由后续模块处理
        })

        // 启动连接
        tricasterClient.connect()
        logger.info('[TricasterDriver] Initialized.')
    }

    // ── ISwitcherDriver 接口实现 ──────────────────────────────────────────────

    /**
     * 设置预监源
     * @param sourceId NCS 侧的 sourceId（如 "CAM1"，或已有覆盖的 sourceId）
     */
    async setPreview(sourceId: string): Promise<void> {
        const slot = this._resolveSlot(sourceId)
        if (!slot) {
            logger.warn(`[TricasterDriver] setPreview: sourceId "${sourceId}" not found in switcherMap`)
            return
        }
        // shortcut: main_b_row_named_input，value 用 iso_label 原始值
        tricasterClient.sendShortcut('main_b_row_named_input', slot.switcherName)
    }

    /**
     * 执行 TAKE（PGM ↔ PVW 互换）
     * TAKE 本质是切换动作，与具体 source 无关
     */
    async take(): Promise<void> {
        tricasterClient.sendShortcut('main_background_take')
    }

    // ── 查询接口（供 /api/device/inputs 使用） ────────────────────────────────

    /**
     * 返回当前所有已知的 Tricaster 槽位（完整 switcherMap）
     * 供前端"添加源"流程使用：展示所有可用槽位，过滤掉已配置的
     */
    getSwitcherSlots(): Map<string, SwitcherSlot> {
        return new Map(this._switcherMap) // 返回副本，防止外部修改
    }

    /**
     * 根据 sourceId 查找槽位信息
     * 支持归一化匹配（"CAM1" 和 "CAM 1" 都能找到）
     */
    getSlot(sourceId: string): SwitcherSlot | undefined {
        return this._resolveSlot(sourceId)
    }

    // ── 状态查询 ──────────────────────────────────────────────────────────────

    get connectionStatus(): TricasterConnectionStatus {
        return tricasterClient.overallStatus
    }

    // ── 私有：动态查询和更新 switcherMap ─────────────────────────────────────

    /**
     * 从 Tricaster 查询 /v1/dictionary?key=switcher
     * 解析 XML，提取静态槽位信息，与缓存 diff，有变化才更新
     */
    private async _fetchAndUpdateSwitcherMap(): Promise<void> {
        try {
            const parsed = await tricasterClient.fetchState('switcher')
            if (!parsed) {
                logger.warn('[TricasterDriver] fetchState("switcher") returned null')
                return
            }

            const newMap = this._parseSwitcherXml(parsed)
            if (newMap.size === 0) {
                logger.warn('[TricasterDriver] Parsed switcher map is empty, skipping update')
                return
            }

            // Diff：只比较静态配置字段，忽略运行时状态（main_source / preview_source 等）
            const snapshot = this._serializeMapForDiff(newMap)
            if (snapshot === this._lastSwitcherMapSnapshot) {
                logger.debug('[TricasterDriver] switcherMap unchanged, skipping update')
                return
            }

            // 有变化：更新映射表
            this._switcherMap = newMap
            this._lastSwitcherMapSnapshot = snapshot
            logger.info(`[TricasterDriver] switcherMap updated: ${newMap.size} slots`)
            newMap.forEach((slot, key) => {
                logger.debug(`  ${key} → switcherName="${slot.switcherName}", previewSrc="${slot.previewSrc}"`)
            })

            // 通知 DeviceConfigService 更新 sources 中的动态字段
            this._syncToDeviceConfig(newMap)

            // 触发事件，供其他模块监听
            this.emit('switcherMapUpdated', new Map(newMap))

        } catch (err: any) {
            logger.warn(`[TricasterDriver] _fetchAndUpdateSwitcherMap error: ${err.message}`)
        }
    }

    /**
     * 解析 fast-xml-parser 返回的 switcher 对象
     * 提取每个 input 槽位的静态配置字段
     *
     * Tricaster XML 结构（参考文档）：
     * <switcher_update main_source="..." preview_source="..." ...>
     *   <inputs>
     *     <input iso_label="CAM 1" physical_input_number="Input1" button_label="1" .../>
     *     <input iso_label="CAM 2" physical_input_number="Input2" .../>
     *     ...
     *   </inputs>
     * </switcher_update>
     *
     * 注意：实际 XML 结构需联调后验证，这里按文档最可能的格式解析
     * 如果字段路径与实际不符，调整 _extractInputs() 即可，上层逻辑不变
     */
    private _parseSwitcherXml(parsed: any): Map<string, SwitcherSlot> {
        const map = new Map<string, SwitcherSlot>()

        const inputs = this._extractInputs(parsed)
        if (!inputs || inputs.length === 0) {
            logger.warn('[TricasterDriver] No inputs found in switcher XML')
            return map
        }

        for (const input of inputs) {
            const isoLabel: string = input['iso_label'] ?? input['isoLabel'] ?? ''
            const physicalInput: string = input['physical_input_number'] ?? input['physicalInputNumber'] ?? ''

            if (!isoLabel || !physicalInput) continue

            // 过滤非摄像机槽位（BFR / DDR / GFX 等暂不纳入 switcherMap）
            // 联调后根据实际槽位名称调整过滤规则
            // 目前保留所有槽位，由上层决定使用哪些
            const key = normalizeSourceId(isoLabel)
            const previewSrc = physicalInput.toLowerCase() // "Input1" → "input1"

            map.set(key, {
                switcherName: isoLabel,   // 保留原始值，发给 Tricaster 的命令用这个
                previewSrc,
                physicalInput,
            })
        }

        return map
    }

    /**
     * 从解析后的对象中提取 input 数组
     * 隔离 XML 结构的不确定性，联调后如果路径不对只改这一处
     */
    private _extractInputs(parsed: any): any[] | null {
        const candidates = [
            parsed?.switcher_update?.inputs?.physical_input,
            parsed?.switcher_update?.inputs?.input,
            parsed?.switcher?.inputs?.physical_input,
            parsed?.inputs?.physical_input,
        ]
    
        for (const candidate of candidates) {
            if (!candidate) continue
            return Array.isArray(candidate) ? candidate : [candidate]
        }
    
        return null
    }

    /**
     * 序列化 map 用于 diff 比较
     * 只序列化静态字段（switcherName / previewSrc / physicalInput）
     * 不包含运行时状态，确保 TAKE 触发的 switcher 通知不会导致无意义更新
     */
    private _serializeMapForDiff(map: Map<string, SwitcherSlot>): string {
        const entries = [...map.entries()]
            .sort(([a], [b]) => a.localeCompare(b)) // 排序保证稳定性
            .map(([key, slot]) => `${key}:${slot.switcherName}:${slot.previewSrc}`)
        return entries.join('|')
    }

    /**
     * 将动态查询到的 switcherName / previewSrc 同步到 DeviceConfigService
     * 只更新已在 device-config.json sources 中配置的条目
     * 不自动新增，不修改 type / label 等手动配置字段
     */
    private _syncToDeviceConfig(map: Map<string, SwitcherSlot>): void {
        try {
            const config = deviceConfigService.getConfig()
            let changed = false

            for (const [sourceId, source] of Object.entries(config.sources)) {
                if (source.type !== 'camera') continue // 只处理 camera 类型

                const slot = map.get(normalizeSourceId(sourceId))
                if (!slot) continue

                // 检查是否有变化
                if (source.switcherName !== slot.switcherName || source.previewSrc !== slot.previewSrc) {
                    (config.sources[sourceId] as SourceConfig).switcherName = slot.switcherName
                        ; (config.sources[sourceId] as SourceConfig).previewSrc = slot.previewSrc
                    changed = true
                    logger.info(`[TricasterDriver] Updated source "${sourceId}": switcherName="${slot.switcherName}", previewSrc="${slot.previewSrc}"`)
                }
            }

            if (changed) {
                // 用 saveConfig 持久化并触发 onChange 监听器（通知前端）
                deviceConfigService.saveConfig(config, 'auto-sync-from-tricaster')
            }
        } catch (err: any) {
            logger.warn(`[TricasterDriver] _syncToDeviceConfig error: ${err.message}`)
        }
    }

    /**
     * 查找槽位，支持归一化匹配
     */
    private _resolveSlot(sourceId: string): SwitcherSlot | undefined {
        return this._switcherMap.get(normalizeSourceId(sourceId))
    }
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const tricasterDriver = new TricasterDriver()