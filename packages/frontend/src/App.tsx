/**
 * @file App.tsx
 * @description RCAS 主界面
 *
 * 布局规范（v3.0）：
 *   顶栏 48px — Logo | 连接状态 | Rundown名称 | ENGINE状态 | 时钟
 *   左侧 60% — Rundown 列表主体
 *   右侧 40% — 操作区（PVW/PGM监看占位 | ON AIR状态+进度条 | TAKE/STP按钮）
 *
 * ⚠️  Mock 数据已移除，恢复真实后端连接。
 *     mockRundown.ts 文件保留，可供独立测试使用。
 */

import { useEffect, useRef, useState } from 'react'
import RundownListView from './RundownListView'
import { useRCASStore } from './store/useRCASStore'
import { useTricasterFrame } from './hooks/useTricasterFrame'
import type { RundownRuntime } from '../../core-lib/src/socket/socket-contracts'
import type { IRundown } from '../../core-lib/src/models/rundown-model'
import type { ISegment } from '../../core-lib/src/models/segment-model'
import type { IPart } from '../../core-lib/src/models/part-model'
import { PartType } from '../../core-lib/src/models/enums'
import { TOOLBAR_HEIGHT, SOURCE_CARD_ROWS, DDR_TOOLBAR_HEIGHT, CG_PREVIEW_HEIGHT } from '../../core-lib/src/ui/ui-constants'

// ─── 颜色 / 常量 ─────────────────────────────────────────────────────────────

const COLOR = {
    pgm:     '#C0392B',
    pvw:     '#27AE60',
    next:    '#F39C12',
    gray:    '#7F8C8D',
    blue:    '#0F3460',
    bgDark:  '#1C1C1C',
    bgPanel: '#222222',
    bgRow:   '#272727',
    border:  '#2A2A2A',
    text:    '#E8E8E8',
    textDim: '#666',
}

// 实时时钟 hook
function useClock() {
    const [syncing, setSyncing] = useState(false)
    const [time, setTime] = useState(() => new Date())

    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 500)
        return () => clearInterval(t)
    }, [])

    const sync = async () => {
        setSyncing(true)
        try {
            const res = await fetch('/api/time/sync', { method: 'POST' })
            await res.json()
        } catch (e) {
            // 静默失败
        } finally {
            setSyncing(false)
        }
    }

    return {
        display: time.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        syncing,
        sync,
    }
}

function fmtMs(ms: number): string {
    if (!ms || ms <= 0) return '—'
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function App() {
    const {
        connected, summaries, activeRundown, runtime,
        activate, take, setNext, run, stop, _initSocket,
        tricasterStatus,
    } = useRCASStore()

    const [isRunning, setIsRunning] = useState(false)
    const [showRundownPanel, setShowRundownPanel] = useState(false)
    const [selectedId, setSelectedId]             = useState<string | null>(null)

    useEffect(() => {
        _initSocket()
    }, [])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return
            if (e.code === 'Space') {
                e.preventDefault()
                if (isRunning) take()
            } else if (e.code === 'Enter') {
                e.preventDefault()
            } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                const store = useRCASStore.getState()
                const rows = (store.activeRundown?.segments ?? [])
                    .filter(seg => (seg.parts ?? []).length > 0)
                    .map(seg => ({
                        segmentId: seg._id as string,
                        parts: seg.parts ?? [],
                    }))
                if (rows.length === 0) return
                store.setKeyboardMode(true)
                e.preventDefault()
            
                const currentSegIdx = rows.findIndex(r => r.segmentId === store.hoveredSegmentId)
            
                if (e.code === 'ArrowUp') {
                    const targetIdx = currentSegIdx <= 0 ? 0 : currentSegIdx - 1
                    store.setHoveredSegmentId(rows[targetIdx].segmentId)
                    store.setHoveredPartId(rows[targetIdx].parts[0]?._id as string ?? null)
                }
            
                if (e.code === 'ArrowDown') {
                    const targetIdx = currentSegIdx === -1 ? 0
                        : currentSegIdx >= rows.length - 1 ? rows.length - 1
                        : currentSegIdx + 1
                    store.setHoveredSegmentId(rows[targetIdx].segmentId)
                    store.setHoveredPartId(rows[targetIdx].parts[0]?._id as string ?? null)
                }
            
                if (e.code === 'ArrowLeft') {
                    if (currentSegIdx === -1) return
                    const currentRow = rows[currentSegIdx]
                    const currentPartIdx = currentRow.parts.findIndex(p => (p._id as string) === store.hoveredPartId)
                    if (currentPartIdx > 0) {
                        store.setHoveredPartId(currentRow.parts[currentPartIdx - 1]._id as string)
                    } else if (currentSegIdx > 0) {
                        const prevRow = rows[currentSegIdx - 1]
                        store.setHoveredSegmentId(prevRow.segmentId)
                        store.setHoveredPartId(prevRow.parts[prevRow.parts.length - 1]?._id as string ?? null)
                    }
                }
            
                if (e.code === 'ArrowRight') {
                    if (currentSegIdx === -1) return
                    const currentRow = rows[currentSegIdx]
                    const currentPartIdx = currentRow.parts.findIndex(p => (p._id as string) === store.hoveredPartId)
                    if (currentPartIdx < currentRow.parts.length - 1) {
                        store.setHoveredPartId(currentRow.parts[currentPartIdx + 1]._id as string)
                    } else if (currentSegIdx < rows.length - 1) {
                        const nextRow = rows[currentSegIdx + 1]
                        store.setHoveredSegmentId(nextRow.segmentId)
                        store.setHoveredPartId(nextRow.parts[0]?._id as string ?? null)
                    }
                }
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [take, isRunning])

    const engineState    = runtime?.engineState ?? 'STOPPED'
    const isDisconnected = !connected
    const activeSum      = summaries.find(s => s.lifecycle === 'active' || s.lifecycle === 'on-air')

    // 是否有活跃 Rundown 数据
    const hasRundown = activeRundown !== null

    return (
        <div 
        style={{
            display:       'flex',
            flexDirection: 'column',
            height:        '100vh',
            background:    COLOR.bgDark,
            color:         COLOR.text,
            fontFamily:    '"IBM Plex Sans Condensed", "Noto Sans SC", sans-serif',
            fontSize:      '13px',
            overflow:      'hidden',
            userSelect:    'none',
        }}>
            {/* ── 顶栏 ── */}
            <Header
                connected={connected}
                rundownName={activeSum?.name ?? activeRundown?.name ?? null}
                engineState={engineState}
                onOpenRundown={() => setShowRundownPanel(true)}
                onRun={() => {
                    if (!isRunning) {
                        run()
                        setIsRunning(true)
                    } else {
                        stop()
                        setIsRunning(false)
                    }
                }}
                isRunning={isRunning}
                hasRundown={hasRundown}
                tricasterStatus={tricasterStatus}
            />

            {/* ── Rundown 选择面板 ── */}
            {showRundownPanel && (
                <div
                    style={{
                        position:   'fixed',
                        inset:      0,
                        zIndex:     100,
                    }}
                    onClick={() => { setShowRundownPanel(false); setSelectedId(null) }}
                >
                    <div
                        style={{
                            position:   'absolute',
                            top:        48,
                            left:       160,
                            width:      420,
                            background: '#111',
                            border:     `1px solid ${COLOR.border}`,
                            borderRadius: 4,
                            boxShadow:  '0 8px 32px rgba(0,0,0,0.6)',
                            overflow:   'hidden',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* 面板标题 */}
                        <div style={{
                            padding:       '10px 16px',
                            borderBottom:  `1px solid ${COLOR.border}`,
                            fontFamily:    '"JetBrains Mono", monospace',
                            fontSize:      10,
                            fontWeight:    700,
                            letterSpacing: '0.12em',
                            color:         COLOR.textDim,
                            textTransform: 'uppercase',
                        }}>
                            选择节目单
                        </div>

                        {/* Rundown 列表 */}
                        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                            {summaries.length === 0 ? (
                                <div style={{ padding: '20px 16px', color: COLOR.textDim, fontSize: 12 }}>
                                    暂无节目单
                                </div>
                            ) : summaries.map(s => {
                                const isSelected = s.id === selectedId
                                const isActive   = s.lifecycle === 'active' || s.lifecycle === 'on-air'
                                const lcColor    = isActive ? COLOR.pvw : s.lifecycle === 'standby' ? COLOR.next : COLOR.gray
                                return (
                                    <div
                                        key={s.id}
                                        onClick={() => setSelectedId(s.id)}
                                        style={{
                                            display:    'flex',
                                            alignItems: 'center',
                                            gap:        12,
                                            padding:    '10px 16px',
                                            cursor:     'pointer',
                                            background: isSelected ? '#1A1A2E' : 'transparent',
                                            borderLeft: isSelected ? `3px solid ${COLOR.pvw}` : '3px solid transparent',
                                            borderBottom: `1px solid ${COLOR.border}`,
                                        }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{
                                                fontSize:   13,
                                                fontWeight: 600,
                                                color:      isSelected ? COLOR.text : COLOR.textDim,
                                            }}>
                                                {s.name}
                                            </div>
                                            <div style={{ fontSize: 11, color: COLOR.textDim, marginTop: 2 }}>
                                                {s.segmentCount} 个段落
                                            </div>
                                        </div>
                                        <div style={{
                                            fontFamily:    '"JetBrains Mono", monospace',
                                            fontSize:      9,
                                            fontWeight:    700,
                                            letterSpacing: '0.1em',
                                            color:         lcColor,
                                        }}>
                                            {s.lifecycle.toUpperCase()}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* 底部按钮 */}
                        <div style={{
                            display:       'flex',
                            justifyContent:'flex-end',
                            gap:           8,
                            padding:       '10px 16px',
                            borderTop:     `1px solid ${COLOR.border}`,
                        }}>
                            <button
                                onClick={() => { setShowRundownPanel(false); setSelectedId(null) }}
                                style={{
                                    padding:      '5px 16px',
                                    background:   'transparent',
                                    border:       `1px solid ${COLOR.border}`,
                                    borderRadius: 2,
                                    color:        COLOR.textDim,
                                    fontSize:     12,
                                    cursor:       'pointer',
                                }}
                            >
                                取消
                            </button>
                            <button
                                onClick={() => {
                                    if (selectedId && connected) {
                                        activate(selectedId)
                                        setShowRundownPanel(false)
                                        setSelectedId(null)
                                    }
                                }}
                                disabled={!selectedId || !connected}
                                style={{
                                    padding:      '5px 16px',
                                    background:   selectedId && connected ? COLOR.pvw + '22' : 'transparent',
                                    border:       `1px solid ${selectedId && connected ? COLOR.pvw : COLOR.border}`,
                                    borderRadius: 2,
                                    color:        selectedId && connected ? COLOR.pvw : COLOR.textDim,
                                    fontSize:     12,
                                    fontWeight:   700,
                                    cursor:       selectedId && connected ? 'pointer' : 'not-allowed',
                                }}
                            >
                                激 活
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 断线横幅 ── */}
            {isDisconnected && (
                <div style={{
                    background:    '#7B0000',
                    color:         '#FFB3B3',
                    textAlign:     'center',
                    padding:       '6px',
                    fontSize:      '12px',
                    fontWeight:    700,
                    letterSpacing: '0.1em',
                    borderBottom:  '1px solid #C0392B',
                }}>
                    ⚠ 连接中断 — 所有操作已禁用
                </div>
            )}

            {/* ── 主体两栏 ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

            {/* 左栏 60% */}
            <div style={{
                width:         '60%',
                display:       'flex',
                flexDirection: 'column',
                borderRight:   `1px solid ${COLOR.border}`,
                overflow:      'hidden',
            }}>
                {/* ── 信息区 216px ── */}
                <InfoPanel
                    runtime={runtime}
                    activeRundown={activeRundown}
                />
                {/* ── Rundown 列表 ── */}
                {hasRundown ? (
                    <RundownListView
                        rundown={activeRundown!}
                        runtime={runtime}
                        onSetNext={connected ? setNext : () => {}}
                        disabled={!connected || !isRunning}
                    />
                ) : (
                    <div style={{
                        flex:           1,
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        flexDirection:  'column',
                        gap:            12,
                        color:          COLOR.textDim,
                        fontFamily:     '"JetBrains Mono", monospace',
                        fontSize:       11,
                        letterSpacing:  '0.12em',
                    }}>
                        <div>NO ACTIVE RUNDOWN</div>
                        <div style={{ fontSize: 10, opacity: 0.5 }}>点击顶栏 RUNDOWN 选择节目单</div>
                    </div>
                )}
            </div>

            {/* 右栏 40% */}
            <div style={{
                width:         '40%',
                display:       'flex',
                flexDirection: 'column',
                overflow:      'hidden',
            }}>
                <RightPanel />
            </div>

            </div>

            {/* ── 字体加载 ── */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
                * { box-sizing: border-box; margin: 0; padding: 0; }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: #111; }
                ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
                body { overflow: hidden; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
            `}</style>
        </div>
    )
}

// ─── InfoPanel ────────────────────────────────────────────────────────────────

function InfoPanel({ runtime, activeRundown }: {
    runtime: RundownRuntime | null
    activeRundown: IRundown | null
}) {
    const { display: clock, syncing: clockSyncing, sync: syncClock } = useClock()
    const [leftPct, setLeftPct] = useState(50)
    const containerRef = useRef<HTMLDivElement>(null)

    // ── Countdown 计时器 ──────────────────────────────────────────────────────
    const [elapsedMs, setElapsedMs] = useState(0)
    const startTimeRef = useRef<number | null>(null)
    const prevOnAirSegmentId = useRef<string | null>(null)

    // 当前 ON AIR 故事和 Part
    const onAirSegment = activeRundown?.segments?.find((seg: ISegment) =>
        seg.parts?.some((p: IPart) => (p._id as string) === runtime?.onAirPartId)
    ) ?? null

    const onAirSegmentId = onAirSegment ? (onAirSegment._id as string) : null

    useEffect(() => {
        if (onAirSegmentId !== prevOnAirSegmentId.current) {
            prevOnAirSegmentId.current = onAirSegmentId
            startTimeRef.current = runtime?.onAirAt ?? null
            setElapsedMs(0)
        }
    }, [onAirSegmentId])

    useEffect(() => {
        if (!startTimeRef.current || runtime?.engineState === 'STOPPED') {
            setElapsedMs(0)
            return
        }
        const interval = setInterval(() => {
            setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()))
        }, 500)
        return () => clearInterval(interval)
    }, [onAirSegmentId, runtime?.engineState])

    const onDividerMouseDown = (e: React.MouseEvent) => {
        e.preventDefault()
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const onMove = (ev: MouseEvent) => {
            const pct = ((ev.clientX - rect.left) / rect.width) * 100
            setLeftPct(Math.min(80, Math.max(20, pct)))
        }
        const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    const onAirPart = onAirSegment?.parts?.find(
        (p: IPart) => (p._id as string) === runtime?.onAirPartId
    ) ?? null

    const isVideo = onAirPart?.type === PartType.SERVER || onAirPart?.type === PartType.VO
    // 优先用 Octopus 提供的 story 级时长，兜底用 Parts 求和
    const expectedMs = onAirSegment?.expectedDuration
    ?? onAirSegment?.parts?.reduce((a: number, p: IPart) => a + (p.expectedDuration ?? 0), 0)
    ?? 0
    const countdownMs = Math.max(0, expectedMs - elapsedMs)
    // 累计偏差：已播时长 - 理论应播时长（暂用 playedMs 近似）
    const plannedDuration = useRCASStore(s => s.plannedDuration)
    const editorialDuration = activeRundown?.editorialDuration ?? null

    // 整体偏差 = roEdDur偏差 + 当前故事实时偏差
    // roEdDur偏差：Octopus实际总时长 - 节目计划时长
    // 当前故事实时偏差：已播时长 - 预计时长
    const roEdDurDiffMs = (editorialDuration !== null && plannedDuration !== null)
        ? editorialDuration - plannedDuration
        : null
    const isKamOrVO = onAirPart?.type === PartType.KAM || onAirPart?.type === PartType.VO
    const accumFinishedDiffMs = runtime?.accumFinishedDiffMs ?? 0
    const accumDiffMs = roEdDurDiffMs !== null
        ? roEdDurDiffMs + accumFinishedDiffMs + (isKamOrVO ? elapsedMs - expectedMs : 0)
        : null
    const fmtDiff = (ms: number) => {
        const abs = Math.abs(ms)
        const sign = ms >= 0 ? '+' : '-'
        return `${sign}${fmtMs(abs)}`
    }

    return (
        <div
            ref={containerRef}
            style={{
                height:       'calc(20vw * 9 / 16)',
                flexShrink:   0,
                display:      'flex',
                borderBottom: `1px solid ${COLOR.border}`,
                position:     'relative',
                background:   COLOR.bgPanel,
            }}
        >
            {/* ── 左半：字幕区 ── */}
            <div style={{
                width:         `${leftPct}%`,
                display:       'flex',
                flexDirection: 'column',
                borderRight:   `1px solid ${COLOR.border}`,
                overflow:      'hidden',
            }}>
                <div style={{
                    height:        22,
                    flexShrink:    0,
                    borderBottom:  `1px solid ${COLOR.border}`,
                    display:       'flex',
                    alignItems:    'center',
                    padding:       '0 10px',
                    fontFamily:    '"JetBrains Mono", monospace',
                    fontSize:      9,
                    fontWeight:    700,
                    letterSpacing: '0.12em',
                    color:         COLOR.textDim,
                }}>
                    SUBTITLE / CG
                </div>
                <div style={{
                    flex:           1,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    color:          COLOR.textDim,
                    fontFamily:     '"JetBrains Mono", monospace',
                    fontSize:       10,
                    opacity:        0.4,
                }}>
                    — 待实现 —
                </div>
            </div>

            {/* ── 拖动分割线 ── */}
            <div
                onMouseDown={onDividerMouseDown}
                style={{
                    width:      6,
                    flexShrink: 0,
                    cursor:     'col-resize',
                    background: 'transparent',
                    position:   'relative',
                    zIndex:     10,
                }}
            >
                <div style={{
                    position:   'absolute',
                    top:        0,
                    bottom:     0,
                    left:       2,
                    width:      2,
                    background: COLOR.border,
                }}/>
            </div>

            {/* ── 右半：时间信息区 ── */}
            <div style={{
                flex:          1,
                display:       'flex',
                flexDirection: 'column',
                overflow:      'hidden',
                minWidth:      0,
            }}>
                {/* 标题栏 */}
                <div style={{
                    height:        22,
                    flexShrink:    0,
                    borderBottom:  `1px solid ${COLOR.border}`,
                    display:       'flex',
                    alignItems:    'center',
                    padding:       '0 10px',
                    fontFamily:    '"JetBrains Mono", monospace',
                    fontSize:      9,
                    fontWeight:    700,
                    letterSpacing: '0.12em',
                    color:         COLOR.textDim,
                }}>
                    <span>TIMING</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                            onClick={syncClock}
                            title="同步网络标准时间"
                            style={{
                                fontSize: 18,
                                fontWeight: 700,
                                cursor: 'pointer',
                                color: clockSyncing ? '#00ff88' : COLOR.textDim,
                                letterSpacing: '0.08em',
                                userSelect: 'none',
                            }}
                        >
                            {'↻'}
                        </span>
                        <span style={{ color: COLOR.text, fontSize: 11 }}>{clock}</span>
                    </div>
                </div>

                {/* 内容区 */}
                <div style={{
                    flex:    1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px 12px',
                    gap:     8,
                    justifyContent: 'space-between',
                }}>
                    {/* 上：参考信息（预计 + 实际） */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <TimingBox label="预计时长" value={expectedMs > 0 ? fmtMs(expectedMs) : '—'} />
                        <TimingBox label="实际时长" value={elapsedMs > 0 ? fmtMs(elapsedMs) : '—'} />
                    </div>

                    {/* 下：节目余量 + 实时偏差 + Countdown */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <TimingBox
                            label="节目余量"
                            value={roEdDurDiffMs !== null ? fmtDiff(roEdDurDiffMs) : '—'}
                            color={roEdDurDiffMs !== null && roEdDurDiffMs > 0 ? '#ff4444' : roEdDurDiffMs !== null && roEdDurDiffMs < 0 ? '#00ff88' : '#ffffff'}
                        />
                        <TimingBox
                            label="实时偏差"
                            value={runtime?.onAirPartId && accumDiffMs !== null ? fmtDiff(accumDiffMs) : '—'}
                            color={accumDiffMs !== null && accumDiffMs > 0 ? '#ff4444' : accumDiffMs !== null && accumDiffMs < 0 ? '#00ff88' : '#ffffff'}
                        />
                        <TimingBox
                            label="COUNTDOWN"
                            value={isVideo && elapsedMs > 0 ? fmtMs(countdownMs) : '—'}
                            color={countdownMs < 10_000 && isVideo ? '#ff4444' : '#ffffff'}
                            flex={2}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── 时间显示框 ───────────────────────────────────────────────────────────────

function TimingBox({ label, value, color, flex: flexVal }: {
    label:   string
    value:   string
    color?:  string
    flex?:   number
}) {
    return (
        <div style={{
            flex:          flexVal ?? 1,
            background:    '#141920',
            border:        `1px solid #2a3444`,
            borderRadius:  4,
            padding:       '6px 10px',
            display:       'flex',
            flexDirection: 'column',
            gap:           6,
        }}>
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: '0.12em',
                color:         '#f5f5f5',
                textTransform: 'uppercase',
            }}>
                {label}
            </div>
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      24,               // ← 从18增大到24
                fontWeight:    700,              // ← 从600加粗到700
                color:         color ?? '#ffffff',
                letterSpacing: '0.04em',
            }}>
                {value}
            </div>
        </div>
    )
}

// ─── 顶栏 ─────────────────────────────────────────────────────────────────────

function Header({ connected, rundownName, engineState, onOpenRundown, onRun, isRunning, hasRundown, tricasterStatus }: {
    connected:     boolean
    rundownName:   string | null
    engineState:   string
    onOpenRundown: () => void
    onRun:         () => void
    isRunning:     boolean
    hasRundown:    boolean
    tricasterStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR'
}) {
    const engineColor =
        engineState === 'RUNNING'    ? COLOR.pgm  :
        engineState === 'READY'      ? COLOR.pvw  :
        engineState === 'TAKING'     ? '#FF6B35'  :
        engineState === 'TRANSITION' ? '#FF6B35'  :
        engineState === 'ERROR'      ? '#E74C3C'  :
        COLOR.gray

    return (
        <div style={{
            height:       TOOLBAR_HEIGHT,
            minHeight:    TOOLBAR_HEIGHT,
            background:   '#105752',
            borderBottom: `1px solid ${COLOR.border}`,
            display:      'flex',
            alignItems:   'center',
            padding:      '0 16px',
            gap:          16,
        }}>
            {/* Logo */}
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      14,
                fontWeight:    600,
                letterSpacing: '0.2em',
                color:         '#FFF',
                marginRight:   8,
            }}>
                RCAS
            </div>

            {/* 连接状态 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                    width:        7,
                    height:       7,
                    borderRadius: '50%',
                    background:   connected ? COLOR.pvw : COLOR.pgm,
                    boxShadow:    connected ? `0 0 6px ${COLOR.pvw}` : `0 0 6px ${COLOR.pgm}`,
                }}/>
                <span style={{ color: '#FFF', fontSize: 14 }}>
                    {connected ? 'CONNECTED' : 'OFFLINE'}
                </span>
            </div>

            {/* Tricaster 连接状态 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: tricasterStatus === 'CONNECTED' ? COLOR.pvw
                            : tricasterStatus === 'CONNECTING' ? COLOR.next
                            : COLOR.pgm,
                    boxShadow: tricasterStatus === 'CONNECTED' ? `0 0 6px ${COLOR.pvw}`
                            : tricasterStatus === 'CONNECTING' ? `0 0 6px ${COLOR.next}`
                            : `0 0 6px ${COLOR.pgm}`,
                    animation: tricasterStatus === 'CONNECTING' ? 'pulse 1s infinite' : 'none',
                }}/>
                <span style={{ color: '#FFF', fontSize: 14 }}>TC</span>
            </div>

            {/* 分隔 */}
            <div style={{ width: 1, height: 20, background: COLOR.border }}/>

            {/* Rundown 名称 */}
            <div style={{
                flex:         1,
                fontSize:     14,
                fontWeight:   600,
                color:        rundownName ? COLOR.text : COLOR.textDim,
                overflow:     'hidden',
                whiteSpace:   'nowrap',
                textOverflow: 'ellipsis',
            }}>
                {rundownName ?? '— 未选择节目单 —'}
            </div>

            {/* RUN 按钮 — 只有激活了 Rundown 才显示 */}
            {hasRundown && (
                <button
                    onClick={onRun}
                    style={{
                        fontFamily:    '"JetBrains Mono", monospace',
                        fontSize:      12,
                        fontWeight:    700,
                        letterSpacing: '0.1em',
                        color:         isRunning ? '#FFFFFF' : COLOR.text,
                        background:    isRunning ? COLOR.pgm : 'transparent',
                        border:        `1px solid ${isRunning ? COLOR.pgm : COLOR.pvw}`,
                        padding:       '3px 10px',
                        borderRadius:  2,
                        cursor:        'pointer',
                    }}
                >
                    {isRunning ? '■ STOP' : '▶ RUN'}
                </button>
            )}

            {/* RUNDOWN 菜单按钮 */}
            <button
                onClick={onOpenRundown}
                style={{
                    fontFamily:    '"JetBrains Mono", monospace',
                    fontSize:      12,
                    fontWeight:    700,
                    letterSpacing: '0.1em',
                    color:         COLOR.text,
                    background:    'transparent',
                    border:        `1px solid ${COLOR.border}`,
                    padding:       '3px 10px',
                    borderRadius:  2,
                    cursor:        'pointer',
                }}
            >
                RUNDOWN ▾
            </button>

            {/* ENGINE 状态 */}
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      12,
                fontWeight:    700,
                letterSpacing: '0.1em',
                color:         engineColor,
                background:    engineColor + '15',
                border:        `1px solid ${engineColor}40`,
                padding:       '3px 8px',
                borderRadius:  2,
            }}>
                ENGINE {engineState}
            </div>
        </div>
    )
}

// ─── Rundown 选择器（无活跃 Rundown 时显示） ──────────────────────────────────

/* function RundownSelector({ summaries, onActivate, disabled }: {
    summaries:  RundownSummary[]
    onActivate: (id: string) => void
    disabled:   boolean
}) {
    const lc: Record<string, { label: string; color: string }> = {
        'persisted': { label: 'PERSISTED', color: COLOR.gray  },
        'standby':   { label: 'STANDBY',   color: COLOR.next  },
        'active':    { label: 'ACTIVE',    color: COLOR.pvw   },
        'on-air':    { label: 'ON AIR',    color: COLOR.pgm   },
    }

    return (
        <div style={{
            flex:          1,
            overflowY:     'auto',
            padding:       '16px 0',
        }}>
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: '0.12em',
                color:         COLOR.textDim,
                padding:       '0 16px 12px',
                textTransform: 'uppercase',
            }}>
                选择节目单
            </div>

            {summaries.length === 0 ? (
                <div style={{
                    padding:    '32px 16px',
                    color:      COLOR.textDim,
                    textAlign:  'center',
                    fontSize:   12,
                    fontFamily: '"JetBrains Mono", monospace',
                }}>
                    等待 NCS 推送节目单…
                </div>
            ) : (
                summaries.map(s => {
                    const { label, color } = lc[s.lifecycle] ?? { label: s.lifecycle, color: COLOR.gray }
                    return (
                        <div
                            key={s.id}
                            onClick={() => !disabled && onActivate(s.id)}
                            style={{
                                display:      'flex',
                                alignItems:   'center',
                                gap:          12,
                                padding:      '10px 16px',
                                borderBottom: `1px solid ${COLOR.border}`,
                                cursor:       disabled ? 'not-allowed' : 'pointer',
                                opacity:      disabled ? 0.5 : 1,
                                transition:   'background 0.1s',
                            }}
                            onMouseEnter={e => {
                                if (!disabled)
                                    (e.currentTarget as HTMLDivElement).style.background = '#1E1E1E'
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                            }}
                        >
                            <div style={{
                                width:        3,
                                height:       32,
                                background:   color,
                                borderRadius: 2,
                                flexShrink:   0,
                            }}/>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{
                                    fontWeight:   600,
                                    fontSize:     13,
                                    overflow:     'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace:   'nowrap',
                                }}>
                                    {s.name}
                                </div>
                                <div style={{ color: COLOR.textDim, fontSize: 11, marginTop: 2 }}>
                                    {s.segmentCount} 个段落
                                </div>
                            </div>
                            <div style={{
                                fontSize:      10,
                                fontWeight:    700,
                                color,
                                letterSpacing: '0.08em',
                                fontFamily:    '"JetBrains Mono", monospace',
                            }}>
                                {label}
                            </div>
                        </div>
                    )
                })
            )}
        </div>
    )
} */

// ─── 右侧操作区 ───────────────────────────────────────────────────────────────

function RightPanel() {
    const hoveredSegmentId = useRCASStore(s => s.hoveredSegmentId)
    const activeRundown = useRCASStore(s => s.activeRundown)
    const hoveredSegment = hoveredSegmentId
        ? (activeRundown?.segments ?? []).find(s => s._id === hoveredSegmentId) ?? null
        : null
    const { sources } = useRCASStore()
    const [activeTab, setActiveTab] = useState<string>('camera')
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
    const CARD_HEIGHT = 68
    const CARD_GAP = 6
    const CARD_PADDING = 6

    // 按 type 分组，动态生成 Tab 列表
    const TAB_LABELS: Record<string, string> = {
        camera: 'CAM',
        ddr1:   'DDR 1',
        ddr2:   'DDR 2',
        ddr3:   'DDR 3',
        ddr4:   'DDR 4',
        me:     'M/E',
    }

    // 从 sources 里提取出现过的类型，按固定顺序排列
    const TAB_ORDER = ['camera', 'ddr1', 'ddr2', 'ddr3', 'ddr4', 'me']
    const availableTypes = TAB_ORDER.filter(type =>
        Object.values(sources).some(s => s.type === type)
    )

    // 当前 Tab 的源列表
    const currentSources = Object.values(sources).filter(s => s.type === activeTab)
    const tricasterHost = useRCASStore(s => s.tricasterHost)

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
        }}>
            {/* ── 监看画面区（PVW 左 / PGM 右）── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 0,
                background: COLOR.border,
                flexShrink: 0,
            }}>
                <MonitorPlaceholder label="PVW" color={COLOR.pvw} />
                <MonitorPlaceholder label="PGM" color={COLOR.pgm} />
            </div>

            {/* ── 源面板 ── */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
                {/* Tab 标签栏 */}
                <div style={{
                    height: TOOLBAR_HEIGHT,
                    display: 'flex',
                    flexShrink: 0,
                    background: '#0D0D0D',
                    paddingLeft: 0,
                }}>
                    {availableTypes.length === 0 ? (
                        <div style={{
                            padding: '8px 12px',
                            fontSize: 10,
                            color: COLOR.textDim,
                            fontFamily: '"JetBrains Mono", monospace',
                        }}>
                            加载中...
                        </div>
                    ) : availableTypes.map(type => (
                        <div
                            key={type}
                            onClick={() => setActiveTab(type)}
                            style={{
                                height: '100%',
                                padding: '0 16px',
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontFamily: '"JetBrains Mono", monospace',
                                fontSize: 12,
                                letterSpacing: '0.06em',
                                userSelect: 'none',
                                borderRadius: 0,
                                border: 'none',
                                marginBottom: 0,
                                fontWeight: activeTab === type ? 700 : 400,
                                color: activeTab === type ? '#FFFFFF' : COLOR.textDim,
                                background: activeTab === type ? '#3a4a5c' : 'transparent',
                            }}
                        >
                            {TAB_LABELS[type] ?? type.toUpperCase()}
                        </div>
                    ))}
                </div>

                {/* Tab 内容区：源卡片（固定高度） */}
                <div style={{
                    height: CARD_PADDING * 2 + SOURCE_CARD_ROWS * CARD_HEIGHT + (SOURCE_CARD_ROWS - 1) * CARD_GAP + DDR_TOOLBAR_HEIGHT,
                    flexShrink: 0,
                    overflowY: 'auto',
                    padding: CARD_PADDING,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignContent: 'flex-start',
                    gap: CARD_GAP,
                    border: 'none',
                    margin: 0,
                    background: '#3a4a5c',
                }}>
                    {/* DDR Tab 单独处理 */}
                    {['ddr1','ddr2','ddr3','ddr4'].includes(activeTab) ? (
                        <DDRPanel channel={activeTab} />
                    ) : (
                        <>
                            {currentSources.length === 0 && (
                                <div style={{
                                    width: '100%',
                                    textAlign: 'center',
                                    color: COLOR.textDim,
                                    fontSize: 11,
                                    marginTop: 24,
                                    fontFamily: '"JetBrains Mono", monospace',
                                }}>
                                    无可用源
                                </div>
                            )}
                            {currentSources.map(source => (
                                <SourceCard
                                    key={source.id}
                                    source={source}
                                    isSelected={selectedSourceId === source.id}
                                    tricasterHost={activeTab === 'camera' ? tricasterHost : null}
                                    onSelect={() => setSelectedSourceId(source.id)}
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('sourceId', source.id)
                                        e.dataTransfer.effectAllowed = 'copy'
                                    }}
                                />
                            ))}
                            {activeTab === 'camera' && (
                                <AddSourceCard
                                    existingSourceIds={currentSources.map(s => s.id)}
                                    tricasterHost={tricasterHost}
                                />
                            )}
                        </>
                    )}
                </div>

                {/* ── CG 预览区 ── */}
                <div style={{
                    height: TOOLBAR_HEIGHT + CG_PREVIEW_HEIGHT,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    borderTop: `1px solid ${COLOR.border}`,
                }}>
                    {/* 标题栏 */}
                    <div style={{
                        height: TOOLBAR_HEIGHT,
                        flexShrink: 0,
                        borderBottom: `1px solid ${COLOR.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 10px',
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        color: COLOR.textDim,
                    }}>
                        <span>CG PREVIEW</span>
                    </div>

                    {/* 预览画面区 */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'row',    // ← 改为横向
                        alignItems: 'stretch',   // ← 改为撑满高度
                        background: '#000',
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        {/* 左：PG 号 */}
                        <div style={{
                            width: 200,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRight: `1px solid ${COLOR.border}`,
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize: 36,
                            fontWeight: 700,
                            color: hoveredSegment ? COLOR.text : COLOR.textDim,
                            opacity: hoveredSegment ? 1 : 0.3,
                        }}>
                            {hoveredSegment?.storyNum ?? '—'}
                        </div>

                        {/* 中：预览内容区 */}
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            {/* 联调后在此加 <img src={cgFrameUrl} ... /> */}
                            <div style={{
                                color: COLOR.textDim,
                                fontFamily: '"JetBrains Mono", monospace',
                                fontSize: 10,
                                opacity: 0.4,
                            }}>
                                — 待接入 VIZ —
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}

// ─── 源卡片（含实时帧） ────────────────────────────────────────────────────────

function SourceCard({ source, isSelected, tricasterHost, onSelect, onDragStart }: {
    source:       { id: string; label: string; type: string; previewSrc?: string }
    isSelected:   boolean
    tricasterHost: string | null
    onSelect:     () => void
    onDragStart:  (e: React.DragEvent<HTMLDivElement>) => void
}) {
    // CAM 卡片：直连 Tricaster 实时帧；其他类型不建立连接（tricasterHost 传 null）
    const frameUrl = useTricasterFrame(
        tricasterHost,
        source.previewSrc ?? null
    )

    return (
        <div
            draggable
            onClick={onSelect}
            onDragStart={onDragStart}
            style={{
                width:        '120px',
                aspectRatio:  '16/9',
                background:   isSelected ? '#3A3A3A' : '#1C1C1C',
                border:       `1px solid ${isSelected ? COLOR.pvw : COLOR.border}`,
                borderRadius: 3,
                display:      'flex',
                flexDirection:'column',
                alignItems:   'center',
                justifyContent: 'center',
                cursor:       'grab',
                position:     'relative',
                overflow:     'hidden',
            }}
        >
            {/* 实时帧（CAM 类型且有帧时显示） */}
            {frameUrl ? (
                <img
                    src={frameUrl}
                    alt={source.id}
                    style={{
                        position:   'absolute',
                        inset:      0,
                        width:      '100%',
                        height:     '100%',
                        objectFit:  'cover',
                    }}
                />
            ) : (
                /* 无帧时显示图标占位 */
                <div style={{ fontSize: 14, marginBottom: 4, opacity: 0.4 }}>
                    {source.type === 'camera' ? '📷' : source.type === 'vt' ? '▶' : '🎬'}
                </div>
            )}

            {/* 源 ID 标签（叠加在帧上） */}
            <div style={{
                position:      'absolute',
                bottom:        0,
                left:          0,
                right:         0,
                padding:       '2px 4px',
                background:    'rgba(0,0,0,0.65)',
                fontSize:      9,
                fontWeight:    700,
                color:         COLOR.text,
                fontFamily:    '"JetBrains Mono", monospace',
                letterSpacing: '0.06em',
                display:       'flex',
                justifyContent:'space-between',
                alignItems:    'center',
            }}>
                <span>{source.id}</span>
                <span style={{ color: COLOR.textDim, fontWeight: 400 }}>{source.label}</span>
            </div>

            {/* 选中高亮边框遮罩 */}
            {isSelected && (
                <div style={{
                    position:      'absolute',
                    inset:         0,
                    border:        `2px solid ${COLOR.pvw}`,
                    borderRadius:  3,
                    pointerEvents: 'none',
                }}/>
            )}
        </div>
    )
}

// ─── 监看占位块 ───────────────────────────────────────────────────────────────

function MonitorPlaceholder({ label, color }: {
    label: string
    color: string
}) {
    return (
        <div style={{
            aspectRatio:    '16/9',
            background:     '#080808',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            position:       'relative',
            overflow:       'hidden',
        }}>
            <div style={{
                position:      'absolute',
                inset:         0,
                border:        `2px solid ${color}33`,
                pointerEvents: 'none',
            }}/>
            <div style={{
                position:      'absolute',
                top:           6,
                left:          8,
                fontSize:      9,
                fontWeight:    700,
                color:         color,
                letterSpacing: '0.12em',
                background:    '#000000AA',
                padding:       '1px 4px',
                fontFamily:    '"JetBrains Mono", monospace',
            }}>
                {label}
            </div>
            <div style={{ fontSize: 11, color: COLOR.textDim }}>
                — 无信号 —
            </div>
        </div>
    )
}

function AddSourceCard({ existingSourceIds, tricasterHost }: {
    existingSourceIds: string[]
    tricasterHost: string | null
}) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { addSource } = useRCASStore()

    // CAM 号候选列表：CAM1-CAM9 里去掉已配置的
    const candidates = ['CAM1','CAM2','CAM3','CAM4','CAM5','CAM6','CAM7','CAM8','CAM9']
        .filter(id => !existingSourceIds.includes(id))

    async function handleSelect(camId: string) {
        if (!tricasterHost) return
        setLoading(true)
        setError(null)

        try {
            // 查询 Tricaster，验证 iso_label 是否存在
            const res = await fetch(`/api/device/inputs`)
            const data = await res.json()
            const slot = data.slots?.find((s: any) =>
                s.switcherName?.toUpperCase() === camId.toUpperCase()
            )

            if (!slot) {
                setError(`Tricaster 中未找到 ${camId}，请先在 Tricaster 中命名该槽位`)
                setLoading(false)
                return
            }

            // 验证通过，保存到 device-config
            await addSource({
                id:          camId,
                label:       camId,
                type:        'camera',
                previewSrc:  slot.previewSrc,
                switcherName: slot.switcherName,
            })

            setOpen(false)
        } catch (err: any) {
            setError('查询失败，请检查网络连接')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ position: 'relative' }}>
            {/* "+"卡片按钮 */}
            <div
                onClick={() => { setOpen(!open); setError(null) }}
                style={{
                    width:          '120px',
                    aspectRatio:    '16/9',
                    background:     open ? '#2A2A2A' : '#1C1C1C',
                    border:         `1px dashed ${COLOR.border}`,
                    borderRadius:   3,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    cursor:         'pointer',
                    color:          COLOR.textDim,
                    fontSize:       22,
                    fontWeight:     300,
                    userSelect:     'none',
                    transition:     'background 0.1s',
                }}
            >
                +
            </div>

            {/* 下拉选单 */}
            {open && (
                <div style={{
                    position:   'absolute',
                    top:        '100%',
                    left:       0,
                    marginTop:  4,
                    background: '#1A1A1A',
                    border:     `1px solid ${COLOR.border}`,
                    borderRadius: 4,
                    zIndex:     100,
                    minWidth:   120,
                    overflow:   'hidden',
                }}>
                    {candidates.length === 0 ? (
                        <div style={{
                            padding:    '8px 12px',
                            fontSize:   11,
                            color:      COLOR.textDim,
                            fontFamily: '"JetBrains Mono", monospace',
                        }}>
                            无可添加
                        </div>
                    ) : candidates.map(camId => (
                        <div
                            key={camId}
                            onClick={() => handleSelect(camId)}
                            style={{
                                padding:    '7px 12px',
                                fontSize:   11,
                                color:      loading ? COLOR.textDim : COLOR.text,
                                fontFamily: '"JetBrains Mono", monospace',
                                cursor:     loading ? 'not-allowed' : 'pointer',
                                borderBottom: `1px solid ${COLOR.border}`,
                            }}
                            onMouseEnter={e => {
                                if (!loading)
                                    (e.currentTarget as HTMLDivElement).style.background = '#2A2A2A'
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                            }}
                        >
                            {loading ? '验证中...' : camId}
                        </div>
                    ))}

                    {/* 错误提示 */}
                    {error && (
                        <div style={{
                            padding:    '6px 12px',
                            fontSize:   10,
                            color:      COLOR.pgm,
                            fontFamily: '"JetBrains Mono", monospace',
                            borderTop:  `1px solid ${COLOR.border}`,
                            lineHeight: 1.4,
                        }}>
                            {error}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── DDR 面板 ────────────────────────────────────────────────────────────────

interface DDRFile {
    name:     string
    fullPath: string
    selected: boolean
}

function DDRPanel({ channel }: { channel: string }) {
    const tricasterHost = useRCASStore(s => s.tricasterHost)
    const [ddrFiles, setDdrFiles] = useState<Record<string, DDRFile[]>>({
        DDR1: [], DDR2: [], DDR3: [], DDR4: [],
    })
    const [showBrowser, setShowBrowser] = useState(false)
    const [lastSelected, setLastSelected] = useState<number | null>(null)

    const channelKey = channel.toUpperCase()       // 'DDR1'
    const channelCmd = channel.toLowerCase()        // 'ddr1'
    const currentFiles = ddrFiles[channelKey] ?? []

    function handleFileClick(index: number, e: React.MouseEvent) {
        setDdrFiles(prev => {
            const files = [...(prev[channelKey] ?? [])]

            if (e.shiftKey && lastSelected !== null) {
                const from = Math.min(lastSelected, index)
                const to   = Math.max(lastSelected, index)
                return {
                    ...prev,
                    [channelKey]: files.map((f, i) => ({
                        ...f,
                        selected: i >= from && i <= to ? true : f.selected,
                    }))
                }
            } else if (e.ctrlKey || e.metaKey) {
                return {
                    ...prev,
                    [channelKey]: files.map((f, i) => ({
                        ...f,
                        selected: i === index ? !f.selected : f.selected,
                    }))
                }
            } else {
                return {
                    ...prev,
                    [channelKey]: files.map((f, i) => ({
                        ...f,
                        selected: i === index,
                    }))
                }
            }
        })
        setLastSelected(index)

        // 单选时通知 Tricaster 选中该文件
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && tricasterHost) {
            const file = ddrFiles[channelKey]?.[index]
            if (file) {
                fetch(`http://${tricasterHost}/v1/shortcut?name=${channelCmd}_select_file&path=${encodeURIComponent(file.fullPath)}`)
                    .catch(() => {})
            }
        }
    }

    async function handleFilesSelected(files: { name: string; fullPath: string }[]) {
        if (!tricasterHost || files.length === 0) return

        const paths = files.map(f => f.fullPath).join('|')
        await fetch('/api/ddr/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: channelCmd, filePath: paths }),
        })

        setDdrFiles(prev => ({
            ...prev,
            [channelKey]: [
                ...(prev[channelKey] ?? []),
                ...files.map(f => ({ ...f, selected: false })),
            ]
        }))
        setShowBrowser(false)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            {/* 添加按钮 */}
            <div style={{
                display:      'flex',
                justifyContent: 'flex-end',
                padding:      '4px 6px',
                borderBottom: `1px solid ${COLOR.border}`,
                flexShrink:   0,
            }}>
                <div
                    onClick={() => setShowBrowser(true)}
                    style={{
                        padding:      '4px 10px',
                        fontSize:     10,
                        color:        COLOR.pvw,
                        cursor:       'pointer',
                        fontFamily:   '"JetBrains Mono", monospace',
                        border:       `1px solid ${COLOR.pvw}44`,
                        borderRadius: 2,
                        userSelect:   'none',
                    }}
                >
                    + 添加
                </div>
            </div>

            {/* 文件列表 */}
            <div style={{
                flex:         1,
                overflowY:    'auto',
                padding:      6,
                display:      'flex',
                flexWrap:     'wrap',
                alignContent: 'flex-start',
                gap:          6,
            }}>
                {currentFiles.length === 0 ? (
                    <div style={{
                        width:      '100%',
                        textAlign:  'center',
                        color:      COLOR.textDim,
                        fontSize:   11,
                        marginTop:  24,
                        fontFamily: '"JetBrains Mono", monospace',
                    }}>
                        暂无文件，点击"+ 添加"
                    </div>
                ) : currentFiles.map((file, index) => (
                    <DDRFileCard
                        key={file.fullPath + index}
                        file={file}
                        index={index}
                        onClick={(e) => handleFileClick(index, e)}
                        onDragStart={(e) => {
                            e.dataTransfer.setData('sourceId', channelKey)
                            e.dataTransfer.setData('sourceType', 'ddr')
                            e.dataTransfer.setData('ddrFile', file.fullPath)
                            e.dataTransfer.effectAllowed = 'copy'
                        }}
                    />
                ))}
            </div>

            {/* 文件浏览弹窗 */}
            {showBrowser && (
                <FileBrowserModal
                    title={`${channelKey} — 选择文件`}
                    onConfirm={handleFilesSelected}
                    onCancel={() => setShowBrowser(false)}
                />
            )}
        </div>
    )
}

// ─── DDR 文件卡片 ─────────────────────────────────────────────────────────────

function DDRFileCard({ file, index, onClick, onDragStart }: {
    file:        DDRFile
    index:       number
    onClick:     (e: React.MouseEvent) => void
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => void
}) {
    // 截断文件名
    const displayName = file.name.length > 14
        ? file.name.slice(0, 13) + '…'
        : file.name

    const pgLabel = String(index + 1).padStart(2, '0')

    return (
        <div
            draggable
            onClick={onClick}
            onDragStart={onDragStart}
            style={{
                width:         '120px',
                aspectRatio:   '16/9',
                background:    file.selected ? '#2A3A2A' : '#1C1C1C',
                border:        `1px solid ${file.selected ? COLOR.pvw : COLOR.border}`,
                borderRadius:  3,
                display:       'flex',
                flexDirection: 'column',
                alignItems:    'center',
                justifyContent:'center',
                cursor:        'grab',
                position:      'relative',
                overflow:      'hidden',
                userSelect:    'none',
            }}
        >
            {/* 视频图标占位（联调后替换为真实缩略图） */}
            <div style={{ fontSize: 20, opacity: 0.3 }}>🎬</div>

            {/* 底部标签：序号 + 文件名 */}
            <div style={{
                position:      'absolute',
                bottom:        0,
                left:          0,
                right:         0,
                padding:       '2px 4px',
                background:    'rgba(0,0,0,0.75)',
                fontSize:      9,
                fontWeight:    700,
                color:         COLOR.text,
                fontFamily:    '"JetBrains Mono", monospace',
                letterSpacing: '0.04em',
                display:       'flex',
                gap:           4,
                alignItems:    'center',
            }}>
                <span style={{ color: COLOR.textDim, flexShrink: 0 }}>{pgLabel}</span>
                <span style={{
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                }}>
                    {displayName}
                </span>
            </div>

            {/* 选中高亮遮罩 */}
            {file.selected && (
                <div style={{
                    position:      'absolute',
                    inset:         0,
                    border:        `2px solid ${COLOR.pvw}`,
                    borderRadius:  3,
                    pointerEvents: 'none',
                }}/>
            )}
        </div>
    )
}

// ─── 文件浏览弹窗 ─────────────────────────────────────────────────────────────

interface FileEntry {
    name:        string
    fullPath:    string
    isDirectory: boolean
}

function FileBrowserModal({ title, onConfirm, onCancel }: {
    title:     string
    onConfirm: (files: { name: string; fullPath: string }[]) => void
    onCancel:  () => void
}) {
    const [currentPath, setCurrentPath]   = useState<string>('')
    const [entries, setEntries]           = useState<FileEntry[]>([])
    const [parent, setParent]             = useState<string | null>(null)
    const [selected, setSelected]         = useState<Set<string>>(new Set())
    const [lastClicked, setLastClicked]   = useState<number | null>(null)
    const [loading, setLoading]           = useState(false)
    const [error, setError]               = useState<string | null>(null)

    // 初始加载根目录
    useEffect(() => { browse('') }, [])

    async function browse(path: string) {
        setLoading(true)
        setError(null)
        try {
            const url = path ? `/api/files/browse?path=${encodeURIComponent(path)}` : '/api/files/browse'
            const res  = await fetch(url)
            const data = await res.json()
            if (data.error) { setError(data.error); return }
            setEntries(data.entries ?? [])
            setCurrentPath(data.current ?? path)
            setParent(data.parent ?? null)
            setSelected(new Set())
            setLastClicked(null)
        } catch {
            setError('无法读取目录')
        } finally {
            setLoading(false)
        }
    }

    function handleEntryClick(entry: FileEntry, _index: number, e: React.MouseEvent) {
        if (entry.isDirectory) {
            browse(entry.fullPath)
            return
        }

        // 文件选择，支持 Shift/Ctrl 多选
        const fileEntries = entries.filter(e => !e.isDirectory)
        const fileIndex   = fileEntries.indexOf(entry)

        setSelected(prev => {
            const next = new Set(prev)
            if (e.shiftKey && lastClicked !== null) {
                const from = Math.min(lastClicked, fileIndex)
                const to   = Math.max(lastClicked, fileIndex)
                fileEntries.slice(from, to + 1).forEach(f => next.add(f.fullPath))
            } else if (e.ctrlKey || e.metaKey) {
                next.has(entry.fullPath) ? next.delete(entry.fullPath) : next.add(entry.fullPath)
            } else {
                next.clear()
                next.add(entry.fullPath)
            }
            return next
        })
        setLastClicked(fileIndex)
    }

    function handleConfirm() {
        const selectedFiles = entries
            .filter(e => !e.isDirectory && selected.has(e.fullPath))
            .map(e => ({ name: e.name, fullPath: e.fullPath }))
        if (selectedFiles.length > 0) onConfirm(selectedFiles)
    }

    // 视频文件扩展名
    const VIDEO_EXT = ['.mp4', '.mov', '.avi', '.mxf', '.mkv', '.wmv', '.m4v']
    const isVideo = (name: string) =>
        VIDEO_EXT.some(ext => name.toLowerCase().endsWith(ext))

    return (
        <div
            style={{
                position:   'fixed',
                inset:      0,
                zIndex:     200,
                background: 'rgba(0,0,0,0.7)',
                display:    'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
            onClick={onCancel}
        >
            <div
                style={{
                    width:        520,
                    maxHeight:    480,
                    background:   '#151515',
                    border:       `1px solid ${COLOR.border}`,
                    borderRadius: 6,
                    display:      'flex',
                    flexDirection:'column',
                    overflow:     'hidden',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* 标题栏 */}
                <div style={{
                    padding:      '10px 16px',
                    borderBottom: `1px solid ${COLOR.border}`,
                    fontFamily:   '"JetBrains Mono", monospace',
                    fontSize:     11,
                    fontWeight:   700,
                    color:        COLOR.text,
                    letterSpacing:'0.08em',
                }}>
                    {title}
                </div>

                {/* 当前路径 */}
                <div style={{
                    padding:      '5px 16px',
                    borderBottom: `1px solid ${COLOR.border}`,
                    fontFamily:   '"JetBrains Mono", monospace',
                    fontSize:     9,
                    color:        COLOR.textDim,
                    letterSpacing:'0.04em',
                    whiteSpace:   'nowrap',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {currentPath || '根目录'}
                </div>

                {/* 文件列表 */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading && (
                        <div style={{
                            padding:    '20px',
                            textAlign:  'center',
                            color:      COLOR.textDim,
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize:   11,
                        }}>
                            加载中...
                        </div>
                    )}

                    {error && (
                        <div style={{
                            padding:    '20px',
                            textAlign:  'center',
                            color:      COLOR.pgm,
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize:   11,
                        }}>
                            {error}
                        </div>
                    )}

                    {/* 返回上级 */}
                    {!loading && parent !== null && (
                        <div
                            onClick={() => browse(parent)}
                            style={{
                                padding:      '7px 16px',
                                display:      'flex',
                                alignItems:   'center',
                                gap:          8,
                                cursor:       'pointer',
                                borderBottom: `1px solid ${COLOR.border}`,
                                color:        COLOR.textDim,
                                fontSize:     12,
                                fontFamily:   '"JetBrains Mono", monospace',
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#2A2A2A'}
                            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                        >
                            <span>📁</span>
                            <span>..</span>
                        </div>
                    )}

                    {/* 目录和文件列表 */}
                    {!loading && entries.map((entry, index) => {
                        const isSelected = !entry.isDirectory && selected.has(entry.fullPath)
                        const show = entry.isDirectory || isVideo(entry.name)
                        if (!show) return null

                        return (
                            <div
                                key={entry.fullPath}
                                onClick={(e) => handleEntryClick(entry, index, e)}
                                style={{
                                    padding:      '7px 16px',
                                    display:      'flex',
                                    alignItems:   'center',
                                    gap:          8,
                                    cursor:       entry.isDirectory ? 'pointer' : 'default',
                                    borderBottom: `1px solid ${COLOR.border}`,
                                    background:   isSelected ? `${COLOR.pvw}22` : 'transparent',
                                    color:        isSelected ? COLOR.pvw : entry.isDirectory ? COLOR.textDim : COLOR.text,
                                    fontSize:     12,
                                    fontFamily:   '"JetBrains Mono", monospace',
                                }}
                                onMouseEnter={e => {
                                    if (!isSelected)
                                        (e.currentTarget as HTMLDivElement).style.background = '#2A2A2A'
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLDivElement).style.background = isSelected ? `${COLOR.pvw}22` : 'transparent'
                                }}
                            >
                                <span>{entry.isDirectory ? '📁' : '🎬'}</span>
                                <span style={{
                                    flex:         1,
                                    overflow:     'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace:   'nowrap',
                                }}>
                                    {entry.name}
                                </span>
                                {isSelected && <span style={{ fontSize: 10, color: COLOR.pvw }}>✓</span>}
                            </div>
                        )
                    })}
                </div>

                {/* 底部按钮栏 */}
                <div style={{
                    padding:      '10px 16px',
                    borderTop:    `1px solid ${COLOR.border}`,
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'space-between',
                }}>
                    <span style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize:   10,
                        color:      COLOR.textDim,
                    }}>
                        {selected.size > 0 ? `已选 ${selected.size} 个文件` : '未选择文件'}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={onCancel}
                            style={{
                                padding:    '5px 16px',
                                background: 'transparent',
                                border:     `1px solid ${COLOR.border}`,
                                borderRadius: 2,
                                color:      COLOR.textDim,
                                fontSize:   12,
                                cursor:     'pointer',
                                fontFamily: '"JetBrains Mono", monospace',
                            }}
                        >
                            取消
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={selected.size === 0}
                            style={{
                                padding:    '5px 16px',
                                background: selected.size > 0 ? `${COLOR.pvw}22` : 'transparent',
                                border:     `1px solid ${selected.size > 0 ? COLOR.pvw : COLOR.border}`,
                                borderRadius: 2,
                                color:      selected.size > 0 ? COLOR.pvw : COLOR.textDim,
                                fontSize:   12,
                                fontWeight: 700,
                                cursor:     selected.size > 0 ? 'pointer' : 'not-allowed',
                                fontFamily: '"JetBrains Mono", monospace',
                            }}
                        >
                            确认
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
