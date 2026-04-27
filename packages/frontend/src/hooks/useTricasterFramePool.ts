/**
 * @file useTricasterFramePool.ts
 * @description Tricaster 实时帧连接池
 *
 * 唯一职责：根据 previewSrcs 列表动态维护 WebSocket 连接，输出帧数据池
 *
 * 特性：
 * - 差量更新：previewSrcs 变化时只增删必要的连接，已有连接不中断
 * - 连接参数与 useTricasterFrame 完全一致（心跳/重连/Blob URL）
 * - 帧数据不进 Zustand store（避免高频更新触发全局重渲染）
 * - 通过 FramePoolContext 向下传递
 *
 * 被使用：App.tsx（顶层调用一次）
 */

import { useState, useEffect, useRef } from 'react'

const HEARTBEAT_INTERVAL_MS = 5000
const RECONNECT_DELAY_MS    = 3000
const VIDEO_XRES            = 160
const VIDEO_YRES            = 90
const VIDEO_QUALITY         = 5

interface PoolEntry {
    ws:          WebSocket | null
    heartbeat:   ReturnType<typeof setInterval> | null
    reconnect:   ReturnType<typeof setTimeout> | null
    destroyed:   boolean
}

export function useTricasterFramePool(
    tricasterHost: string | null,
    previewSrcs:   string[]
): Record<string, string | null> {
    const [framePool, setFramePool] = useState<Record<string, string | null>>({})
    const poolRef = useRef<Map<string, PoolEntry>>(new Map())

    function openConnection(previewSrc: string) {
        if (!tricasterHost) return

        const entry: PoolEntry = {
            ws:        null,
            heartbeat: null,
            reconnect: null,
            destroyed: false,
        }
        poolRef.current.set(previewSrc, entry)

        function connect() {
            if (entry.destroyed) return

            const url = `ws://${tricasterHost}/v1/video_notifications?name=${previewSrc}&xres=${VIDEO_XRES}&yres=${VIDEO_YRES}&q=${VIDEO_QUALITY}`
            let ws: WebSocket
            try {
                ws = new WebSocket(url)
            } catch {
                return
            }
            entry.ws = ws
            ws.binaryType = 'blob'

            ws.onopen = () => {
                if (entry.destroyed) { ws.close(); return }
                entry.heartbeat = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) ws.send('')
                }, HEARTBEAT_INTERVAL_MS)
            }

            ws.onmessage = (e: MessageEvent<Blob>) => {
                if (entry.destroyed) return
                const newUrl = URL.createObjectURL(e.data)
                setFramePool(prev => {
                    if (prev[previewSrc] && prev[previewSrc]!.startsWith('blob:')) {
                        URL.revokeObjectURL(prev[previewSrc]!)
                    }
                    return { ...prev, [previewSrc]: newUrl }
                })
            }

            ws.onclose = () => {
                if (entry.heartbeat) { clearInterval(entry.heartbeat); entry.heartbeat = null }
                if (entry.destroyed) return
                entry.reconnect = setTimeout(() => { if (!entry.destroyed) connect() }, RECONNECT_DELAY_MS)
            }
        }

        connect()
    }

    function closeConnection(previewSrc: string) {
        const entry = poolRef.current.get(previewSrc)
        if (!entry) return
        entry.destroyed = true
        if (entry.heartbeat) { clearInterval(entry.heartbeat); entry.heartbeat = null }
        if (entry.reconnect) { clearTimeout(entry.reconnect); entry.reconnect = null }
        entry.ws?.close()
        poolRef.current.delete(previewSrc)
        setFramePool(prev => {
            const next = { ...prev }
            if (next[previewSrc]?.startsWith('blob:')) URL.revokeObjectURL(next[previewSrc]!)
            delete next[previewSrc]
            return next
        })
    }

    // 差量更新：previewSrcs 变化时只增删必要的连接
    useEffect(() => {
        if (!tricasterHost) return

        const current = new Set(poolRef.current.keys())
        const next    = new Set(previewSrcs)

        // 关闭消失的连接
        for (const src of current) {
            if (!next.has(src)) closeConnection(src)
        }

        // 新建增加的连接
        for (const src of next) {
            if (!current.has(src)) openConnection(src)
        }
    }, [tricasterHost, previewSrcs])

    // 组件卸载时关闭所有连接
    useEffect(() => {
        return () => {
            for (const src of poolRef.current.keys()) closeConnection(src)
        }
    }, [])

    return framePool
}