/**
 * @file useRCASStore.ts
 * @description RCAS 前端状态中心
 *
 * 职责：
 * - 维护 Socket.io 连接
 * - 缓存服务端推来的 Rundown 摘要列表
 * - 提供 activate 操作
 *
 * 数据流：后端 Socket.io → store → React 组件（单向，前端不自造状态）
 */

import { io, Socket } from 'socket.io-client'
import { create } from 'zustand/react'
import type {
    RundownSummary,
    ServerToClientEvents,
    ClientToServerEvents,
} from '../../../core-lib/src/socket/socket-contracts'

// ─── Store 形状 ───────────────────────────────────────────────────────────────

interface RCASStore {
    // 连接状态
    connected: boolean

    // Rundown 摘要列表（来自服务端 snapshot / rundown:* 事件）
    summaries: RundownSummary[]

    // 操作
    activate: (id: string) => void

    // 内部：初始化 socket 连接（在 App.tsx mount 时调用一次）
    _initSocket: () => void
}

// ─── Socket 单例 ──────────────────────────────────────────────────────────────

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRCASStore = create<RCASStore>((set) => ({
    connected: false,
    summaries: [],

    _initSocket: () => {
        if (socket) return // 防止重复初始化

        socket = io('', {
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        })

        socket.on('connect', () => {
            console.log('[Socket] Connected')
            set({ connected: true })
        })

        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason)
            set({ connected: false })
        })

        // 连接后服务端立即推送全量快照
        socket.on('snapshot', ({ summaries }) => {
            console.log('[Socket] Snapshot received:', summaries.length, 'rundown(s)')
            set({ summaries })
        })

        // Rundown 创建
        socket.on('rundown:created', ({ id, lifecycle }) => {
            console.log('[Socket] rundown:created', id)
            set((state) => {
                // 如果已存在则更新，否则追加
                const exists = state.summaries.find(s => s.id === id)
                if (exists) {
                    return {
                        summaries: state.summaries.map(s =>
                            s.id === id ? { ...s, lifecycle } : s
                        )
                    }
                }
                return {
                    summaries: [...state.summaries, {
                        id,
                        name: id, // 临时用 id，snapshot 会覆盖
                        lifecycle,
                        segmentCount: 0,
                    }]
                }
            })
        })

        // Rundown 更新
        socket.on('rundown:updated', ({ id, rundown }) => {
            console.log('[Socket] rundown:updated', id)
            set((state) => ({
                summaries: state.summaries.map(s =>
                    s.id === id
                        ? { ...s, name: rundown.name, segmentCount: rundown.segments?.length ?? s.segmentCount }
                        : s
                )
            }))
        })

        // Rundown 删除
        socket.on('rundown:deleted', ({ id }) => {
            console.log('[Socket] rundown:deleted', id)
            set((state) => ({
                summaries: state.summaries.filter(s => s.id !== id)
            }))
        })

        // Rundown 激活
        socket.on('rundown:activated', ({ id, rundown }) => {
            console.log('[Socket] rundown:activated', id)
            set((state) => ({
                summaries: state.summaries.map(s =>
                    s.id === id
                        ? { ...s, lifecycle: 'active', name: rundown.name }
                        : s.lifecycle === 'active' ? { ...s, lifecycle: 'standby' } : s
                )
            }))
        })

        // Rundown 待命
        socket.on('rundown:standby', ({ id }) => {
            console.log('[Socket] rundown:standby', id)
            set((state) => ({
                summaries: state.summaries.map(s =>
                    s.id === id ? { ...s, lifecycle: 'standby' } : s
                )
            }))
        })

        // 生命周期变化
        socket.on('rundown:lifecycle', ({ id, lifecycle }) => {
            console.log('[Socket] rundown:lifecycle', id, lifecycle)
            set((state) => ({
                summaries: state.summaries.map(s =>
                    s.id === id ? { ...s, lifecycle } : s
                )
            }))
        })
    },

    activate: (id: string) => {
        if (!socket) return
        socket.emit('activate', { id }, (result) => {
            if (result.ok) {
                console.log('[Socket] Activate success:', id)
            } else {
                console.error('[Socket] Activate failed:', result.error)
            }
        })
    },
}))