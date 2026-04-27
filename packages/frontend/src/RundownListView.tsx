/**
 * @file RundownListView.tsx
 * @description Rundown 列表主组件 — 负责数据组装、滚动行为、stats 上报
 *
 * 子模块：
 *   rundown/rundown-constants.ts  — 颜色、类型常量
 *   rundown/rundown-utils.ts      — 纯函数（buildStoryRows, fmtMs, getStoryDisplayType）
 *   rundown/ThumbnailPlaceholder  — 画面占位符
 *   rundown/PartContextMenu       — 右键菜单（Portal）
 *   rundown/StoryRowItem          — Story 行（布局 + 拖拽 + 交互）
 */

import { useMemo, useRef, useEffect, useState } from 'react'
import type { IRundown } from '../../core-lib/src/models/rundown-model'
import type { RundownRuntime } from '../../core-lib/src/socket/socket-contracts'
import { TOOLBAR_HEIGHT } from '../../core-lib/src/ui/ui-constants'
import { C, } from './rundown/rundown-constants'
import { buildStoryRows, injectAnimations } from './rundown/rundown-utils'
import { StoryRowItem } from './rundown/StoryRowItem'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RundownListProps {
    rundown: IRundown
    runtime: RundownRuntime | null
    disabled: boolean
    onSetNext: (partId: string) => void
    onStatsChange?: (stats: { totalMs: number; playedMs: number; remainMs: number; expectedEnd: number }) => void
}

// ─── 列头 ─────────────────────────────────────────────────────────────────────

function ColumnHeader() {
    const col = (label: string, align: 'left' | 'right' | 'center' = 'center') => (
        <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: C.textDim, textTransform: 'uppercase', textAlign: align }}>
            {label}
        </div>
    )
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '80px 160px 1fr 72px 80px', padding: '0 8px', height: TOOLBAR_HEIGHT, alignItems: 'center', background: '#105752', borderBottom: `1px solid ${C.borderStrong}`, flexShrink: 0 }}>
            {col('PG', 'center')}
            {col('SLUG', 'center')}
            {col('', 'left')}
            {col('DUR', 'right')}
            {col('BACK', 'right')}
        </div>
    )
}

// ─── 空状态 ───────────────────────────────────────────────────────────────────

function EmptyState() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, fontFamily: C.mono, fontSize: 11, color: C.textDim, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            NO RUNDOWN DATA
        </div>
    )
}

// ─── 底部汇总栏 ───────────────────────────────────────────────────────────────

function fmtMs(ms: number) {
    if (!ms || ms <= 0) return '—'
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function fmtTimeOfDay(ms: number) {
    const d = new Date(ms)
    return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

function TotalBar({ stats }: { stats: { totalMs: number; playedMs: number; remainMs: number; expectedEnd: number } }) {
    const items = [
        { lbl: 'TOTAL',  val: fmtMs(stats.totalMs),   color: C.textSec },
        { lbl: 'PLAYED', val: fmtMs(stats.playedMs),  color: C.textSec },
        { lbl: 'REM',    val: fmtMs(stats.remainMs),  color: stats.remainMs > 0 && stats.remainMs < 120_000 ? '#e74c3c' : C.pvwLabel },
        { lbl: 'ETA',    val: stats.remainMs > 0 ? fmtTimeOfDay(stats.expectedEnd) : '—', color: C.textSec },
    ]
    return (
        <div style={{ height: 26, borderTop: `1px solid ${C.borderStrong}`, display: 'flex', alignItems: 'center', padding: '0 10px', background: C.bgSurface, flexShrink: 0, gap: 0 }}>
            {items.map((item, i) => (
                <div key={item.lbl} style={{ display: 'flex', alignItems: 'center' }}>
                    {i > 0 && <div style={{ width: 1, height: 12, background: C.borderMid, margin: '0 10px' }} />}
                    <span style={{ fontFamily: C.mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: C.textDim, textTransform: 'uppercase', marginRight: 5 }}>{item.lbl}</span>
                    <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 500, color: item.color }}>{item.val}</span>
                </div>
            ))}
        </div>
    )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function RundownListView({ rundown, runtime, disabled, onSetNext, onStatsChange }: RundownListProps) {
    injectAnimations()
    const rows = useMemo(() => buildStoryRows(rundown), [rundown])

    const isAutoFollowRef   = useRef(true)
    const [showManualBanner, setShowManualBanner] = useState(false)
    const [containerHeight, setContainerHeight]   = useState(600)
    const scrollContainerRef = useRef<HTMLDivElement | null>(null)
    const onAirRowRef        = useRef<HTMLDivElement | null>(null)
    const prevOnAirPartId    = useRef<string | null>(null)
    const animFrameRef       = useRef<number | null>(null)
    const [followTrigger, setFollowTrigger] = useState(0)

    useEffect(() => {
        if (scrollContainerRef.current) setContainerHeight(scrollContainerRef.current.clientHeight)
    }, [])

    useEffect(() => {
        if (!runtime?.onAirPartId) return
        if (runtime.onAirPartId !== prevOnAirPartId.current) {
            prevOnAirPartId.current = runtime.onAirPartId
            isAutoFollowRef.current = true
            setShowManualBanner(false)
        }
        if (!isAutoFollowRef.current) return

        const timeoutId = setTimeout(() => {
            if (!onAirRowRef.current || !scrollContainerRef.current) return
            const container = scrollContainerRef.current
            const row       = onAirRowRef.current
            const startTop  = container.scrollTop
            const targetTop = row.offsetTop - container.offsetTop
            const distance  = targetTop - startTop
            if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current)
            const duration  = 800
            const startTime = performance.now()
            const animate = (currentTime: number) => {
                const elapsed  = currentTime - startTime
                const progress = Math.min(elapsed / duration, 1)
                const ease     = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2
                container.scrollTop = startTop + distance * ease
                if (progress < 1) { animFrameRef.current = requestAnimationFrame(animate) }
                else { container.scrollTop = startTop + distance; animFrameRef.current = null }
            }
            animFrameRef.current = requestAnimationFrame(animate)
        }, 50)
        return () => clearTimeout(timeoutId)
    }, [runtime?.onAirPartId, followTrigger])

    const stats = useMemo(() => {
        const allParts = rows.flatMap(r => r.parts)
        const totalMs  = allParts.reduce((a, p) => a + (p.expectedDuration ?? 0), 0)
        const onAirIdx = runtime?.onAirPartId ? allParts.findIndex(p => (p._id as string) === runtime.onAirPartId) : -1
        const playedMs = onAirIdx >= 0 ? allParts.slice(0, onAirIdx).reduce((a, p) => a + (p.expectedDuration ?? 0), 0) : 0
        const remainMs = totalMs - playedMs
        return { totalMs, playedMs, remainMs, expectedEnd: Date.now() + remainMs }
    }, [rows, runtime?.onAirPartId])

    useEffect(() => { onStatsChange?.(stats) }, [stats])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: C.bgBase }}>
            <ColumnHeader />
            {showManualBanner && runtime?.onAirPartId && (
                <div
                    onClick={() => { isAutoFollowRef.current = true; setShowManualBanner(false); setFollowTrigger(n => n + 1) }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 24, background: 'rgba(138,106,0,0.15)', borderBottom: '1px solid rgba(138,106,0,0.3)', cursor: 'pointer', fontFamily: C.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#e0b830', flexShrink: 0 }}
                >
                    ⚓ 手动模式 — 点击恢复自动跟随
                </div>
            )}
            <div
                ref={scrollContainerRef}
                onWheel={() => { isAutoFollowRef.current = false; setShowManualBanner(true) }}
                onTouchMove={() => { isAutoFollowRef.current = false; setShowManualBanner(true) }}
                style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${C.borderStrong} transparent`, overflowAnchor: 'none' }}
            >
                {rows.length === 0 ? <EmptyState /> : rows.map((row, idx) => {
                    const onAirSegIdx   = rows.findIndex(r => r.parts.some(p => (p._id as string) === runtime?.onAirPartId))
                    const previewSegIdx = rows.findIndex(r => r.parts.some(p => (p._id as string) === runtime?.previewPartId))
                    const isOnAir   = idx === onAirSegIdx
                    const isPreview = !isOnAir && (
                        (onAirSegIdx === -1 && previewSegIdx === idx && runtime?.previewPartId != null)
                        || (onAirSegIdx >= 0 && (
                            previewSegIdx === idx
                            || (previewSegIdx === -1 && idx === onAirSegIdx + 1)
                            || (previewSegIdx === onAirSegIdx && idx === onAirSegIdx + 1)
                        ))
                    )
                    const isPlayed = onAirSegIdx >= 0 && idx < onAirSegIdx

                    return (
                        <StoryRowItem
                            key={row.segment._id as string}
                            row={row}
                            isOnAir={isOnAir}
                            isPreview={isPreview}
                            isNext={false}
                            isPlayed={isPlayed}
                            disabled={disabled}
                            onSetNext={onSetNext}
                            runtime={runtime}
                            rundown={rundown}
                            ref={isOnAir ? onAirRowRef : null}
                        />
                    )
                })}
                <div style={{ height: containerHeight }} />
            </div>
            <TotalBar stats={stats} />
        </div>
    )
}