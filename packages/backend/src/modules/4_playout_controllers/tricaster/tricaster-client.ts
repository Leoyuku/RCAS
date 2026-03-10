/**
 * @fileoverview TricasterClient — Tricaster 协议客户端
 *
 * 实现规范 11.2 双通道架构：
 *   - 控制通道：ws://ip/v1/shortcut_state  只发不收，发送 shortcut 命令
 *   - 通知通道：ws://ip/v1/change_notifications  只收不发，接收状态变化
 *
 * 连接管理：指数退避重连（1s→2s→4s→8s→16s，最大30s）
 */

import WebSocket           from 'ws'
import { EventEmitter }    from 'eventemitter3'
import { logger }          from '../../../shared/logger'
import { config }          from '../../../shared/config'

// ─── 事件类型 ─────────────────────────────────────────────────────────────────

export type TricasterConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR'

export interface TricasterClientEvents {
    statusChanged:   (status: TricasterConnectionStatus) => void
    stateChanged:    (key: string, data: any) => void
}

// ─── TricasterClient ──────────────────────────────────────────────────────────

export class TricasterClient extends EventEmitter<TricasterClientEvents> {

    private _controlWs:  WebSocket | null = null
    private _notifyWs:   WebSocket | null = null

    private _controlStatus: TricasterConnectionStatus = 'DISCONNECTED'
    private _notifyStatus:  TricasterConnectionStatus = 'DISCONNECTED'

    private _controlRetry = 0
    private _notifyRetry  = 0

    private _destroyed = false

    private get _baseUrl(): string {
        return `ws://${config.tricasterHost}`
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
        logger.info('[TricasterClient] Destroyed.')
    }

    // ── 控制通道 ──────────────────────────────────────────────────────────────

    private _connectControl(): void {
        const url = `${this._baseUrl}/v1/shortcut_state`
        logger.info(`[TricasterClient] Control channel connecting: ${url}`)
        this._setControlStatus('CONNECTING')

        const ws = new WebSocket(url)
        this._controlWs = ws

        ws.on('open', () => {
            this._controlRetry = 0
            this._setControlStatus('CONNECTED')
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

    private _connectNotify(): void {
        const url = `${this._baseUrl}/v1/change_notifications`
        logger.info(`[TricasterClient] Notify channel connecting: ${url}`)
        this._setNotifyStatus('CONNECTING')

        const ws = new WebSocket(url)
        this._notifyWs = ws

        ws.on('open', () => {
            this._notifyRetry = 0
            this._setNotifyStatus('CONNECTED')
            logger.info('[TricasterClient] Notify channel connected.')
        })

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString())
                // change_notifications 格式: { "key": "switcher", ... }
                const key = msg?.key ?? msg?.name ?? 'unknown'
                logger.debug(`[TricasterClient] Notification: ${key}`)
                this.emit('stateChanged', key, msg)
            } catch {
                logger.warn(`[TricasterClient] Failed to parse notification: ${data}`)
            }
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

    // ── 发送 Shortcut 命令 ────────────────────────────────────────────────────

    /**
     * 发送单个 shortcut 命令
     * 格式：{ "shortcut": "main_background_take" }
     * 或带值：{ "shortcut": "main_preview_source", "value": "Input1" }
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

    // ── 查询当前状态（HTTP GET） ───────────────────────────────────────────────

    async fetchState(key: string): Promise<any> {
        const url = `http://${config.tricasterHost}/v1/dictionary?key=${key}`
        try {
            const res  = await fetch(url)
            const data = await res.json()
            logger.debug(`[TricasterClient] Fetched state "${key}"`)
            return data
        } catch (err: any) {
            logger.warn(`[TricasterClient] Failed to fetch state "${key}": ${err.message}`)
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
        if (this._controlStatus === 'ERROR'      || this._notifyStatus === 'ERROR')      return 'ERROR'
        if (this._controlStatus === 'CONNECTING' || this._notifyStatus === 'CONNECTING') return 'CONNECTING'
        return 'DISCONNECTED'
    }

    // ── 私有工具 ──────────────────────────────────────────────────────────────

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
        const delay      = Math.min(1000 * Math.pow(2, retryCount - 1), 30000)
        logger.info(`[TricasterClient] ${channel} reconnecting in ${delay}ms (attempt ${retryCount})`)
        setTimeout(() => {
            if (this._destroyed) return
            channel === 'control' ? this._connectControl() : this._connectNotify()
        }, delay)
    }
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const tricasterClient = new TricasterClient()