/**
 * @fileoverview TricasterDriver — 实现 ISwitcherDriver
 *
 * 职责：
 * - 把 ISwitcherDriver 的抽象调用翻译成 Tricaster WebSocket shortcut 命令
 * - 所有参数（inputId、ddr、layer）由上层 PlayoutController 从 device-config 读取后传入
 * - 本文件内不出现任何写死的物理源名、IP、宏命令名
 *
 * 与 tricaster-client.ts 的分工：
 * - tricaster-client  = 协议层（WebSocket 连接管理、消息收发）
 * - tricaster-driver  = 语义层（把"dskOn(1)"翻译成正确的 shortcut 字符串）
 */

import { tricasterClient } from './tricaster-client'
import { logger } from '../../../shared/logger'
import type { ISwitcherDriver } from '../interfaces/device-drivers'
import type { SwitcherCapabilities } from '../interfaces/device-capabilities'
import type { SwitcherConfig, DeviceStatus, TallyState } from '../interfaces/device-config'

export class TricasterDriver implements ISwitcherDriver {

    readonly config: SwitcherConfig
    readonly capabilities: SwitcherCapabilities

    // Tally 订阅回调（从 stateChanged 事件派生）
    private _tallyCallback: ((t: TallyState) => void) | null = null

    // 预览帧订阅回调表（source → callback）
    private _previewCallbacks: Map<string, (frame: Buffer) => void> = new Map()

    constructor(config: SwitcherConfig) {
        this.config = config
        this.capabilities = config.capabilities

        // 监听通知通道，派发给已注册的订阅者
        tricasterClient.on('stateChanged', (key, data) => {
            this._handleStateChanged(key, data)
        })
    }

    // ─── 连接管理 ──────────────────────────────────────────────────────────────

    async connect(): Promise<void> {
        tricasterClient.connect()
        logger.info('[TricasterDriver] connect()')
    }

    async disconnect(): Promise<void> {
        tricasterClient.destroy()
        logger.info('[TricasterDriver] disconnect()')
    }

    async getStatus(): Promise<DeviceStatus> {
        const s = tricasterClient.overallStatus
        const map: Record<string, DeviceStatus> = {
            CONNECTED: 'connected',
            CONNECTING: 'connecting',
            DISCONNECTED: 'disconnected',
            ERROR: 'error',
        }
        return map[s] ?? 'error'
    }

    // ─── 视频切换 ──────────────────────────────────────────────────────────────
    //
    // inputId 是切换台的物理输入口 ID，例如 'input1'、'input7'。
    // 这个值由 PlayoutController 从 device-config.json sources[x].programSrc 读取后传入，
    // 本文件内不做任何 source 到 input 的映射。

    async switchToInput(inputId: string): Promise<void> {
        // Tricaster shortcut 格式：<inputId>_select_preview
        // 先把目标源推到 preview，再由 take() 执行切换
        tricasterClient.sendShortcut(`${inputId}_select_preview`)
        logger.info(`[TricasterDriver] switchToInput: ${inputId}`)
    }

    async take(): Promise<void> {
        tricasterClient.sendShortcut('main_background_take')
        logger.info('[TricasterDriver] take()')
    }

    async auto(): Promise<void> {
        tricasterClient.sendShortcut('main_background_auto')
        logger.info('[TricasterDriver] auto()')
    }

    async cut(): Promise<void> {
        tricasterClient.sendShortcut('main_background_cut')
        logger.info('[TricasterDriver] cut()')
    }

    // ─── DDR ───────────────────────────────────────────────────────────────────
    //
    // ddr 参数由 PlayoutController 从 device-config.json ddrMapping 读取后传入，
    // 例如 'ddr1'、'ddr2'。

    async loadClip(clipId: string, ddr: string): Promise<void> {
        if (!this.capabilities.canReceiveDDR) {
            logger.warn('[TricasterDriver] loadClip() skipped: canReceiveDDR=false')
            return
        }
        tricasterClient.sendShortcut(`${ddr}_clip_name`, clipId)
        logger.info(`[TricasterDriver] loadClip: "${clipId}" → ${ddr}`)
    }

    async playDDR(ddr: string): Promise<void> {
        if (!this.capabilities.canReceiveDDR) return
        tricasterClient.sendShortcut(`${ddr}_play`)
        logger.info(`[TricasterDriver] playDDR: ${ddr}`)
    }

    async stopDDR(ddr: string): Promise<void> {
        if (!this.capabilities.canReceiveDDR) return
        tricasterClient.sendShortcut(`${ddr}_stop`)
        logger.info(`[TricasterDriver] stopDDR: ${ddr}`)
    }

    // ─── DSK ───────────────────────────────────────────────────────────────────
    //
    // layer 参数由 PlayoutController 从 device-config.json dskMapping[pieceType] 读取后传入，
    // 例如 L3RD → 1, BUG → 2。

    async dskOn(layer: number): Promise<void> {
        if (!this.capabilities.dsk) {
            logger.warn('[TricasterDriver] dskOn() skipped: dsk=false')
            return
        }
        tricasterClient.sendShortcut(`dsk${layer}_show`)
        logger.info(`[TricasterDriver] dskOn: layer ${layer}`)
    }

    async dskOff(layer: number): Promise<void> {
        if (!this.capabilities.dsk) return
        tricasterClient.sendShortcut(`dsk${layer}_hide`)
        logger.info(`[TricasterDriver] dskOff: layer ${layer}`)
    }

    async dskAuto(layer: number): Promise<void> {
        if (!this.capabilities.dsk) return
        tricasterClient.sendShortcut(`dsk${layer}_auto`)
        logger.info(`[TricasterDriver] dskAuto: layer ${layer}`)
    }

    // ─── 实时预览帧 ────────────────────────────────────────────────────────────
    //
    // TODO（联调阶段）：
    // Tricaster 的预览帧通过 HTTP multipart stream 获取，
    // 端点格式：http://<host>/v1/preview?source=<inputId>
    // tricaster-client 目前没有实现这个功能，联调时在 client 层补充，
    // driver 层的接口签名保持不变。

    async getPreviewFrame(_source: string): Promise<Buffer> {
        if (!this.capabilities.livePreview) return Buffer.alloc(0)
        // TODO: 联调时通过 tricasterClient.fetchPreviewFrame(source) 实现
        logger.debug('[TricasterDriver] getPreviewFrame(): stub，待联调实现')
        return Buffer.alloc(0)
    }

    subscribePreviewFrame(source: string, cb: (frame: Buffer) => void): void {
        if (!this.capabilities.livePreview) return
        this._previewCallbacks.set(source, cb)
        // TODO: 联调时启动 HTTP multipart stream 订阅
        logger.debug(`[TricasterDriver] subscribePreviewFrame: ${source} registered（待联调）`)
    }

    unsubscribePreviewFrame(source: string): void {
        this._previewCallbacks.delete(source)
    }

    // ─── Tally ─────────────────────────────────────────────────────────────────
    //
    // Tricaster change_notifications 会推送 switcher 状态变化，
    // 其中包含当前 program/preview 的 input 信息。
    // _handleStateChanged 负责解析并触发 tally 回调。

    async getTally(): Promise<TallyState> {
        if (!this.capabilities.tally) return { program: [], preview: [] }
        // fetchState 返回当前快照，格式待联调确认
        const data = await tricasterClient.fetchState('switcher')
        return this._parseTallyFromState(data)
    }

    subscribeTally(cb: (t: TallyState) => void): void {
        if (!this.capabilities.tally) return
        this._tallyCallback = cb
        logger.info('[TricasterDriver] subscribeTally: registered')
    }

    // ─── DataLink ──────────────────────────────────────────────────────────────
    //
    // TODO（VIZ 联调阶段）：
    // DataLink 通过 Tricaster shortcut 注入文字数据，
    // 具体 shortcut 名称待现场确认，格式通常为 datalink_<key>_data = <value>

    async pushDataLink(key: string, value: string): Promise<void> {
        if (!this.capabilities.datalink) {
            logger.warn('[TricasterDriver] pushDataLink() skipped: datalink=false')
            return
        }
        // TODO: 联调时确认实际 shortcut 格式
        tricasterClient.sendShortcut(`datalink_${key}_data`, value)
        logger.info(`[TricasterDriver] pushDataLink: ${key}=${value}`)
    }

    // ─── 内部：stateChanged 事件处理 ──────────────────────────────────────────

    private _handleStateChanged(key: string, data: unknown): void {
        // Tally 派发
        if (key === 'switcher' && this._tallyCallback) {
            const tally = this._parseTallyFromState(data)
            this._tallyCallback(tally)
        }
        // 预览帧派发（如果未来 client 层推帧数据过来）
        // if (key.startsWith('preview_frame:')) { ... }
    }

    private _parseTallyFromState(data: unknown): TallyState {
        // TODO：联调时根据 Tricaster 实际返回格式解析
        // 当前返回空状态，不影响播出
        if (!data || typeof data !== 'object') return { program: [], preview: [] }
        return { program: [], preview: [] }
    }
}

// ─── 全局单例 ──────────────────────────────────────────────────────────────────
// 注意：这个单例在 PlayoutController 里通过 createDriver() 工厂创建，
// 直接导出是为了兼容现有的 socket-server 对 tricasterDriver 的引用。
// 配置层落地后（第五步），改为从 factory.ts 统一创建。

import { config } from '../../../shared/config'

export const tricasterDriver = new TricasterDriver({
    type: 'tricaster',
    role: 'switcher',
    label: '默认 Tricaster',
    capabilities: {
        canReceiveDDR: true,
        canReceiveInput: true,
        livePreview: true,
        tally: true,
        datalink: true,
        dsk: true,
        dskLayers: 4,
    },
    connection: {
        host: config.tricasterHost,
        port: config.tricasterPort,
    },
})