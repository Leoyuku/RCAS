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

import { useEffect, useState } from 'react'
import RundownListView from './RundownListView'
import { useRCASStore } from './store/useRCASStore'
import type { IRundown }       from '../../core-lib/src/models/rundown-model'
import type { IPart }          from '../../core-lib/src/models/part-model'
import type { RundownRuntime } from '../../core-lib/src/socket/socket-contracts'

// ─── 颜色 / 常量 ─────────────────────────────────────────────────────────────

const COLOR = {
    pgm:     '#C0392B',
    pvw:     '#27AE60',
    next:    '#F39C12',
    gray:    '#7F8C8D',
    blue:    '#0F3460',
    bgDark:  '#0D0D0D',
    bgPanel: '#131313',
    bgRow:   '#1A1A1A',
    border:  '#2A2A2A',
    text:    '#E8E8E8',
    textDim: '#666',
}

// 格式化毫秒为 M:SS
function fmtMs(ms: number): string {
    if (!ms || ms <= 0) return '0:00'
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}

// 实时时钟 hook
function useClock() {
    const [time, setTime] = useState(() => new Date())
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 500)
        return () => clearInterval(t)
    }, [])
    return time.toLocaleTimeString('zh-CN', { hour12: false })
}

// ON AIR 进度条 hook
function useElapsedMs(startedAt: number | null): number {
    const [elapsed, setElapsed] = useState(0)
    useEffect(() => {
        if (!startedAt) { setElapsed(0); return }
        const tick = () => setElapsed(Date.now() - startedAt)
        tick()
        const t = setInterval(tick, 250)
        return () => clearInterval(t)
    }, [startedAt])
    return elapsed
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function findPart(rundown: IRundown | null, partId: string | null): IPart | null {
    if (!rundown || !partId) return null
    for (const seg of rundown.segments ?? []) {
        for (const part of seg.parts ?? []) {
            if (part._id === partId) return part
        }
    }
    return null
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function App() {
    const {
        connected, summaries, activeRundown, runtime,
        activate, take, sendToPreview, setNext, _initSocket,
    } = useRCASStore()

    const clock = useClock()
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
                take()
            } else if (e.code === 'Enter') {
                e.preventDefault()
                sendToPreview()
            } else if (e.code === 'F11') {
                e.preventDefault()
                document.documentElement.requestFullscreen?.()
            } else if (e.code === 'Escape') {
                setShowRundownPanel(false)
                setSelectedId(null)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [take, sendToPreview])

    const engineState    = runtime?.engineState ?? 'STOPPED'
    const isDisconnected = !connected
    const activeSum      = summaries.find(s => s.lifecycle === 'active' || s.lifecycle === 'on-air')

    // 当前 on-air / preview / next 的 Part
    const onAirPart   = findPart(activeRundown, runtime?.onAirPartId   ?? null)
    const previewPart = findPart(activeRundown, runtime?.previewPartId ?? null)
    const nextPart    = findPart(activeRundown, runtime?.nextPartId    ?? null)

    // 是否有活跃 Rundown 数据
    const hasRundown = activeRundown !== null

    return (
        <div style={{
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
                clock={clock}
                onOpenRundown={() => setShowRundownPanel(true)}
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

                {/* 左栏：Rundown 列表 60% */}
                <div style={{
                    width:         '60%',
                    display:       'flex',
                    flexDirection: 'column',
                    borderRight:   `1px solid ${COLOR.border}`,
                    overflow:      'hidden',
                }}>
                    {hasRundown ? (
                        <RundownListView
                            rundown={activeRundown!}
                            runtime={runtime}
                            onSetNext={connected ? setNext : () => {}}
                            disabled={!connected}
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

                {/* 右栏：操作区 40% */}
                <div style={{
                    width:         '40%',
                    display:       'flex',
                    flexDirection: 'column',
                    overflow:      'hidden',
                }}>
                    <RightPanel
                        onAirPart={onAirPart}
                        previewPart={previewPart}
                        nextPart={nextPart}
                        runtime={runtime}
                        connected={connected}
                        onTake={take}
                        onSendToPreview={sendToPreview}
                    />
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
            `}</style>
        </div>
    )
}

// ─── 顶栏 ─────────────────────────────────────────────────────────────────────

function Header({ connected, rundownName, engineState, clock, onOpenRundown }: {
    connected:      boolean
    rundownName:    string | null
    engineState:    string
    clock:          string
    onOpenRundown:  () => void   // ← 新增
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
            height:       48,
            minHeight:    48,
            background:   '#0A0A0A',
            borderBottom: `1px solid ${COLOR.border}`,
            display:      'flex',
            alignItems:   'center',
            padding:      '0 16px',
            gap:          16,
        }}>
            {/* Logo */}
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      15,
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
                <span style={{ color: COLOR.textDim, fontSize: 11 }}>
                    {connected ? 'CONNECTED' : 'OFFLINE'}
                </span>
            </div>

            {/* 分隔 */}
            <div style={{ width: 1, height: 20, background: COLOR.border }}/>

            {/* Rundown 名称 */}
            <div style={{
                flex:         1,
                fontSize:     13,
                fontWeight:   600,
                color:        rundownName ? COLOR.text : COLOR.textDim,
                overflow:     'hidden',
                whiteSpace:   'nowrap',
                textOverflow: 'ellipsis',
            }}>
                {rundownName ?? '— 未选择节目单 —'}
            </div>

            {/* RUNDOWN 菜单按钮 */}
            <button
                onClick={onOpenRundown}
                style={{
                    fontFamily:    '"JetBrains Mono", monospace',
                    fontSize:      10,
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
                fontSize:      10,
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

            {/* 时钟 */}
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      20,
                fontWeight:    300,
                color:         COLOR.text,
                letterSpacing: '0.04em',
                minWidth:      90,
                textAlign:     'right',
            }}>
                {clock}
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

function RightPanel({ onAirPart, previewPart, nextPart, runtime, connected, onTake, onSendToPreview }: {
    onAirPart:       IPart | null
    previewPart:     IPart | null
    nextPart:        IPart | null
    runtime:         RundownRuntime | null
    connected:       boolean
    onTake:          () => void
    onSendToPreview: () => void
}) {
    const engineState = runtime?.engineState ?? 'STOPPED'
    const canOperate  = connected && engineState !== 'STOPPED' && engineState !== 'ERROR'

    const onAirDur = onAirPart?.expectedDuration ?? 0
    const elapsed  = useElapsedMs(runtime && onAirPart ? Date.now() - 30000 : null)

    return (
        <div style={{
            display:       'flex',
            flexDirection: 'column',
            height:        '100%',
            overflow:      'hidden',
        }}>
            {/* ── 监看画面区（PVW 左 / PGM 右）── */}
            <div style={{
                display:             'grid',
                gridTemplateColumns: '1fr 1fr',
                gap:                 1,
                background:          COLOR.border,
                borderBottom:        `1px solid ${COLOR.border}`,
                flexShrink:          0,
            }}>
                <MonitorPlaceholder label="PVW" color={COLOR.pvw} part={previewPart} />
                <MonitorPlaceholder label="PGM" color={COLOR.pgm} part={onAirPart}   />
            </div>

            {/* ── ON AIR 状态 ── */}
            <StatusBlock
                label="ON AIR"
                color={COLOR.pgm}
                part={onAirPart}
                showProgress={!!onAirPart}
                elapsed={elapsed}
                duration={onAirDur}
            />

            <div style={{ height: 1, background: COLOR.border, flexShrink: 0 }}/>

            {/* ── PREVIEW 状态 ── */}
            <StatusBlock
                label="PREVIEW"
                color={COLOR.pvw}
                part={previewPart}
                showProgress={false}
                elapsed={0}
                duration={0}
            />

            {/* 弹性占位 */}
            <div style={{ flex: 1 }}/>

            {/* ── NEXT 小提示 ── */}
            {nextPart && (
                <div style={{
                    padding:    '6px 14px',
                    borderTop:  `1px solid ${COLOR.border}`,
                    display:    'flex',
                    alignItems: 'center',
                    gap:        8,
                    flexShrink: 0,
                }}>
                    <span style={{
                        fontSize:      9,
                        fontWeight:    700,
                        color:         COLOR.next,
                        letterSpacing: '0.1em',
                        fontFamily:    '"JetBrains Mono", monospace',
                    }}>NEXT</span>
                    <span style={{
                        fontSize:     12,
                        color:        '#FFD06B',
                        overflow:     'hidden',
                        whiteSpace:   'nowrap',
                        textOverflow: 'ellipsis',
                    }}>
                        {nextPart.title}
                    </span>
                    <span style={{
                        marginLeft: 'auto',
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize:   11,
                        color:      COLOR.textDim,
                    }}>
                        {fmtMs(nextPart.expectedDuration)}
                    </span>
                </div>
            )}

            {/* ── 操作按钮区 ── */}
            <div style={{
                padding:       '10px 12px 14px',
                borderTop:     `1px solid ${COLOR.border}`,
                display:       'flex',
                flexDirection: 'column',
                gap:           8,
                flexShrink:    0,
                background:    '#0C0C0C',
            }}>
                {/* SEND TO PREVIEW */}
                <button
                    onClick={canOperate ? onSendToPreview : undefined}
                    disabled={!canOperate}
                    title="Enter"
                    style={{
                        height:        38,
                        background:    canOperate ? '#0A2416' : '#111',
                        border:        `1px solid ${canOperate ? COLOR.pvw + '66' : COLOR.border}`,
                        borderRadius:  3,
                        color:         canOperate ? COLOR.pvw : COLOR.textDim,
                        fontSize:      12,
                        fontWeight:    700,
                        letterSpacing: '0.15em',
                        cursor:        canOperate ? 'pointer' : 'not-allowed',
                        fontFamily:    '"JetBrains Mono", monospace',
                        transition:    'all 0.1s',
                        display:       'flex',
                        alignItems:    'center',
                        justifyContent:'center',
                        gap:           8,
                    }}
                >
                    SEND TO PREVIEW
                    <span style={{ fontSize: 9, opacity: 0.5 }}>Enter</span>
                </button>

                {/* TAKE */}
                <button
                    onClick={canOperate ? onTake : undefined}
                    disabled={!canOperate}
                    title="Space"
                    style={{
                        height:        64,
                        background:    canOperate ? '#2D0000' : '#111',
                        border:        `1px solid ${canOperate ? COLOR.pgm : COLOR.border}`,
                        borderRadius:  4,
                        color:         canOperate ? '#FFF' : COLOR.textDim,
                        fontSize:      20,
                        fontWeight:    700,
                        letterSpacing: '0.25em',
                        cursor:        canOperate ? 'pointer' : 'not-allowed',
                        transition:    'all 0.1s',
                        position:      'relative',
                        overflow:      'hidden',
                        boxShadow:     canOperate ? `0 0 16px ${COLOR.pgm}33` : 'none',
                        fontFamily:    '"JetBrains Mono", monospace',
                    }}
                    onMouseEnter={e => {
                        if (canOperate) {
                            const b = e.currentTarget as HTMLButtonElement
                            b.style.background = '#3D0000'
                            b.style.boxShadow  = `0 0 24px ${COLOR.pgm}55`
                        }
                    }}
                    onMouseLeave={e => {
                        if (canOperate) {
                            const b = e.currentTarget as HTMLButtonElement
                            b.style.background = '#2D0000'
                            b.style.boxShadow  = `0 0 16px ${COLOR.pgm}33`
                        }
                    }}
                    onMouseDown={e => {
                        if (canOperate)
                            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'
                    }}
                    onMouseUp={e => {
                        if (canOperate)
                            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
                    }}
                >
                    TAKE
                    <span style={{
                        position:      'absolute',
                        bottom:        4,
                        right:         10,
                        fontSize:      9,
                        opacity:       0.35,
                        letterSpacing: '0.05em',
                    }}>
                        SPACE
                    </span>
                </button>
            </div>
        </div>
    )
}

// ─── 监看占位块 ───────────────────────────────────────────────────────────────

function MonitorPlaceholder({ label, color, part }: {
    label: string
    color: string
    part:  IPart | null
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
            {/* Tally 边框 */}
            <div style={{
                position:      'absolute',
                inset:         0,
                border:        `2px solid ${part ? color : COLOR.border}`,
                pointerEvents: 'none',
            }}/>
            {/* 标签 */}
            <div style={{
                position:      'absolute',
                top:           6,
                left:          8,
                fontSize:      9,
                fontWeight:    700,
                color:         part ? color : COLOR.textDim,
                letterSpacing: '0.12em',
                background:    '#000000AA',
                padding:       '1px 4px',
                fontFamily:    '"JetBrains Mono", monospace',
            }}>
                {label}
            </div>
            {/* 内容 */}
            <div style={{
                fontSize:   11,
                color:      COLOR.textDim,
                textAlign:  'center',
                lineHeight: 1.6,
            }}>
                {part ? (
                    <span style={{ color, fontWeight: 600 }}>
                        {part.title.slice(0, 20)}
                    </span>
                ) : (
                    <span>— 无信号 —</span>
                )}
            </div>
        </div>
    )
}

// ─── 状态块（ON AIR / PREVIEW） ───────────────────────────────────────────────

function StatusBlock({ label, color, part, showProgress, elapsed, duration }: {
    label:        string
    color:        string
    part:         IPart | null
    showProgress: boolean
    elapsed:      number
    duration:     number
}) {
    const progress  = duration > 0 ? Math.min(elapsed / duration, 1) : 0
    const remaining = Math.max(duration - elapsed, 0)
    const barColor  =
        remaining > 30000 ? COLOR.pvw  :
        remaining > 10000 ? COLOR.next :
        COLOR.pgm

    return (
        <div style={{
            padding:    '8px 14px 10px',
            background: part ? color + '0D' : 'transparent',
            flexShrink: 0,
        }}>
            <div style={{
                display:      'flex',
                alignItems:   'center',
                gap:          8,
                marginBottom: part ? 6 : 0,
            }}>
                <span style={{
                    fontSize:      9,
                    fontWeight:    700,
                    color:         part ? color : COLOR.textDim,
                    letterSpacing: '0.12em',
                    background:    part ? color + '22' : 'transparent',
                    padding:       '2px 6px',
                    borderRadius:  2,
                    fontFamily:    '"JetBrains Mono", monospace',
                }}>
                    {label}
                </span>
                {part && (
                    <span style={{
                        fontSize:     13,
                        fontWeight:   600,
                        color:        color === COLOR.pgm ? '#FF8888' : '#88FF88',
                        overflow:     'hidden',
                        whiteSpace:   'nowrap',
                        textOverflow: 'ellipsis',
                        flex:         1,
                    }}>
                        {part.title}
                    </span>
                )}
                {!part && (
                    <span style={{ color: COLOR.textDim, fontSize: 12 }}>—</span>
                )}
            </div>

            {showProgress && part && duration > 0 && (
                <div>
                    <div style={{
                        height:       4,
                        background:   '#222',
                        borderRadius: 2,
                        overflow:     'hidden',
                        marginBottom: 4,
                    }}>
                        <div style={{
                            height:       '100%',
                            width:        `${progress * 100}%`,
                            background:   barColor,
                            borderRadius: 2,
                            transition:   'width 0.25s linear',
                            boxShadow:    `0 0 6px ${barColor}88`,
                        }}/>
                    </div>
                    <div style={{
                        display:        'flex',
                        justifyContent: 'space-between',
                        fontFamily:     '"JetBrains Mono", monospace',
                        fontSize:       11,
                        color:          COLOR.textDim,
                    }}>
                        <span>{fmtMs(elapsed)}</span>
                        <span style={{ color: barColor }}>{fmtMs(remaining)} 剩余</span>
                        <span>{fmtMs(duration)}</span>
                    </div>
                </div>
            )}
        </div>
    )
}
