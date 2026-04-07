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
import type { IRundown } from '../../../core-lib/src/models/rundown-model'
import type {
    RundownSummary,
    RundownRuntime,
    ServerToClientEvents,
    ClientToServerEvents,
} from '../../../core-lib/src/socket/socket-contracts'

// ─── Store 形状 ───────────────────────────────────────────────────────────────

interface RCASStore {
    // 连接状态
    connected: boolean

    // Rundown 摘要列表（来自服务端 snapshot / rundown:* 事件）
    summaries: RundownSummary[]

    // 当前激活的完整 Rundown（含 segments/parts 树）
    // 来自 rundown:activated 事件，断线重连时后端会补推
    activeRundown: IRundown | null

    // 播出运行时状态
    runtime: RundownRuntime | null
    // Tricaster 主机地址（来自 device-config connection.host，供前端直连预览帧）
    tricasterHost: string | null
    sources: Record<string, { id: string; label: string; type: string }>

    // Part 级别运行时覆盖（key = partId，value = sourceId）
    partOverrides: Map<string, string>

    // 操作
    setPartOverride: (partId: string, sourceId: string) => void
    clearPartOverride: (partId: string) => void
    addSource: (source: { id: string; label: string; type: string; previewSrc: string; switcherName: string }) => Promise<void>

    // 操作
    activate: (id: string) => void
    run: () => void
    take: () => void
    sendToPreview: () => void
    setNext: (partId: string) => void

    // 内部：初始化 socket 连接（在 App.tsx mount 时调用一次）
    _initSocket: () => void
}

// ─── Socket 单例 ──────────────────────────────────────────────────────────────

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRCASStore = create<RCASStore>((set) => ({
    connected: false,
    summaries: [],
    activeRundown: null,
    runtime: null,
    sources: {},
    partOverrides: new Map(),
    tricasterHost: null,

    _initSocket: () => {
        if (socket) return // 防止重复初始化

        socket = io('', {
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        })

        socket.on('connect', () => {
            console.log('[Socket] Connected')
            set({ connected: true })

            //拉取设备配置，获取 sources
            fetch('/api/device/config')
                .then(r => r.json())
                .then(cfg => {
                    if (cfg?.sources) {
                        console.log('[Store] sources loaded:', Object.keys(cfg.sources).length)
                        set({ sources: cfg.sources })
                    }
                    // 提取 Tricaster host，供前端直连 video_notifications
                    const switcherId = cfg?.activeDevices?.switcher
                    const host = switcherId ? cfg?.devices?.[switcherId]?.connection?.host ?? null : null
                    if (host) {
                        console.log('[Store] tricasterHost:', host)
                    }
                    set({ tricasterHost: host })
                })
                .catch(err => console.error('[Store] Failed to load device config:', err))
        })

        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason)
            set({ connected: false })
        })

        // 连接后服务端立即推送全量快照（仅摘要）
        socket.on('snapshot', ({ summaries }) => {
            console.log('[Socket] Snapshot received:', summaries.length, 'rundown(s)')
            set({ summaries })
            // 注意：snapshot 只有摘要。如果后端有 active rundown，
            // 它会在 snapshot 之后紧接着补推一条 rundown:activated，
            // 那时才会填入 activeRundown。
        })

        // Rundown 创建
        socket.on('rundown:created', ({ id, rundown, lifecycle }) => {
            console.log('[Socket] rundown:created', id)
            set((state) => {
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
                        name: rundown.name,
                        lifecycle,
                        segmentCount: rundown.segments?.length ?? 0,
                    }]
                }
            })
        })

        // Rundown 更新（NCS 内容变更）
        socket.on('rundown:updated', ({ id, rundown }) => {
            console.log('[Socket] rundown:updated', id)
            set((state) => {
                const newSummaries = state.summaries.map(s =>
                    s.id === id
                        ? { ...s, name: rundown.name, segmentCount: rundown.segments?.length ?? s.segmentCount }
                        : s
                )
                // 如果更新的是当前 active rundown，同步更新完整数据
                const newActiveRundown =
                    state.activeRundown?._id === id ? rundown : state.activeRundown

                return { summaries: newSummaries, activeRundown: newActiveRundown }
            })
        })

        // Rundown 删除
        socket.on('rundown:deleted', ({ id }) => {
            console.log('[Socket] rundown:deleted', id)
            set((state) => ({
                summaries: state.summaries.filter(s => s.id !== id),
                activeRundown: state.activeRundown?._id === id ? null : state.activeRundown,
            }))
        })

        // Rundown 激活 ← 关键事件，这里存入完整数据
        socket.on('rundown:activated', ({ id, rundown }) => {
            console.log('[Socket] rundown:activated', id)
            set((state) => ({
                // 更新摘要：激活的变 active，原来 active 的降为 standby
                summaries: state.summaries.map(s => {
                    if (s.id === id) return { ...s, lifecycle: 'active', name: rundown.name }
                    if (s.lifecycle === 'active') return { ...s, lifecycle: 'standby' }
                    return s
                }),
                // 存入完整 Rundown 数据，供 Rundown 列表渲染
                activeRundown: rundown,
            }))
        })

        // Rundown 待命
        socket.on('rundown:standby', ({ id }) => {
            console.log('[Socket] rundown:standby', id)
            set((state) => ({
                summaries: state.summaries.map(s =>
                    s.id === id ? { ...s, lifecycle: 'standby' } : s
                ),
                // 如果待命的是当前 active rundown，清空完整数据
                activeRundown: state.activeRundown?._id === id ? null : state.activeRundown,
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

        // Runtime Engine 状态
        socket.on('runtime:state', (runtime) => {
            console.log('[Socket] runtime:state', runtime.engineState)
            set({ runtime })
        })

        // Part 覆盖状态同步
        socket.on('runtime:overrides', ({ overrides }) => {
            const map = new Map<string, string>()
            overrides.forEach(o => map.set(o.partId, o.sourceId))
            set({ partOverrides: map })
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

    take: () => {
        if (!socket) return
        socket.emit('intent:take', (result) => {
            if (!result?.ok) console.error('[Socket] TAKE failed:', result?.error)
        })
    },

    run: () => {
        if (!socket) return
        socket.emit('intent:run', (result) => {
            if (!result?.ok) console.error('[Socket] RUN failed:', result?.error)
        })
    },

    sendToPreview: () => {
        if (!socket) return
        socket.emit('intent:sendToPreview', (result) => {
            if (!result?.ok) console.error('[Socket] SEND TO PREVIEW failed:', result?.error)
        })
    },

    setNext: (partId: string) => {
        console.log('[Store] setNext called with:', partId)
        if (!socket) {
            console.log('[Store] socket is null!')
            return
        }
        console.log('[Store] emitting intent:setNext')
        socket.emit('intent:setNext', { partId }, (result) => {
            console.log('[Store] setNext result:', result)
            if (!result?.ok) console.error('[Socket] SET NEXT failed:', result?.error)
        })
    },

    setPartOverride: (partId: string, sourceId: string) => {
        if (!socket) return
        socket.emit('intent:setPartOverride', { partId, sourceId }, (result) => {
            if (!result?.ok) console.error('[Socket] SET PART OVERRIDE failed:', result?.error)
        })
    },
    
    clearPartOverride: (partId: string) => {
        if (!socket) return
        socket.emit('intent:clearPartOverride', { partId }, (result) => {
            if (!result?.ok) console.error('[Socket] CLEAR PART OVERRIDE failed:', result?.error)
        })
    },

    addSource: async (source) => {
        const res = await fetch('/api/device/config')
        const config = await res.json()
        const nextConfig = {
            ...config,
            sources: {
                ...config.sources,
                [source.id]: source,
            }
        }
        await fetch('/api/device/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nextConfig),
        })
        set(state => ({
            sources: { ...state.sources, [source.id]: source }
        }))
    }
}))