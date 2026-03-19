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

// 实时时钟 hook
function useClock() {
    const [time, setTime] = useState(() => new Date())
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 500)
        return () => clearInterval(t)
    }, [])
    return time.toLocaleTimeString('zh-CN', { hour12: false })
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function App() {
    const {
        connected, summaries, activeRundown, runtime,
        activate, take, setNext, run, _initSocket,
    } = useRCASStore()

    const [isRunning, setIsRunning] = useState(false)
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
                if (isRunning) take()
            } else if (e.code === 'Enter') {
                e.preventDefault()
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
    }, [take, isRunning])

    const engineState    = runtime?.engineState ?? 'STOPPED'
    const isDisconnected = !connected
    const activeSum      = summaries.find(s => s.lifecycle === 'active' || s.lifecycle === 'on-air')

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
                onRun={() => {
                    if (!isRunning) {
                        run()
                        setIsRunning(true)
                    } else {
                        setIsRunning(false)
                    }
                }}
                isRunning={isRunning}
                hasRundown={hasRundown}
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
            `}</style>
        </div>
    )
}

// ─── 顶栏 ─────────────────────────────────────────────────────────────────────

function Header({ connected, rundownName, engineState, clock, onOpenRundown, onRun, isRunning, hasRundown }: {
    connected:     boolean
    rundownName:   string | null
    engineState:   string
    clock:         string
    onOpenRundown: () => void
    onRun:         () => void
    isRunning:     boolean
    hasRundown:    boolean
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

            {/* RUN 按钮 — 只有激活了 Rundown 才显示 */}
            {hasRundown && (
                <button
                    onClick={onRun}
                    style={{
                        fontFamily:    '"JetBrains Mono", monospace',
                        fontSize:      10,
                        fontWeight:    700,
                        letterSpacing: '0.1em',
                        color:         isRunning ? COLOR.pgm : COLOR.pvw,
                        background:    isRunning ? COLOR.pgm + '22' : COLOR.pvw + '22',
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

function RightPanel() {
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
                <MonitorPlaceholder label="PVW" color={COLOR.pvw} />
                <MonitorPlaceholder label="PGM" color={COLOR.pgm} />
            </div>

            {/* 空白区域，等待后续功能 */}
            <div style={{ flex: 1 }} />
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
