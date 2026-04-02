/**
 * @fileoverview TricasterClient — Tricaster 协议客户端
 *
 * 三通道架构：
 * - 控制通道：ws://ip/v1/shortcut_notifications   只发不收，发送 shortcut 命令
 * - 通知通道：ws://ip/v1/change_notifications     只收不发，接收状态变化通知
 * - 预览通道：ws://ip/v1/video_notifications      多路，按需建立，接收 JPG 帧流
 *
 * 连接管理：
 * - 控制/通知通道：指数退避重连（1s→2s→4s→8s→16s，最大30s）
 * - 预览通道：固定3秒重连，引用计数管理（最后一个订阅者离开才关闭连接）
 * - 心跳：所有通道每5秒 ping 一次（实测 Tricaster 超时阈值 <15s）
 *
 * v11 修正：
 * - change_notifications 推送纯文本 key（非 JSON），修正解析方式
 * - fetchState() 改为返回 XML（Tricaster HTTP API 返回 XML，非 JSON）
 * - 新增 parseXml() 统一 XML → JS 对象入口
 * - 新增 subscribeFrame() 管理多路 video_notifications
 */

import WebSocket from 'ws'
import { EventEmitter } from 'eventemitter3'
import { XMLParser } from 'fast-xml-parser'
import { logger } from '../../../shared/logger'
import { config } from '../../../shared/config'

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** 心跳间隔：5秒（实测 Tricaster 超时阈值 <15s，官方建议 15s 上限） */
const HEARTBEAT_INTERVAL_MS = 5000

/** 预览通道固定重连延迟 */
const VIDEO_RECONNECT_DELAY_MS = 3000

/** 预览帧分辨率和质量（与 ThumbnailPlaceholder 尺寸对应） */
const VIDEO_XRES = 160
const VIDEO_YRES = 90
const VIDEO_QUALITY = 5

// ─── 事件类型 ─────────────────────────────────────────────────────────────────

export type TricasterConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR'

/** 预览帧回调：收到新帧时触发，payload 是原始 Buffer */
export type FrameCallback = (frame: Buffer) => void

export interface TricasterClientEvents {
    statusChanged: (status: TricasterConnectionStatus) => void
    /** key 是 change_notifications 推送的字符串，如 "switcher" / "tally" / "ddr_playlist" */
    stateChanged: (key: string) => void
}

// ─── 预览通道内部状态 ─────────────────────────────────────────────────────────

interface VideoChannel {
    ws: WebSocket | null
    heartbeatTimer: ReturnType<typeof setInterval> | null
    refCount: number          // 订阅者数量，归零时关闭连接
    callbacks: Set<FrameCallback>
    destroyed: boolean        // 标记：所有订阅者都离开了，不再重连
}

// ─── XML Parser 配置 ──────────────────────────────────────────────────────────

const xmlParser = new XMLParser({
    ignoreAttributes: false,       // 解析 XML 属性（iso_label 等都在属性里）
    attributeNamePrefix: '',       // 属性直接用原名，不加前缀
    allowBooleanAttributes: true,
})

// ─── TricasterClient ──────────────────────────────────────────────────────────

export class TricasterClient extends EventEmitter<TricasterClientEvents> {
    private _controlWs: WebSocket | null = null
    private _notifyWs: WebSocket | null = null
    private _controlStatus: TricasterConnectionStatus = 'DISCONNECTED'
    private _notifyStatus: TricasterConnectionStatus = 'DISCONNECTED'
    private _controlRetry = 0
    private _notifyRetry = 0
    private _destroyed = false

    /** 多路预览通道，key = previewSrc（如 "input1"） */
    private _videoWsMap: Map<string, VideoChannel> = new Map()

    private get _baseUrl(): string {
        return `ws://${config.tricasterHost}`
    }

    private get _httpBase(): string {
        return `http://${config.tricasterHost}`
    }

    // ── 启动 ─────────────────────────────────────────────────────────────────

    connect(): void {
        if (!config.tricasterEnabled) {
            logger.warn('[TricasterClient] Disabled by config, skipping connection.')
            return
        }
        logger.info(`[TricasterClient] Connecting to ${config.tricasterHost}:${config.tricasterPort}`)
        this._connectControl()
        this._connectNotify()
    }

    destroy(): void {
        this._destroyed = true
        this._controlWs?.close()
        this._notifyWs?.close()
        // 关闭所有预览通道
        for (const [previewSrc, channel] of this._videoWsMap) {
            this._destroyVideoChannel(previewSrc, channel)
        }
        this._videoWsMap.clear()
        logger.info('[TricasterClient] Destroyed.')
    }

    // ── 控制通道 ──────────────────────────────────────────────────────────────

    private _connectControl(): void {
        // ✅ 已验证：shortcut_notifications（非文档中的 shortcut_state）
        const url = `${this._baseUrl}/v1/shortcut_notifications`
        logger.info(`[TricasterClient] Control channel connecting: ${url}`)
        this._setControlStatus('CONNECTING')

        const ws = new WebSocket(url)
        this._controlWs = ws

        ws.on('open', () => {
            this._controlRetry = 0
            this._setControlStatus('CONNECTED')
            this._startHeartbeat(ws, 'control')
            logger.info('[TricasterClient] Control channel connected.')
        })

        ws.on('error', (err) => {
            logger.warn(`[TricasterClient] Control channel error: ${err.message}`)
            this._setControlStatus('ERROR')
        })

        ws.on('close', () => {
            this._setControlStatus('DISCONNECTED')
            if (!this._destroyed) this._scheduleReconnect('control')
        })
    }

    // ── 通知通道 ──────────────────────────────────────────────────────────────

    private _connectNotify(): void {
        const url = `${this._baseUrl}/v1/change_notifications`
        logger.info(`[TricasterClient] Notify channel connecting: ${url}`)
        this._setNotifyStatus('CONNECTING')

        const ws = new WebSocket(url)
        this._notifyWs = ws

        ws.on('open', () => {
            this._notifyRetry = 0
            this._setNotifyStatus('CONNECTED')
            this._startHeartbeat(ws, 'notify')
            logger.info('[TricasterClient] Notify channel connected.')
        })

        ws.on('message', (data) => {
            // ✅ 修正：change_notifications 推送的是纯文本 key 名称，不是 JSON
            // 文档原文："The only data sent over this connection is the name of
            // the served state page whose content has changed."
            // 示例：收到 "switcher" / "tally" / "ddr_playlist"
            const key = data.toString().trim()
            if (!key) return
            logger.debug(`[TricasterClient] State change notification: "${key}"`)
            this.emit('stateChanged', key)
        })

        ws.on('error', (err) => {
            logger.warn(`[TricasterClient] Notify channel error: ${err.message}`)
            this._setNotifyStatus('ERROR')
        })

        ws.on('close', () => {
            this._setNotifyStatus('DISCONNECTED')
            if (!this._destroyed) this._scheduleReconnect('notify')
        })
    }

    // ── 预览帧订阅（video_notifications）────────────────────────────────────

    /**
     * 订阅某路预览帧
     *
     * @param previewSrc  Tricaster 逻辑槽位名，如 "input1"（由 physical_input_number 转小写）
     * @param callback    每收到新帧时调用，payload 是 JPG Buffer
     * @returns           取消订阅函数，React useEffect cleanup 直接调用即可
     *
     * 引用计数：多个订阅者可订阅同一路，最后一个离开才真正关闭 WebSocket
     * 重连：断开后3秒自动重连，直到所有订阅者都取消
     */
    subscribeFrame(previewSrc: string, callback: FrameCallback): () => void {
        if (!config.tricasterEnabled) {
            return () => { }
        }

        // 已有通道：增加引用计数，注册回调
        let channel = this._videoWsMap.get(previewSrc)
        if (channel) {
            channel.refCount++
            channel.callbacks.add(callback)
            logger.debug(`[TricasterClient] subscribeFrame "${previewSrc}" refCount=${channel.refCount}`)
        } else {
            // 新建通道
            channel = {
                ws: null,
                heartbeatTimer: null,
                refCount: 1,
                callbacks: new Set([callback]),
                destroyed: false,
            }
            this._videoWsMap.set(previewSrc, channel)
            this._connectVideo(previewSrc, channel)
            logger.info(`[TricasterClient] New video channel: "${previewSrc}"`)
        }

        // 返回取消订阅函数
        return () => {
            const ch = this._videoWsMap.get(previewSrc)
            if (!ch) return
            ch.callbacks.delete(callback)
            ch.refCount--
            logger.debug(`[TricasterClient] unsubscribeFrame "${previewSrc}" refCount=${ch.refCount}`)
            if (ch.refCount <= 0) {
                // 最后一个订阅者离开，关闭连接
                this._destroyVideoChannel(previewSrc, ch)
                this._videoWsMap.delete(previewSrc)
                logger.info(`[TricasterClient] Video channel closed: "${previewSrc}"`)
            }
        }
    }

    private _connectVideo(previewSrc: string, channel: VideoChannel): void {
        if (channel.destroyed) return

        const url = `${this._baseUrl}/v1/video_notifications?name=${previewSrc}&xres=${VIDEO_XRES}&yres=${VIDEO_YRES}&q=${VIDEO_QUALITY}`
        logger.info(`[TricasterClient] Video channel connecting: ${url}`)

        const ws = new WebSocket(url)
        channel.ws = ws

        ws.on('open', () => {
            if (channel.destroyed) { ws.close(); return }
            logger.debug(`[TricasterClient] Video channel open: "${previewSrc}"`)
            // 启动心跳：每5秒发 ping frame（Node.js ws 库支持协议层 ping）
            channel.heartbeatTimer = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.ping()
                }
            }, HEARTBEAT_INTERVAL_MS)
        })

        ws.on('message', (data: Buffer) => {
            if (channel.destroyed) return
            // 分发给所有订阅者
            for (const cb of channel.callbacks) {
                try { cb(data as Buffer) } catch { /* 单个回调失败不影响其他 */ }
            }
        })

        ws.on('error', (err) => {
            logger.warn(`[TricasterClient] Video channel "${previewSrc}" error: ${err.message}`)
        })

        ws.on('close', () => {
            // 清理心跳定时器（与 WebSocket 生命周期绑定，不泄漏）
            if (channel.heartbeatTimer) {
                clearInterval(channel.heartbeatTimer)
                channel.heartbeatTimer = null
            }
            if (channel.destroyed) return
            // 还有订阅者：3秒后重连
            if (channel.refCount > 0) {
                logger.info(`[TricasterClient] Video channel "${previewSrc}" closed, reconnecting in ${VIDEO_RECONNECT_DELAY_MS}ms...`)
                setTimeout(() => this._connectVideo(previewSrc, channel), VIDEO_RECONNECT_DELAY_MS)
            }
        })
    }

    private _destroyVideoChannel(previewSrc: string, channel: VideoChannel): void {
        channel.destroyed = true
        if (channel.heartbeatTimer) {
            clearInterval(channel.heartbeatTimer)
            channel.heartbeatTimer = null
        }
        channel.ws?.close()
        channel.ws = null
        channel.callbacks.clear()
    }

    // ── 发送 Shortcut 命令 ────────────────────────────────────────────────────

    /**
     * 发送单个 shortcut 命令
     * 格式：{ "shortcut": "main_background_take" }
     * 或带值：{ "shortcut": "main_b_row_named_input", "value": "CAM 1" }
     */
    sendShortcut(name: string, value?: string): boolean {
        if (!this._controlWs || this._controlWs.readyState !== WebSocket.OPEN) {
            logger.warn(`[TricasterClient] Cannot send shortcut "${name}": control channel not open`)
            return false
        }

        const payload = value !== undefined
            ? { shortcut: name, value }
            : { shortcut: name }

        this._controlWs.send(JSON.stringify(payload))
        logger.debug(`[TricasterClient] Sent shortcut: ${name}${value !== undefined ? ` = ${value}` : ''}`)
        return true
    }

    // ── HTTP 查询 + XML 解析 ──────────────────────────────────────────────────

    /**
     * 查询 Tricaster 状态，返回原始 XML 字符串
     * ✅ 修正：Tricaster HTTP API 返回 XML，不是 JSON，用 res.text() 接收
     */
    async fetchStateXml(key: string): Promise<string | null> {
        const url = `${this._httpBase}/v1/dictionary?key=${key}`
        try {
            const res = await fetch(url)
            if (!res.ok) {
                logger.warn(`[TricasterClient] fetchStateXml "${key}" HTTP ${res.status}`)
                return null
            }
            const xml = await res.text()
            logger.debug(`[TricasterClient] Fetched XML for key "${key}" (${xml.length} bytes)`)
            return xml
        } catch (err: any) {
            logger.warn(`[TricasterClient] fetchStateXml "${key}" failed: ${err.message}`)
            return null
        }
    }

    /**
     * 查询 Tricaster 状态，返回解析后的 JS 对象
     * 内部调用 fetchStateXml → parseXml，上层无需关心 XML 细节
     */
    async fetchState(key: string): Promise<any | null> {
        const xml = await this.fetchStateXml(key)
        if (!xml) return null
        return this.parseXml(xml)
    }

    /**
     * XML → JS 对象（同步）
     * 统一入口，所有 XML 解析都走这里
     * 使用 fast-xml-parser，属性直接作为字段（不加前缀）
     */
    parseXml(xml: string): any {
        try {
            return xmlParser.parse(xml)
        } catch (err: any) {
            logger.warn(`[TricasterClient] XML parse error: ${err.message}`)
            return null
        }
    }

    // ── 连接状态 ──────────────────────────────────────────────────────────────

    get isControlConnected(): boolean {
        return this._controlStatus === 'CONNECTED'
    }

    get isNotifyConnected(): boolean {
        return this._notifyStatus === 'CONNECTED'
    }

    get overallStatus(): TricasterConnectionStatus {
        if (this._controlStatus === 'CONNECTED' && this._notifyStatus === 'CONNECTED') return 'CONNECTED'
        if (this._controlStatus === 'ERROR' || this._notifyStatus === 'ERROR') return 'ERROR'
        if (this._controlStatus === 'CONNECTING' || this._notifyStatus === 'CONNECTING') return 'CONNECTING'
        return 'DISCONNECTED'
    }

    // ── 私有工具 ──────────────────────────────────────────────────────────────

    /**
     * 为控制/通知通道启动心跳
     * 使用协议层 ping frame（ws 库原生支持），比发空字符串更标准
     * 心跳定时器在 ws.on('close') 时随 WebSocket 销毁，不会泄漏
     */
    private _startHeartbeat(ws: WebSocket, label: string): void {
        const timer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping()
                logger.debug(`[TricasterClient] Ping sent: ${label}`)
            } else {
                clearInterval(timer)
            }
        }, HEARTBEAT_INTERVAL_MS)

        // WebSocket 关闭时自动清除定时器
        ws.once('close', () => clearInterval(timer))
    }

    private _setControlStatus(s: TricasterConnectionStatus): void {
        this._controlStatus = s
        this.emit('statusChanged', this.overallStatus)
    }

    private _setNotifyStatus(s: TricasterConnectionStatus): void {
        this._notifyStatus = s
        this.emit('statusChanged', this.overallStatus)
    }

    private _scheduleReconnect(channel: 'control' | 'notify'): void {
        const retryCount = channel === 'control' ? ++this._controlRetry : ++this._notifyRetry
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000)
        logger.info(`[TricasterClient] ${channel} reconnecting in ${delay}ms (attempt ${retryCount})`)
        setTimeout(() => {
            if (this._destroyed) return
            channel === 'control' ? this._connectControl() : this._connectNotify()
        }, delay)
    }
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const tricasterClient = new TricasterClient()