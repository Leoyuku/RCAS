/**
 * @file App.tsx
 * @description RCAS 主界面
 *
 * 布局规范（v3.0）：
 *   顶栏 48px — Logo | 连接状态 | Rundown名称 | ENGINE状态 | 时钟
 *   左侧 60% — Rundown 列表主体（纵向，Story分组，Piece标签行）
 *   右侧 40% — 操作区（PVW/PGM画面占位 | ON AIR状态+进度条 | TAKE/STP按钮）
 */

import { useEffect, useState } from 'react'
import { useRCASStore } from './store/useRCASStore'
import type { IRundown } from '../../core-lib/src/models/rundown-model'
import type { ISegment } from '../../core-lib/src/models/segment-model'
import type { IPart }    from '../../core-lib/src/models/part-model'
import type { IPiece }   from '../../core-lib/src/models/piece-model'
import type { RundownSummary, RundownRuntime } from '../../core-lib/src/socket/socket-contracts'
import { PartType }      from '../../core-lib/src/models/enums'

// ─── 颜色 / 常量 ─────────────────────────────────────────────────────────────

const COLOR = {
    pgm:     '#C0392B',  // ON AIR 红
    pvw:     '#27AE60',  // PREVIEW 绿
    next:    '#F39C12',  // NEXT 黄
    gray:    '#7F8C8D',  // 未激活灰
    blue:    '#0F3460',  // 操作蓝
    bgDark:  '#0D0D0D',
    bgPanel: '#131313',
    bgRow:   '#1A1A1A',
    border:  '#2A2A2A',
    text:    '#E8E8E8',
    textDim: '#666',
}

// Part 类型标签
const PART_TYPE_LABEL: Record<string, string> = {
    [PartType.KAM]:      'CAM',
    [PartType.SERVER]:   'VT',
    [PartType.VO]:       'VO',
    [PartType.LIVE]:     'LV',
    [PartType.GRAPHICS]: 'GFX',
    [PartType.UNKNOWN]:  '???',
}

const PART_TYPE_COLOR: Record<string, string> = {
    [PartType.KAM]:      '#2980B9',
    [PartType.SERVER]:   '#8E44AD',
    [PartType.VO]:       '#16A085',
    [PartType.LIVE]:     '#E67E22',
    [PartType.GRAPHICS]: '#2C3E50',
    [PartType.UNKNOWN]:  '#555',
}

// Piece 标签颜色（按类型名关键词匹配）
function getPieceColor(name: string): string {
    const n = name.toUpperCase()
    if (n.includes('L3RD') || n.includes('LOWER'))  return '#8E44AD'  // 紫
    if (n.includes('TRANS'))                         return '#E67E22'  // 橙
    if (n.includes('BUG'))                           return '#2980B9'  // 蓝
    if (n.includes('DSK'))                           return '#17A589'  // 青
    if (n.includes('BRK') || n.includes('BREAK'))   return '#C0392B'  // 红
    if (n.includes('SOT') || n.includes('VO'))      return '#27AE60'  // 绿
    return '#555'
}

// 格式化毫秒为 M:SS
function fmtMs(ms: number): string {
    if (!ms || ms <= 0) return '0:00'
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}

// 格式化毫秒为 Back Time 字符串（总秒数的分秒）
function fmtBackTime(ms: number): string {
    return fmtMs(ms)
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

// ON AIR 进度条 hook（基于系统时钟，CAM 类型用）
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

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function App() {
    const {
        connected, summaries, activeRundown, runtime,
        activate, take, sendToPreview, setNext, _initSocket,
    } = useRCASStore()

    const clock = useClock()

    // 键盘快捷键
    useEffect(() => {
        _initSocket()
    }, [])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // 忽略输入框内的按键
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
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [take, sendToPreview])

    const engineState  = runtime?.engineState ?? 'STOPPED'
    const isConnected  = connected
    const isDisconnected = !connected
    const activeSum    = summaries.find(s => s.lifecycle === 'active' || s.lifecycle === 'on-air')

    // 找到当前 on-air / preview / next 的 Part
    const onAirPart   = findPart(activeRundown, runtime?.onAirPartId   ?? null)
    const previewPart = findPart(activeRundown, runtime?.previewPartId ?? null)
    const nextPart    = findPart(activeRundown, runtime?.nextPartId    ?? null)

    // 是否有活跃 Rundown 数据
    const hasRundown = !!activeRundown

    return (
        <div style={{
            display:         'flex',
            flexDirection:   'column',
            height:          '100vh',
            background:      COLOR.bgDark,
            color:           COLOR.text,
            fontFamily:      '"IBM Plex Sans Condensed", "Noto Sans SC", sans-serif',
            fontSize:        '13px',
            overflow:        'hidden',
            userSelect:      'none',
        }}>
            {/* ── 顶栏 ── */}
            <Header
                connected={isConnected}
                rundownName={activeSum?.name ?? activeRundown?.name ?? null}
                engineState={engineState}
                clock={clock}
            />

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
                    width:       '60%',
                    display:     'flex',
                    flexDirection: 'column',
                    borderRight: `1px solid ${COLOR.border}`,
                    overflow:    'hidden',
                }}>
                    {hasRundown ? (
                        <RundownList
                            segments={activeRundown!.segments ?? []}
                            runtime={runtime}
                            onSetNext={connected ? setNext : () => {}}
                            disabled={!connected}
                        />
                    ) : (
                        <RundownSelector
                            summaries={summaries}
                            onActivate={connected ? activate : () => {}}
                            disabled={!connected}
                        />
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

// ─── 顶栏 ────────────────────────────────────────────────────────────────────

function Header({ connected, rundownName, engineState, clock }: {
    connected:    boolean
    rundownName:  string | null
    engineState:  string
    clock:        string
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
            height:         48,
            minHeight:      48,
            background:     '#0A0A0A',
            borderBottom:   `1px solid ${COLOR.border}`,
            display:        'flex',
            alignItems:     'center',
            padding:        '0 16px',
            gap:            16,
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
                flex:       1,
                fontSize:   13,
                fontWeight: 600,
                color:      rundownName ? COLOR.text : COLOR.textDim,
                overflow:   'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
            }}>
                {rundownName ?? '— 未选择节目单 —'}
            </div>

            {/* ENGINE 状态 */}
            <div style={{
                display:    'flex',
                alignItems: 'center',
                gap:        6,
                background: '#1A1A1A',
                padding:    '3px 10px',
                borderRadius: 3,
                border:     `1px solid ${COLOR.border}`,
            }}>
                <span style={{ color: COLOR.textDim, fontSize: 10, letterSpacing: '0.1em' }}>ENGINE</span>
                <span style={{
                    fontFamily:    '"JetBrains Mono", monospace',
                    fontSize:      11,
                    fontWeight:    600,
                    color:         engineColor,
                    letterSpacing: '0.05em',
                }}>
                    {engineState}
                </span>
            </div>

            {/* 时钟 */}
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      16,
                fontWeight:    600,
                color:         COLOR.text,
                letterSpacing: '0.05em',
                minWidth:      72,
                textAlign:     'right',
            }}>
                {clock}
            </div>
        </div>
    )
}

// ─── Rundown 选择器（无 active rundown 时显示） ───────────────────────────────

function RundownSelector({ summaries, onActivate, disabled }: {
    summaries:  RundownSummary[]
    onActivate: (id: string) => void
    disabled:   boolean
}) {
    const lc: Record<string, { label: string; color: string }> = {
        'on-air':    { label: 'ON AIR',    color: COLOR.pgm  },
        'active':    { label: 'ACTIVE',    color: COLOR.pvw  },
        'standby':   { label: 'STANDBY',   color: COLOR.next },
        'persisted': { label: 'PERSISTED', color: COLOR.gray },
    }

    return (
        <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
            <div style={{
                padding:    '12px 16px 8px',
                fontSize:   11,
                fontWeight: 600,
                color:      COLOR.textDim,
                letterSpacing: '0.1em',
                borderBottom: `1px solid ${COLOR.border}`,
                background: '#0F0F0F',
            }}>
                选择节目单
            </div>
            {summaries.length === 0 ? (
                <div style={{ padding: '32px 16px', color: COLOR.textDim, textAlign: 'center', fontSize: 12 }}>
                    等待 NCS 推送节目单…
                </div>
            ) : summaries.map(s => {
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
                        onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLDivElement).style.background = '#1E1E1E' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                        <div style={{
                            width:      3,
                            height:     32,
                            background: color,
                            borderRadius: 2,
                            flexShrink: 0,
                        }}/>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                        }}>
                            {label}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Rundown 列表（有 active rundown 时显示） ─────────────────────────────────

function RundownList({ segments, runtime, onSetNext, disabled }: {
    segments:  ISegment[]
    runtime:   RundownRuntime | null
    onSetNext: (partId: string) => void
    disabled:  boolean
}) {
    const onAirPartId   = runtime?.onAirPartId   ?? null
    const previewPartId = runtime?.previewPartId ?? null
    const nextPartId    = runtime?.nextPartId    ?? null

    // 先遍历拿到所有 parts 的总时长（倒推 backtime）
    const allParts: IPart[] = segments.flatMap(seg => seg.parts ?? [])
    const totalMs = allParts.reduce((acc, p) => acc + (p.expectedDuration ?? 0), 0)

    // 底部汇总
    const playedParts = allParts.filter(p => {
        // 已播 = onAirPartId 之前的所有条目
        if (!onAirPartId) return false
        const onAirIdx = allParts.findIndex(x => x._id === onAirPartId)
        const thisIdx  = allParts.findIndex(x => x._id === p._id)
        return thisIdx < onAirIdx
    })
    const playedMs   = playedParts.reduce((acc, p) => acc + (p.expectedDuration ?? 0), 0)
    const remainingMs = totalMs - playedMs

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

            {/* 列头 */}
            <div style={{
                display:    'grid',
                gridTemplateColumns: '36px 40px 1fr 52px 42px 52px 52px 28px',
                gap:        0,
                padding:    '0 8px',
                height:     28,
                alignItems: 'center',
                background: '#0F0F0F',
                borderBottom: `1px solid ${COLOR.border}`,
                fontSize:   10,
                fontWeight: 700,
                color:      COLOR.textDim,
                letterSpacing: '0.08em',
                flexShrink: 0,
            }}>
                <span style={{ paddingLeft: 4 }}>PG</span>
                <span>TYPE</span>
                <span>SLUG / ELEMENTS</span>
                <span style={{ textAlign: 'right' }}>DUR</span>
                <span style={{ textAlign: 'right', color: '#555' }}>D</span>
                <span style={{ textAlign: 'right' }}>BACK</span>
                <span style={{ textAlign: 'right' }}>DBACK</span>
                <span style={{ textAlign: 'center' }}>ST</span>
            </div>

            {/* 条目列表 */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {segments.map((seg, segIdx) => {
                    const parts = seg.parts ?? []
                    const isMultiPart = parts.length > 1

                    return parts.map((part, partIdx) => {
                        const isFirst    = partIdx === 0
                        const isLast     = partIdx === parts.length - 1
                        const isOnAir    = part._id === onAirPartId
                        const isPreview  = part._id === previewPartId
                        const isNext     = part._id === nextPartId

                        // 背景色
                        const rowBg =
                            isOnAir   ? '#1E0505' :
                            isPreview ? '#041508' :
                            isNext    ? '#1A1200' :
                            'transparent'

                        const leftBarColor =
                            isOnAir   ? COLOR.pgm  :
                            isPreview ? COLOR.pvw  :
                            isNext    ? COLOR.next :
                            'transparent'

                        // backtime 倒推（第一轮静态）
                        const partIdx2 = allParts.findIndex(p => p._id === part._id)
                        const backTimeMs = allParts
                            .slice(partIdx2)
                            .reduce((acc, p) => acc + (p.expectedDuration ?? 0), 0)

                        const stIcon =
                            isOnAir   ? '▶' :
                            isPreview ? '●' :
                            isNext    ? '◆' :
                            '○'

                        const stColor =
                            isOnAir   ? COLOR.pgm  :
                            isPreview ? COLOR.pvw  :
                            isNext    ? COLOR.next :
                            COLOR.textDim

                        const typeLabel = PART_TYPE_LABEL[part.type] ?? '???'
                        const typeColor = PART_TYPE_COLOR[part.type] ?? '#555'
                        const pieces    = part.pieces ?? []

                        return (
                            <div
                                key={part._id}
                                onClick={() => !disabled && !isOnAir && onSetNext(part._id)}
                                style={{
                                    display:        'grid',
                                    gridTemplateColumns: '36px 40px 1fr 52px 42px 52px 52px 28px',
                                    gap:            0,
                                    padding:        '0 8px',
                                    minHeight:      pieces.length > 0 ? 44 : 30,
                                    alignItems:     'start',
                                    paddingTop:     6,
                                    paddingBottom:  6,
                                    background:     rowBg,
                                    borderBottom:   `1px solid ${COLOR.border}`,
                                    borderLeft:     `3px solid ${leftBarColor}`,
                                    cursor:         disabled || isOnAir ? 'default' : 'pointer',
                                    transition:     'background 0.1s',
                                    position:       'relative',
                                }}
                                onMouseEnter={e => {
                                    if (!disabled && !isOnAir)
                                        (e.currentTarget as HTMLDivElement).style.background =
                                            isOnAir ? '#1E0505' : isPreview ? '#041508' : isNext ? '#1A1200' : '#1A1A1A'
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLDivElement).style.background = rowBg
                                }}
                            >
                                {/* PG 列：只在第一个 Part 显示，多 Part 用分组线 */}
                                <div style={{ paddingTop: 1, paddingLeft: 4 }}>
                                    {isFirst && (
                                        <span style={{
                                            fontFamily: '"JetBrains Mono", monospace',
                                            fontSize:   11,
                                            color:      isOnAir ? COLOR.pgm : isPreview ? COLOR.pvw : isNext ? COLOR.next : COLOR.textDim,
                                            fontWeight: isOnAir || isPreview || isNext ? 700 : 400,
                                        }}>
                                            {seg.name.split(/[\s\-]/)[0] || String(segIdx + 1).padStart(2, '0')}
                                        </span>
                                    )}
                                    {!isFirst && isMultiPart && (
                                        <span style={{ color: '#333', fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>
                                            {isLast ? '└' : '├'}
                                        </span>
                                    )}
                                </div>

                                {/* TYPE 列 */}
                                <div style={{ paddingTop: 1 }}>
                                    <span style={{
                                        display:       'inline-block',
                                        background:    typeColor,
                                        color:         '#FFF',
                                        fontSize:      9,
                                        fontWeight:    700,
                                        padding:       '1px 4px',
                                        borderRadius:  2,
                                        letterSpacing: '0.05em',
                                    }}>
                                        {typeLabel}
                                    </span>
                                </div>

                                {/* SLUG + Piece 标签 */}
                                <div style={{ overflow: 'hidden', paddingRight: 4 }}>
                                    <div style={{
                                        fontWeight:   isOnAir ? 700 : 500,
                                        color:
                                            isOnAir   ? '#FF6B6B' :
                                            isPreview ? '#6BFF9E' :
                                            isNext    ? '#FFD06B' :
                                            COLOR.text,
                                        overflow:     'hidden',
                                        whiteSpace:   'nowrap',
                                        textOverflow: 'ellipsis',
                                        fontSize:     13,
                                        lineHeight:   '1.3',
                                    }}>
                                        {part.title}
                                    </div>
                                    {/* Piece 标签行 */}
                                    {pieces.length > 0 && (
                                        <div style={{
                                            display:    'flex',
                                            flexWrap:   'wrap',
                                            gap:        4,
                                            marginTop:  4,
                                        }}>
                                            {pieces.slice(0, 6).map((piece, pi) => (
                                                <PieceTag key={piece._id ?? pi} piece={piece} />
                                            ))}
                                            {pieces.length > 6 && (
                                                <span style={{ color: COLOR.textDim, fontSize: 10 }}>
                                                    +{pieces.length - 6}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* DUR 列 */}
                                <div style={{
                                    textAlign:  'right',
                                    fontFamily: '"JetBrains Mono", monospace',
                                    fontSize:   12,
                                    color:      isOnAir ? COLOR.text : COLOR.textDim,
                                    paddingTop: 1,
                                }}>
                                    {fmtMs(part.expectedDuration)}
                                </div>

                                {/* D (delta) 列 — 第一轮静态留空 */}
                                <div style={{
                                    textAlign:  'right',
                                    fontFamily: '"JetBrains Mono", monospace',
                                    fontSize:   11,
                                    color:      '#444',
                                    paddingTop: 1,
                                }}>
                                    —
                                </div>

                                {/* BACK 列 */}
                                <div style={{
                                    textAlign:  'right',
                                    fontFamily: '"JetBrains Mono", monospace',
                                    fontSize:   11,
                                    color:      COLOR.textDim,
                                    paddingTop: 1,
                                }}>
                                    {fmtBackTime(backTimeMs)}
                                </div>

                                {/* DBACK 列 — 第一轮同 BACK */}
                                <div style={{
                                    textAlign:  'right',
                                    fontFamily: '"JetBrains Mono", monospace',
                                    fontSize:   11,
                                    color:      COLOR.textDim,
                                    paddingTop: 1,
                                }}>
                                    {fmtBackTime(backTimeMs)}
                                </div>

                                {/* ST 列 */}
                                <div style={{
                                    textAlign:  'center',
                                    fontFamily: '"JetBrains Mono", monospace',
                                    fontSize:   12,
                                    color:      stColor,
                                    paddingTop: 1,
                                }}>
                                    {stIcon}
                                </div>
                            </div>
                        )
                    })
                })}
            </div>

            {/* 底部汇总栏 */}
            <div style={{
                display:        'flex',
                gap:            16,
                padding:        '6px 12px',
                background:     '#0A0A0A',
                borderTop:      `1px solid ${COLOR.border}`,
                fontSize:       11,
                fontFamily:     '"JetBrains Mono", monospace',
                color:          COLOR.textDim,
                flexShrink:     0,
                alignItems:     'center',
            }}>
                <span>总时长 <strong style={{ color: COLOR.text }}>{fmtMs(totalMs)}</strong></span>
                <span style={{ color: COLOR.border }}>|</span>
                <span>已播 <strong style={{ color: COLOR.pvw }}>{fmtMs(playedMs)}</strong></span>
                <span style={{ color: COLOR.border }}>|</span>
                <span>剩余 <strong style={{ color: COLOR.text }}>{fmtMs(remainingMs)}</strong></span>
                <span style={{ color: COLOR.border }}>|</span>
                <span>偏差 <strong style={{ color: COLOR.gray }}>—</strong></span>
                <span style={{ color: COLOR.border }}>|</span>
                <span>
                    预计结束 <strong style={{ color: COLOR.pvw, fontSize: 12 }}>
                        {totalMs > 0 ? new Date(Date.now() + remainingMs).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}
                    </strong>
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: '#333' }}>[目标状态]</span>
            </div>
        </div>
    )
}

// ─── Piece 标签 ───────────────────────────────────────────────────────────────

function PieceTag({ piece }: { piece: IPiece }) {
    const name  = (piece as any).name ?? (piece as any).title ?? (piece as any)._id ?? '?'
    const color = getPieceColor(name)

    return (
        <div style={{
            display:       'flex',
            alignItems:    'center',
            gap:           3,
            background:    color + '22',
            border:        `1px solid ${color}55`,
            borderRadius:  2,
            padding:       '1px 5px',
            fontSize:      10,
            color:         color,
            fontWeight:    600,
            letterSpacing: '0.04em',
            maxWidth:      80,
            overflow:      'hidden',
            whiteSpace:    'nowrap',
            textOverflow:  'ellipsis',
        }}>
            <div style={{
                width:        4,
                height:       4,
                borderRadius: '50%',
                background:   COLOR.gray,  // 第一轮静态：灰色（UNRESOLVED）
                flexShrink:   0,
            }}/>
            {name.toString().toUpperCase().slice(0, 8)}
        </div>
    )
}

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

    // 进度条（基于系统时钟，等接入 Tricaster 后换成 DDR timecode）
    // 第一轮：只在有 onAirPart 时启动计时
    const onAirDur    = onAirPart?.expectedDuration ?? 0
    // 使用 runtime 推送的时间戳（暂用 Date.now() 估算，第二轮换真实 startTime）
    const elapsed     = useElapsedMs(runtime ? Date.now() - 30000 : null)  // 占位，第二轮接真实数据

    return (
        <div style={{
            display:       'flex',
            flexDirection: 'column',
            height:        '100%',
            overflow:      'hidden',
        }}>

            {/* ── 监看画面区（PVW 左 / PGM 右）── */}
            <div style={{
                display:        'grid',
                gridTemplateColumns: '1fr 1fr',
                gap:            1,
                background:     COLOR.border,
                borderBottom:   `1px solid ${COLOR.border}`,
                flexShrink:     0,
            }}>
                {/* PVW */}
                <MonitorPlaceholder label="PVW" color={COLOR.pvw} part={previewPart} />
                {/* PGM */}
                <MonitorPlaceholder label="PGM" color={COLOR.pgm} part={onAirPart} />
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

            {/* 细分割线 */}
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
                    }}>NEXT</span>
                    <span style={{
                        fontSize:   12,
                        color:      '#FFD06B',
                        overflow:   'hidden',
                        whiteSpace: 'nowrap',
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
                padding:        '10px 12px 14px',
                borderTop:      `1px solid ${COLOR.border}`,
                display:        'flex',
                flexDirection:  'column',
                gap:            8,
                flexShrink:     0,
                background:     '#0C0C0C',
            }}>
                {/* SEND TO PREVIEW */}
                <button
                    onClick={canOperate && previewPart === null ? onSendToPreview : undefined}
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
                        letterSpacing: '0.1em',
                        cursor:        canOperate ? 'pointer' : 'not-allowed',
                        transition:    'all 0.1s',
                        display:       'flex',
                        alignItems:    'center',
                        justifyContent: 'center',
                        gap:           8,
                    }}
                >
                    SEND TO PREVIEW
                    <span style={{ fontSize: 9, opacity: 0.5, fontFamily: '"JetBrains Mono", monospace' }}>Enter</span>
                </button>

                {/* TAKE */}
                <button
                    onClick={canOperate ? onTake : undefined}
                    disabled={!canOperate}
                    title="Space"
                    style={{
                        height:        56,
                        background:    canOperate ? '#2D0000' : '#111',
                        border:        `2px solid ${canOperate ? COLOR.pgm : COLOR.border}`,
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
                    }}
                    onMouseEnter={e => {
                        if (canOperate) {
                            const b = e.currentTarget as HTMLButtonElement
                            b.style.background  = '#3D0000'
                            b.style.boxShadow   = `0 0 24px ${COLOR.pgm}55`
                        }
                    }}
                    onMouseLeave={e => {
                        if (canOperate) {
                            const b = e.currentTarget as HTMLButtonElement
                            b.style.background  = '#2D0000'
                            b.style.boxShadow   = `0 0 16px ${COLOR.pgm}33`
                        }
                    }}
                    onMouseDown={e => {
                        if (canOperate) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'
                    }}
                    onMouseUp={e => {
                        if (canOperate) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
                    }}
                >
                    TAKE
                    <span style={{
                        position:   'absolute',
                        bottom:     4,
                        right:      10,
                        fontSize:   9,
                        opacity:    0.35,
                        fontFamily: '"JetBrains Mono", monospace',
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
            aspectRatio: '16/9',
            background:  '#080808',
            display:     'flex',
            flexDirection: 'column',
            alignItems:  'center',
            justifyContent: 'center',
            position:    'relative',
            overflow:    'hidden',
        }}>
            {/* Tally 边框 */}
            <div style={{
                position:   'absolute',
                inset:      0,
                border:     `2px solid ${part ? color : COLOR.border}`,
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
            }}>
                {label}
            </div>
            {/* 占位内容 */}
            <div style={{
                fontSize:   11,
                color:      COLOR.textDim,
                textAlign:  'center',
                lineHeight: 1.6,
            }}>
                {part ? (
                    <span style={{ color: part ? color : COLOR.textDim, fontWeight: 600 }}>
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
    const progress   = duration > 0 ? Math.min(elapsed / duration, 1) : 0
    const remaining  = Math.max(duration - elapsed, 0)

    const barColor   =
        remaining > 30000 ? COLOR.pvw  :
        remaining > 10000 ? COLOR.next :
        COLOR.pgm

    return (
        <div style={{
            padding:    '8px 14px 10px',
            background: part ? color + '0D' : 'transparent',
            flexShrink: 0,
        }}>
            {/* 标签行 */}
            <div style={{
                display:    'flex',
                alignItems: 'center',
                gap:        8,
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
                }}>
                    {label}
                </span>
                {part && (
                    <span style={{
                        fontSize:   13,
                        fontWeight: 600,
                        color:      color === COLOR.pgm ? '#FF8888' : '#88FF88',
                        overflow:   'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        flex:       1,
                    }}>
                        {part.title}
                    </span>
                )}
                {!part && (
                    <span style={{ color: COLOR.textDim, fontSize: 12 }}>—</span>
                )}
            </div>

            {/* 进度条 */}
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
                        display:    'flex',
                        justifyContent: 'space-between',
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize:   11,
                        color:      COLOR.textDim,
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
