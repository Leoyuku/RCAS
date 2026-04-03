/**
 * @fileoverview useTricasterFrame — Tricaster 实时预览帧 Hook
 *
 * 直接从浏览器连接 Tricaster video_notifications WebSocket，
 * 不经过 RCAS 后端，避免二进制帧流污染 Socket.io 控制通道。
 *
 * 架构：浏览器 → WebSocket → Tricaster（端口80）
 *
 * 特性：
 * - 自动重连（断开后3秒重连）
 * - 心跳保活（每5秒发空字符串，实测有效）
 * - isRendering 锁 + 500ms 超时保护（防止 onload 未触发导致帧流卡死）
 * - Blob URL 自动释放（防止内存泄漏）
 * - 组件卸载时自动关闭 WebSocket
 *
 * 使用方式：
 *   const frameUrl = useTricasterFrame(tricasterHost, previewSrc)
 *   // frameUrl 是当前帧的 Blob URL，直接用于 <img src={frameUrl} />
 *   // previewSrc 为 null 时不建立连接，frameUrl 返回 null
 */

import { useState, useEffect, useRef } from 'react'

const HEARTBEAT_INTERVAL_MS = 5000
const RECONNECT_DELAY_MS = 3000
const VIDEO_XRES = 160
const VIDEO_YRES = 90
const VIDEO_QUALITY = 5

/**
 * 订阅 Tricaster 实时预览帧
 *
 * @param tricasterHost  Tricaster IP 或 hostname（来自 device-config.json connection.host）
 * @param previewSrc     逻辑槽位名，如 "input1"（来自 switcherMap / source.previewSrc）
 *                       传入 null 或空字符串时不建立连接
 * @returns              当前帧的 Blob URL（可直接用于 <img src>），无帧时返回 null
 */
export function useTricasterFrame(
    tricasterHost: string | null,
    previewSrc: string | null
): string | null {
    const [frameUrl, setFrameUrl] = useState<string | null>(null)

    // 用 ref 管理 WebSocket 和定时器，不触发重渲染
    const wsRef = useRef<WebSocket | null>(null)
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isRenderingRef = useRef(false)
    const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const destroyedRef = useRef(false)

    useEffect(() => {
        if (!tricasterHost || !previewSrc) return

        destroyedRef.current = false

        function connect() {
            if (destroyedRef.current) return
        
            const url = `ws://${tricasterHost}/v1/video_notifications?name=${previewSrc}&xres=${VIDEO_XRES}&yres=${VIDEO_YRES}&q=${VIDEO_QUALITY}`
            
            let ws: WebSocket
            try {
                ws = new WebSocket(url)
            } catch (err) {
                console.warn('[useTricasterFrame] WebSocket blocked (HTTPS env?):', err)
                return
            }
        
            wsRef.current = ws
            ws.binaryType = 'blob'
            // ... 后속 onopen / onmessage / onerror / onclose 不变

            wsRef.current = ws

            ws.binaryType = 'blob'

            ws.onopen = () => {
                if (destroyedRef.current) { ws.close(); return }

                // 心跳：每5秒发空字符串（浏览器端不支持协议层 ping，用空字符串代替）
                heartbeatRef.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send('')
                    }
                }, HEARTBEAT_INTERVAL_MS)
            }

            ws.onmessage = (e: MessageEvent<Blob>) => {
                if (destroyedRef.current) return

                // isRendering 锁：跳过当前帧正在渲染时到来的新帧
                // 避免 img.onload 队列堆积，始终显示最新帧
                if (isRenderingRef.current) return
                isRenderingRef.current = true

                const newUrl = URL.createObjectURL(e.data)

                // 500ms 超时保护：如果 img.onload 未触发（如图片数据损坏），
                // 强制解锁，避免后续所有帧被永久丢弃（黑屏）
                safetyTimerRef.current = setTimeout(() => {
                    isRenderingRef.current = false
                }, 500)

                setFrameUrl(prev => {
                    // 释放旧 Blob URL，防止内存泄漏
                    // 注意：setFrameUrl 的 updater 函数里访问 prev 是安全的
                    if (prev && prev.startsWith('blob:')) {
                        URL.revokeObjectURL(prev)
                    }
                    return newUrl
                })

                // img.onload 无法在 Hook 里直接监听，用 setTimeout 0 模拟：
                // 浏览器渲染新 URL 后，下一个 tick 解锁
                // 结合上面的 500ms 兜底，双重保护
                setTimeout(() => {
                    if (safetyTimerRef.current) {
                        clearTimeout(safetyTimerRef.current)
                        safetyTimerRef.current = null
                    }
                    isRenderingRef.current = false
                }, 0)
            }

            ws.onerror = () => {
                // 错误会紧跟 onclose，在 onclose 里统一处理重连
            }

            ws.onclose = () => {
                // 清理心跳定时器（与 WebSocket 生命周期绑定）
                if (heartbeatRef.current) {
                    clearInterval(heartbeatRef.current)
                    heartbeatRef.current = null
                }

                if (destroyedRef.current) return

                // 自动重连
                reconnectRef.current = setTimeout(() => {
                    if (!destroyedRef.current) connect()
                }, RECONNECT_DELAY_MS)
            }
        }

        connect()

        // cleanup：组件卸载时关闭连接，清理所有定时器
        return () => {
            destroyedRef.current = true

            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current)
                heartbeatRef.current = null
            }
            if (reconnectRef.current) {
                clearTimeout(reconnectRef.current)
                reconnectRef.current = null
            }
            if (safetyTimerRef.current) {
                clearTimeout(safetyTimerRef.current)
                safetyTimerRef.current = null
            }

            wsRef.current?.close()
            wsRef.current = null

            // 释放最后一帧的 Blob URL
            setFrameUrl(prev => {
                if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
                return null
            })
        }
    }, [tricasterHost, previewSrc]) // tricasterHost 或 previewSrc 变化时重建连接

    return frameUrl
}