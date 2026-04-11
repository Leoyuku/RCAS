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

// PartOverride 直接内联定义，与 contracts 里的内联类型保持一致
interface PartOverride {
    partId: string
    sourceId: string
    ddrFile?: string
    createdAt: number
}

// ─── Store 形状 ───────────────────────────────────────────────────────────────

interface RCASStore {
    connected: boolean
    summaries: RundownSummary[]
    activeRundown: IRundown | null
    runtime: RundownRuntime | null
    overrides: Record<string, PartOverride>
    tricasterHost: string | null
    tricasterStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR'
    sources: Record<string, { id: string; label: string; type: string }>

    activate: (id: string) => void
    run: () => void
    take: () => void
    sendToPreview: () => void
    setNext: (partId: string) => void
    setPartOverride: (partId: string, sourceId: string, ddrFile?: string) => void
    clearPartOverride: (partId: string) => void
    addSource: (source: { id: string; label: string; type: string; previewSrc: string; switcherName: string }) => Promise<void>

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
    overrides: {},
    sources: {},
    tricasterHost: null,
    tricasterStatus: 'DISCONNECTED',

    _initSocket: () => {
        if (socket) return

        socket = io('', {
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        })

        socket.on('connect', () => {
            console.log('[Socket] Connected')
            set({ connected: true })

            fetch('/api/device/config')
                .then(r => r.json())
                .then(cfg => {
                    if (cfg?.sources) {
                        console.log('[Store] sources loaded:', Object.keys(cfg.sources).length)
                        set({ sources: cfg.sources })
                    }
                    const switcherId = cfg?.activeDevices?.switcher
                    const host = switcherId ? cfg?.devices?.[switcherId]?.connection?.host ?? null : null
                    if (host) console.log('[Store] tricasterHost:', host)
                    set({ tricasterHost: host })
                })
                .catch(err => console.error('[Store] Failed to load device config:', err))
        })

        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason)
            set({ connected: false })
        })

        socket.on('snapshot', ({ summaries }) => {
            console.log('[Socket] Snapshot received:', summaries.length, 'rundown(s)')
            set({ summaries })
        })

        socket.on('rundown:created', ({ id, rundown, lifecycle }) => {
            console.log('[Socket] rundown:created', id)
            set((state) => {
                const exists = state.summaries.find(s => s.id === id)
                if (exists) {
                    return { summaries: state.summaries.map(s => s.id === id ? { ...s, lifecycle } : s) }
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

        socket.on('rundown:updated', ({ id, rundown }) => {
            console.log('[Socket] rundown:updated', id)
            set((state) => ({
                summaries: state.summaries.map(s =>
                    s.id === id
                        ? { ...s, name: rundown.name, segmentCount: rundown.segments?.length ?? s.segmentCount }
                        : s
                ),
                activeRundown: state.activeRundown?._id === id ? rundown : state.activeRundown,
            }))
        })

        socket.on('rundown:deleted', ({ id }) => {
            console.log('[Socket] rundown:deleted', id)
            set((state) => ({
                summaries: state.summaries.filter(s => s.id !== id),
                activeRundown: state.activeRundown?._id === id ? null : state.activeRundown,
            }))
        })

        socket.on('rundown:activated', ({ id, rundown }) => {
            console.log('[Socket] rundown:activated', id)
            set((state) => ({
                summaries: state.summaries.map(s => {
                    if (s.id === id) return { ...s, lifecycle: 'active', name: rundown.name }
                    if (s.lifecycle === 'active') return { ...s, lifecycle: 'standby' }
                    return s
                }),
                activeRundown: rundown,
            }))
        })

        socket.on('rundown:standby', ({ id }) => {
            console.log('[Socket] rundown:standby', id)
            set((state) => ({
                summaries: state.summaries.map(s =>
                    s.id === id ? { ...s, lifecycle: 'standby' } : s
                ),
                activeRundown: state.activeRundown?._id === id ? null : state.activeRundown,
            }))
        })

        socket.on('rundown:lifecycle', ({ id, lifecycle }) => {
            console.log('[Socket] rundown:lifecycle', id, lifecycle)
            set((state) => ({
                summaries: state.summaries.map(s => s.id === id ? { ...s, lifecycle } : s)
            }))
        })

        socket.on('runtime:state', (runtime) => {
            console.log('[Socket] runtime:state', runtime.engineState)
            set({ runtime })
        })

        socket.on('runtime:overrides', ({ overrides }) => {
            const map: Record<string, PartOverride> = {}
            for (const o of overrides) map[o.partId] = o
            set({ overrides: map })
        })

        socket.on('device:status', ({ tricaster }) => {
            set({ tricasterStatus: tricaster })
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

    setPartOverride: (partId: string, sourceId: string, ddrFile?: string) => {
        if (!socket) return
        socket.emit('intent:setPartOverride', { partId, sourceId, ddrFile }, (result) => {
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
    },
}))