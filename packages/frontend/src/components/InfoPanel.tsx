/**
 * @file InfoPanel.tsx
 * @description 底部信息栏组件
 *
 * 显示内容：字幕区（storySlug/octext）| 时间偏差三格（节目余量 / 实时偏差 / COUNTDOWN倒计时）
 *
 * 偏差公式：
 *   整体偏差 = (editorialDuration - plannedDuration) + accumFinishedDiffMs
 *            + (isKamOrVO ? elapsedMs - expectedMs : 0)
 *
 * 依赖：
 *   useRCASStore     — store/useRCASStore.ts
 *   useClock         — hooks/useClock.ts
 *   COLOR / fmtMs    — utils/formatters.ts
 *   TimingBox        — components/TimingBox.tsx
 *   RundownRuntime   — core-lib/socket-contracts.ts
 *   IRundown / ISegment / IPart / PartType — core-lib models
 *
 * 被使用：App.tsx
 */

import { useEffect, useRef, useState } from 'react'
import { useRCASStore } from '../store/useRCASStore'
import { useClock } from '../hooks/useClock'
import { COLOR, fmtMs } from '../utils/formatters'
import { TimingBox } from './TimingBox'
import type { RundownRuntime } from '../../../core-lib/src/socket/socket-contracts'
import type { IRundown } from '../../../core-lib/src/models/rundown-model'
import type { ISegment } from '../../../core-lib/src/models/segment-model'
import type { IPart } from '../../../core-lib/src/models/part-model'
import { PartType } from '../../../core-lib/src/models/enums'

export function InfoPanel({ runtime, activeRundown }: {
    runtime: RundownRuntime | null
    activeRundown: IRundown | null
}) {
    const { display: clock, syncing: clockSyncing, sync: syncClock } = useClock()
    const [leftPct, setLeftPct] = useState(50)
    const containerRef = useRef<HTMLDivElement>(null)

    const [elapsedMs, setElapsedMs] = useState(0)
    const startTimeRef = useRef<number | null>(null)
    const prevOnAirSegmentId = useRef<string | null>(null)

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
    const expectedMs = onAirSegment?.expectedDuration
        ?? onAirSegment?.parts?.reduce((a: number, p: IPart) => a + (p.expectedDuration ?? 0), 0)
        ?? 0
    const countdownMs = Math.max(0, expectedMs - elapsedMs)
    const plannedDuration = useRCASStore(s => s.plannedDuration)
    const editorialDuration = activeRundown?.editorialDuration ?? null

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
                                fontSize:      18,
                                fontWeight:    700,
                                cursor:        'pointer',
                                color:         clockSyncing ? '#00ff88' : COLOR.textDim,
                                letterSpacing: '0.08em',
                                userSelect:    'none',
                            }}
                        >
                            {'↻'}
                        </span>
                        <span style={{ color: COLOR.text, fontSize: 11 }}>{clock}</span>
                    </div>
                </div>

                <div style={{
                    flex:           1,
                    display:        'flex',
                    flexDirection:  'column',
                    padding:        '8px 12px',
                    gap:            8,
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <TimingBox label="预计时长" value={expectedMs > 0 ? fmtMs(expectedMs) : '—'} />
                        <TimingBox label="实际时长" value={elapsedMs > 0 ? fmtMs(elapsedMs) : '—'} />
                    </div>
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