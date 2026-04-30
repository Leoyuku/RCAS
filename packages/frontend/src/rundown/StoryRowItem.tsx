/* @file StoryRowItem.tsx
 * @description 单条 Story 行组件（forwardRef，支持 onAirRowRef 滚动定位）
 *
 * 布局（5列 grid）：
 *   PG(80px) | TYPE+SLUG(160px) | 缩略图区(1fr) | DUR(72px) | BACK(80px)
 *
 * 状态显示：
 *   ON AIR  — 纯红底色，白色文字，红色下边框
 *   PREVIEW — 纯绿底色，白色文字，绿色下边框
 *   已播    — 灰色底，50% opacity
 *   未播    — 标准灰底
 *   键盘/鼠标 hover — 白色内描边（由顶层遮罩层实现，不影响子元素事件）
 *
 * 交互：
 *   双击 Story 行    → SET NEXT（取第一个 Part）
 *   双击 Part 缩略图 → SET NEXT（取该 Part）
 *   右键 Part 缩略图 → 打开 PartContextMenu
 *   拖入 source      → setPartOverride（受 SOURCE_TYPE_MAP 类型约束）
 *   横向拖拽滚动     → 缩略图区鼠标按住拖动（grab cursor）
 *
 * 关键子组件：
 *   ThumbnailPlaceholder — 每个 Part 的画面占位符
 *   PartContextMenu      — 右键菜单（Portal）
 *
 * 修改指南：
 *   改行颜色/背景     → 修改 rowBg / rowBorder / textColor 计算逻辑
 *   改列宽            → 修改 gridTemplateColumns（同步修改 ColumnHeader）
 *   改双击/右键行为   → 修改 onDoubleClick / handleContextMenu
 *   改拖拽类型约束    → 修改 rundown-constants.ts 中的 SOURCE_TYPE_MAP
 *   改 BACK 时间显示  → 修改 BACK 列的 span 内 IIFE
 */

import { useState, useRef, useEffect, forwardRef } from 'react'
import type { IRundown } from '../../../core-lib/src/models/rundown-model'
import type { IPart } from '../../../core-lib/src/models/part-model'
import type { RundownRuntime } from '../../../core-lib/src/socket/socket-contracts'
import { PartType } from '../../../core-lib/src/models/enums'
import { useRCASStore } from '../store/useRCASStore'
import { useFramePool } from '../contexts/FramePoolContext'
import { C, STORY_TYPE_STYLE, SOURCE_TYPE_MAP } from './rundown-constants'
import { fmtMs, getStoryDisplayType } from './rundown-utils'
import { ThumbnailPlaceholder } from './ThumbnailPlaceholder'
import { PartContextMenu } from './PartContextMenu'
import type { StoryRow } from './rundown-utils'

export interface StoryRowItemProps {
    row: StoryRow
    isOnAir: boolean
    isPreview: boolean
    isNext: boolean
    isPlayed: boolean
    disabled: boolean
    onSetNext: (partId: string) => void
    runtime: RundownRuntime | null
    rundown: IRundown
}

export const StoryRowItem = forwardRef<HTMLDivElement, StoryRowItemProps>(
    ({ row, isOnAir, isPreview, isNext, isPlayed, runtime, onSetNext, disabled, rundown }, ref) => {
        const [hovered, setHovered] = useState(false)
        const hoveredSegmentId  = useRCASStore(s => s.hoveredSegmentId)
        const isKeyboardHovered = hoveredSegmentId === (row.segment._id as string)
        const isKeyboardMode    = useRCASStore(s => s.isKeyboardMode)
        const setKeyboardMode   = useRCASStore(s => s.setKeyboardMode)
        const setHoveredSegmentId = useRCASStore(s => s.setHoveredSegmentId)

        const partOverrides     = useRCASStore(s => s.overrides)
        const setPartOverride   = useRCASStore(s => s.setPartOverride)
        const plannedDuration   = useRCASStore(s => s.plannedDuration)
        const sources           = useRCASStore(s => s.sources)
        const framePool         = useFramePool()

        const [ctxMenu, setCtxMenu] = useState<{
            partId: string; partType: string; x: number; y: number
        } | null>(null)

        useEffect(() => {
            if (!ctxMenu) return
            const close = () => setCtxMenu(null)
            window.addEventListener('click', close)
            return () => window.removeEventListener('click', close)
        }, [ctxMenu])

        const handleContextMenu = (e: React.MouseEvent, part: IPart) => {
            const partId = part._id as string
            if (partId === runtime?.onAirPartId) return
            e.preventDefault()
            e.stopPropagation()
            setCtxMenu({ partId, partType: part.type, x: e.clientX, y: e.clientY })
        }

        const lastClickTime = useRef<number>(0)
        const { segment, parts, pgLabel, totalDurMs, backTimeMs } = row

        const rowBg = isOnAir ? 'rgb(180, 0, 21)'
            : isPreview ? 'rgb(0,155,60)'
            : isPlayed  ? '#999999'
            : '#a6a6a6'

        const rowBorder = isOnAir    ? 'rgba(248,7,29,.3)'
            : isPreview ? 'rgba(10,194,66,.25)'
            : isNext    ? 'rgba(138,106,0,.18)'
            : 'rgba(30,37,48,.7)'

        const textColor = isOnAir || isPreview ? '#FFFFFF'
            : isNext ? C.nxtText : C.textSec

        const overlayGradient =
            'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.0) 35%, rgba(0,0,0,0.7) 100%)'

        return (
            <div
                ref={ref}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 160px 1fr 72px 80px',
                    padding: '0 8px',
                    alignItems: 'center',
                    background: rowBg,
                    position: 'relative',
                    borderRadius: 3,
                    borderLeft: 'none',
                    borderBottom: `1px solid ${rowBorder}`,
                    marginBottom: 2,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    opacity: isPlayed ? 0.5 : 1,
                    transition: 'background 0.08s',
                }}
                onDragOver={(e) => e.preventDefault()}
                onMouseEnter={() => { setHovered(true); setHoveredSegmentId(row.segment._id as string); setKeyboardMode(false) }}
                onMouseLeave={() => { setHovered(false); setHoveredSegmentId(null) }}
                onClick={() => { setHoveredSegmentId(row.segment._id as string); setKeyboardMode(false) }}
                onDoubleClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-part-id]')) return
                    const firstPart = row.parts[0]
                    if (firstPart && !disabled && !isOnAir) onSetNext(firstPart._id as string)
                }}
            >
                {/* PG */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                    <div style={{ fontFamily: C.mono, fontSize: 20, color: textColor, textAlign: 'center' }}>
                        {pgLabel}
                    </div>
                </div>

                {/* TYPE + SLUG */}
                {(() => {
                    const storyType = getStoryDisplayType(segment)
                    const ts = STORY_TYPE_STYLE[storyType]
                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', paddingTop: 2, paddingBottom: 7, position: 'relative', zIndex: 1 }}>
                            <div style={{ flex: 1, minHeight: 0, padding: '4px 8px', overflow: 'hidden' }}>
                                <div style={{ fontFamily: C.sans, fontSize: 11, fontWeight: 600, color: '#FFF', lineHeight: '1.35', maxHeight: '4.05em', overflow: 'hidden', wordBreak: 'break-all' }}>
                                    {segment.name || segment.externalId}
                                </div>
                            </div>
                            <div style={{ flexShrink: 0, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ts.color, fontFamily: C.mono, fontSize: 22, fontWeight: 800, color: '#FFF', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                                <span>{ts.line1}</span>
                                {ts.line2 && <span style={{ marginLeft: 4 }}>{ts.line2}</span>}
                            </div>
                        </div>
                    )
                })()}

                {/* 缩略图区（可横向滚动）*/}
                <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 8px', position: 'relative', zIndex: 3, overflowX: 'auto', overflowY: 'hidden', cursor: 'grab', scrollbarWidth: 'none' }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnter={(e) => e.preventDefault()}
                    onMouseDown={(e) => {
                        if (e.buttons !== 1) return
                        const el = e.currentTarget
                        const startX = e.pageX - el.scrollLeft
                        const onMove = (ev: MouseEvent) => { el.scrollLeft = ev.pageX - startX; el.style.cursor = 'grabbing' }
                        const onUp = () => { el.style.cursor = 'grab'; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                        window.addEventListener('mousemove', onMove)
                        window.addEventListener('mouseup', onUp)
                    }}
                >
                    {parts.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            {parts.map((part, partIdx) => {
                                const partId = part._id as string
                                const isPartOnAir    = partId === runtime?.onAirPartId
                                const isPartPreview  = partId === runtime?.previewPartId
                                const isOverride     = !!partOverrides[partId]
                                const mainPiece = part.pieces?.find(p => {
                                    if (part.type === PartType.KAM)    return p.sourceLayerId === 'camera'
                                    if (part.type === PartType.SERVER) return p.sourceLayerId === 'video'
                                    if (part.type === PartType.VO)     return p.sourceLayerId === 'vo'
                                    return true
                                }) ?? part.pieces?.[0] ?? null

                                return (
                                    <div
                                        key={partId}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 3 }}
                                        data-part-id={partId}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onContextMenu={(e) => handleContextMenu(e, part)}
                                        onClick={() => {
                                            const now = Date.now()
                                            if (now - lastClickTime.current < 300) {
                                                !disabled && !isPartOnAir && onSetNext(part._id as string)
                                                lastClickTime.current = 0
                                            } else {
                                                lastClickTime.current = now
                                            }
                                        }}
                                    >
                                        <div
                                            onDragOver={(e) => { if (partId === runtime?.onAirPartId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                                            onDrop={(e) => {
                                                if (partId === runtime?.onAirPartId) return
                                                e.preventDefault()
                                                const sourceId = e.dataTransfer.getData('sourceId')
                                                if (!sourceId) return
                                                const droppedSource = Object.values(sources).find(s => s.id === sourceId)
                                                if (!droppedSource) return
                                                if (!(SOURCE_TYPE_MAP[part.type] ?? []).includes(droppedSource.type)) return
                                                const ddrFile = e.dataTransfer.getData('ddrFile') || undefined
                                                setPartOverride(partId, sourceId, ddrFile)
                                            }}
                                            style={{ position: 'relative', display: 'inline-block' }}
                                        >
                                            <ThumbnailPlaceholder
                                                type={part.type}
                                                isOnAir={isPartOnAir}
                                                isPreview={isPartPreview}
                                                proxyUrl={mainPiece?.content?.thumbnailPath ?? null}
                                                frameUrl={(() => {
                                                    const overrideSid = partOverrides[partId]?.sourceId
                                                    const sid = overrideSid ?? (part as any).sourceId
                                                    if (!sid) return null
                                                    const src = (sources[sid] as any)?.previewSrc
                                                    if (!src) return null
                                                    return framePool[src] ?? null
                                                })()}
                                                airStatus={mainPiece?.content?.airStatus ?? null}
                                                isOverride={isOverride}
                                                label={partOverrides[partId]?.sourceId ?? (part as any).sourceId ?? null}
                                            />
                                        </div>
                                        {partIdx < parts.length - 1 && (
                                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, animation: (parts[partIdx + 1]._id as string) === runtime?.previewPartId ? 'rcas-blink 1s step-end infinite' : 'none' }}>→</div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {ctxMenu && (
                        <PartContextMenu
                            partId={ctxMenu.partId}
                            partType={ctxMenu.partType}
                            x={ctxMenu.x}
                            y={ctxMenu.y}
                            onClose={() => setCtxMenu(null)}
                        />
                    )}
                </div>

                {/* DUR */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: 22, position: 'relative', zIndex: 1 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: textColor }}>{fmtMs(totalDurMs)}</span>
                </div>

                {/* BACK */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: 22, position: 'relative', zIndex: 1 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: textColor }}>
                        {(() => {
                            const { expectedStart } = rundown
                            if (!expectedStart || !plannedDuration) return fmtMs(backTimeMs)
                            const backClock = expectedStart + plannedDuration - backTimeMs
                            const d = new Date(backClock)
                            const HH = String(d.getHours()).padStart(2, '0')
                            const mm = String(d.getMinutes()).padStart(2, '0')
                            const ss = String(d.getSeconds()).padStart(2, '0')
                            return `${HH}:${mm}:${ss}`
                        })()}
                    </span>
                </div>

                {/* 顶层渐变遮罩 */}
                <div style={{
                    position: 'absolute', inset: 0, borderRadius: 3,
                    background: overlayGradient,
                    pointerEvents: 'none', zIndex: 4,
                    boxShadow: (isKeyboardHovered || (hovered && !isKeyboardMode)) && !isOnAir && !isPreview
                        ? 'inset 0 0 0 3px rgba(255,255,255,1)'
                        : 'none',
                }} />
            </div>
        )
    }
)