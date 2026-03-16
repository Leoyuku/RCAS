/**
 * @file RundownListView.tsx
 * @description RCAS Rundown 列表组件 — 折叠模式（第一轮默认）
 *
 * 显示规范（折叠模式）：
 *   - 每条 ISegment（Story）占一行，显示 storySlug 作为标题
 *   - 内部 IPart（Item）以胶囊标签形式内联显示在标题下方
 *   - 胶囊标签显示类型（CAM / VT / VO 等），可点击 SET NEXT
 *   - DUR = 整条 Story 所有 Parts 时长之和
 *   - 状态颜色跟包含 ON AIR / PVW / NEXT Part 的 Story 行走
 *   - PG 号按 Segment 序号编号
 *
 * 列布局（6列）：
 *   ST-ICON(28) | PG(44) | SLUG/ELEMENTS(1fr) | DUR(56) | BACK(64) | ST(28)
 */

import { useMemo, useRef, useEffect, forwardRef } from 'react'
import type { IRundown }       from '../../core-lib/src/models/rundown-model'
import type { ISegment }       from '../../core-lib/src/models/segment-model'
import type { IPart }          from '../../core-lib/src/models/part-model'
import type { RundownRuntime } from '../../core-lib/src/socket/socket-contracts'
import { PartType }            from '../../core-lib/src/models/enums'

// ─── 颜色系统 ─────────────────────────────────────────────────────────────────

const C = {
  bgBase:       '#090b0e',
  bgSurface:    '#0d1117',
  bgRaised:     '#13181f',
  border:       '#1e2530',
  borderMid:    '#252d3a',
  borderStrong: '#2d3848',
  textPrimary:  '#dde4ee',
  textSec:      '#6a7d92',
  textDim:      '#333f4e',

  pgmBg:     '#2a0806',
  pgmBorder: '#c0392b',
  pgmText:   '#ff8070',
  pgmLabel:  '#e74c3c',
  pgmFade:   'rgba(192,57,43,.55)',

  pvwBg:     '#051a0a',
  pvwBorder: '#1e8449',
  pvwText:   '#6ee89a',
  pvwLabel:  '#27ae60',
  pvwFade:   'rgba(30,132,73,.55)',

  nxtBg:     '#140f00',
  nxtBorder: '#8a6a00',
  nxtText:   '#e0b830',
  nxtFade:   'rgba(138,106,0,.55)',

  mono: '"IBM Plex Mono", "JetBrains Mono", monospace',
  sans: '"IBM Plex Sans Condensed", "Helvetica Neue", sans-serif',
}

// ─── Part 类型标签样式 ────────────────────────────────────────────────────────

const PART_TYPE_LABEL: Record<string, string> = {
  [PartType.KAM]:      'CAM',
  [PartType.SERVER]:   'VT',
  [PartType.VO]:       'VO',
  [PartType.LIVE]:     'LV',
  [PartType.GRAPHICS]: 'GFX',
  [PartType.UNKNOWN]:  '???',
}

const PART_TYPE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  [PartType.KAM]:      { color: '#6baaf5', bg: 'rgba(37,99,235,.18)',   border: 'rgba(37,99,235,.35)' },
  [PartType.SERVER]:   { color: '#b09af0', bg: 'rgba(124,58,237,.18)',  border: 'rgba(124,58,237,.35)' },
  [PartType.VO]:       { color: '#5ec48a', bg: 'rgba(5,150,105,.18)',   border: 'rgba(5,150,105,.35)' },
  [PartType.LIVE]:     { color: '#f87171', bg: 'rgba(220,38,38,.18)',   border: 'rgba(220,38,38,.35)' },
  [PartType.GRAPHICS]: { color: '#f5b944', bg: 'rgba(217,119,6,.18)',   border: 'rgba(217,119,6,.35)' },
  [PartType.UNKNOWN]:  { color: '#6a7d92', bg: 'rgba(106,125,146,.12)', border: 'rgba(106,125,146,.25)' },
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function fmtTimeOfDay(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

// ─── Story 行数据结构 ─────────────────────────────────────────────────────────

interface StoryRow {
  segment:    ISegment
  parts:      IPart[]
  pgLabel:    string
  totalDurMs: number
  backTimeMs: number
}

function buildStoryRows(rundown: IRundown): StoryRow[] {
  const segments    = rundown.segments ?? []
  const rows: StoryRow[] = []
  const allParts    = segments.flatMap(seg => seg.parts ?? [])
  const totalDuration = allParts.reduce((acc, p) => acc + (p.expectedDuration ?? 0), 0)
  let accumulated   = 0

  for (let i = 0; i < segments.length; i++) {
    const seg      = segments[i]
    const parts    = seg.parts ?? []
    const storyDur = parts.reduce((acc, p) => acc + (p.expectedDuration ?? 0), 0)
    rows.push({
      segment:    seg,
      parts,
      pgLabel:    String(i + 1).padStart(2, '0'),
      totalDurMs: storyDur,
      backTimeMs: totalDuration - accumulated,
    })
    accumulated += storyDur
  }
  return rows
}

// ─── 全局动画 ─────────────────────────────────────────────────────────────────

function injectAnimations() {
  if (typeof document === 'undefined') return
  if (document.getElementById('rcas-rl-anim')) return
  const style = document.createElement('style')
  style.id = 'rcas-rl-anim'
  style.textContent = `@keyframes rcas-blink { 0%,100%{opacity:1} 50%{opacity:0} }`
  document.head.appendChild(style)
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RundownListProps {
  rundown:   IRundown
  runtime:   RundownRuntime | null
  disabled:  boolean
  onSetNext: (partId: string) => void
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function RundownListView({ rundown, runtime, disabled, onSetNext }: RundownListProps) {
  injectAnimations()
  const rows     = useMemo(() => buildStoryRows(rundown), [rundown])
  const onAirRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (onAirRef.current)
      onAirRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [runtime?.onAirPartId])

  const stats = useMemo(() => {
    const allParts  = rows.flatMap(r => r.parts)
    const totalMs   = allParts.reduce((a, p) => a + (p.expectedDuration ?? 0), 0)
    const onAirIdx  = runtime?.onAirPartId
      ? allParts.findIndex(p => (p._id as string) === runtime.onAirPartId)
      : -1
    const playedMs  = onAirIdx >= 0
      ? allParts.slice(0, onAirIdx).reduce((a, p) => a + (p.expectedDuration ?? 0), 0)
      : 0
    const remainMs  = totalMs - playedMs
    return { totalMs, playedMs, remainMs, expectedEnd: Date.now() + remainMs }
  }, [rows, runtime?.onAirPartId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: C.bgBase }}>
      <ColumnHeader />
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${C.borderStrong} transparent` }}>
        {rows.length === 0 ? <EmptyState /> : rows.map((row, idx) => {
          const onAirSegIdx = rows.findIndex(r =>
            r.parts.some(p => (p._id as string) === runtime?.onAirPartId)
          )
          const isOnAir   = idx === onAirSegIdx
          const isPreview = idx === onAirSegIdx + 1
          const isNext    = false
        
          // 已播：ON AIR 故事之前的所有故事
          const isPlayed = onAirSegIdx >= 0 && idx < onAirSegIdx
        
          return (
            <StoryRowItem
              key={row.segment._id as string}
              row={row}
              isOnAir={isOnAir}
              isPreview={isPreview}
              isNext={isNext}
              isPlayed={isPlayed}
              disabled={disabled}
              onSetNext={onSetNext}
              runtime={runtime}
              ref={isOnAir ? onAirRef : null}
            />
          )
        })}
      </div>
      <TotalBar stats={stats} />
    </div>
  )
}

// ─── 列头 ─────────────────────────────────────────────────────────────────────

function ColumnHeader() {
  const col = (label: string, align: 'left' | 'right' = 'left') => (
    <div style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.textDim, textTransform: 'uppercase', textAlign: align }}>
      {label}
    </div>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 44px 1fr 56px 64px 28px', padding: '0 8px', height: 26, alignItems: 'center', background: C.bgSurface, borderBottom: `1px solid ${C.borderStrong}`, flexShrink: 0 }}>
      {col('')}
      {col('PG')}
      {col('SLUG / ELEMENTS')}
      {col('DUR', 'right')}
      {col('BACK', 'right')}
      {col('ST', 'right')}
    </div>
  )
}

// ─── Story 行 ─────────────────────────────────────────────────────────────────

interface StoryRowItemProps {
  row:       StoryRow
  isOnAir:   boolean
  isPreview: boolean
  isNext:    boolean
  isPlayed:  boolean
  disabled:  boolean
  onSetNext: (partId: string) => void
  runtime:   RundownRuntime | null
}

const StoryRowItem = forwardRef<HTMLDivElement, StoryRowItemProps>(
  ({ row, isOnAir, isPreview, isNext, isPlayed, disabled, onSetNext, runtime }, ref) => {
    const { segment, parts, pgLabel, totalDurMs, backTimeMs } = row

    const rowBg      = isOnAir ? C.pgmBg : isPreview ? C.pvwBg : isNext ? C.nxtBg : 'transparent'
    const leftBorder = isOnAir ? C.pgmBorder : isPreview ? C.pvwBorder : isNext ? C.nxtBorder : 'transparent'
    const slugColor  = isOnAir ? C.pgmText : isPreview ? C.pvwText : isNext ? C.nxtText : C.textPrimary
    const pgColor    = isOnAir ? C.pgmFade : isPreview ? C.pvwFade : isNext ? C.nxtFade : C.textDim
    const durColor   = isOnAir ? '#ff6b5b' : isPreview ? '#52c47a' : isNext ? C.nxtText : C.textSec
    const backColor  = isOnAir ? 'rgba(255,107,91,.4)' : isPreview ? 'rgba(82,196,122,.35)' : isNext ? 'rgba(200,154,0,.35)' : C.textDim
    const rowBorder  = isOnAir ? 'rgba(192,57,43,.25)' : isPreview ? 'rgba(30,132,73,.18)' : isNext ? 'rgba(138,106,0,.18)' : 'rgba(30,37,48,.7)'

    return (
      <div
        ref={ref}
        style={{ display: 'grid', gridTemplateColumns: '28px 44px 1fr 56px 64px 28px', padding: '7px 8px', alignItems: 'start', background: rowBg, borderLeft: `3px solid ${leftBorder}`, borderBottom: `1px solid ${rowBorder}`, opacity: isPlayed ? 0.28 : 1, transition: 'background 0.08s', minHeight: 44 }}
        onMouseEnter={e => { if (!isOnAir && !isPreview && !isNext && !isPlayed) (e.currentTarget as HTMLDivElement).style.background = C.bgRaised }}
        onMouseLeave={e => { if (!isOnAir && !isPreview && !isNext) (e.currentTarget as HTMLDivElement).style.background = rowBg }}
      >
        {/* ST 图标 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22 }}>
          <StateIcon isOnAir={isOnAir} isPreview={isPreview} isNext={isNext} isPlayed={isPlayed} />
        </div>

        {/* PG */}
        <div style={{ display: 'flex', alignItems: 'center', height: 22 }}>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: pgColor }}>{pgLabel}</span>
        </div>

        {/* SLUG + Part 胶囊标签 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0 8px 0 0', minWidth: 0 }}>
          {/* 故事标题 */}
          <div style={{ fontFamily: C.sans, fontSize: 12, fontWeight: isOnAir ? 700 : isPreview ? 600 : 500, color: isPlayed ? C.textSec : slugColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.3', height: 22, display: 'flex', alignItems: 'center' }}>
            {segment.name || segment.externalId}
          </div>

          {/* Part 胶囊标签行 */}
          {parts.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {parts.map(part => {
                const isPartOnAir   = (part._id as string) === runtime?.onAirPartId
                const isPartPreview = (part._id as string) === runtime?.previewPartId
                const isPartNext    = (part._id as string) === runtime?.nextPartId
                const ts            = PART_TYPE_STYLE[part.type] ?? PART_TYPE_STYLE[PartType.UNKNOWN]
                const typeLabel     = PART_TYPE_LABEL[part.type] ?? '???'
                const canClick      = !disabled && !isPartOnAir

                const tagBg     = isPartOnAir   ? C.pgmBorder + '55'
                                : isPartPreview ? C.pvwBorder + '55'
                                : isPartNext    ? C.nxtBorder + '55'
                                : ts.bg
                const tagBorder = isPartOnAir   ? C.pgmBorder
                                : isPartPreview ? C.pvwBorder
                                : isPartNext    ? C.nxtBorder
                                : ts.border
                const tagColor  = isPartOnAir   ? C.pgmText
                                : isPartPreview ? C.pvwText
                                : isPartNext    ? C.nxtText
                                : ts.color
                const dotColor  = isPartOnAir   ? C.pgmLabel
                                : isPartPreview ? C.pvwLabel
                                : isPartNext    ? C.nxtText
                                : C.borderStrong

                return (
                  <button
                    key={part._id as string}
                    onClick={() => canClick && onSetNext(part._id as string)}
                    title={canClick ? `SET NEXT → ${typeLabel}` : typeLabel}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: C.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3, border: `1px solid ${tagBorder}`, background: tagBg, color: tagColor, cursor: canClick ? 'pointer' : 'default', whiteSpace: 'nowrap', transition: 'all 0.08s', outline: 'none' }}
                  >
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                    {typeLabel}
                    {part.expectedDuration > 0 && (
                      <span style={{ fontSize: 8, opacity: 0.6, fontWeight: 400, marginLeft: 1 }}>
                        {fmtMs(part.expectedDuration)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* DUR */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: 22 }}>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: durColor }}>{fmtMs(totalDurMs)}</span>
        </div>

        {/* BACK */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: 22 }}>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: backColor }}>{fmtMs(backTimeMs)}</span>
        </div>

        {/* ST 点 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.borderStrong }} />
        </div>
      </div>
    )
  }
)

// ─── 状态图标 ─────────────────────────────────────────────────────────────────

function StateIcon({ isOnAir, isPreview, isNext, isPlayed }: {
  isOnAir: boolean; isPreview: boolean; isNext: boolean; isPlayed: boolean
}) {
  if (isOnAir)    return <span style={{ fontFamily: C.mono, fontSize: 9, color: C.pgmLabel, fontWeight: 700 }}>▶</span>
  if (isPreview)  return <span style={{ fontFamily: C.mono, fontSize: 9, color: C.pvwLabel, fontWeight: 700 }}>●</span>
  if (isNext)     return <span style={{ fontFamily: C.mono, fontSize: 8, color: C.nxtBorder }}>◆</span>
  return <div style={{ width: 5, height: 5, borderRadius: '50%', border: `1px solid ${isPlayed ? C.borderStrong : C.borderMid}` }} />
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

interface TotalBarStats {
  totalMs: number; playedMs: number; remainMs: number; expectedEnd: number
}

function TotalBar({ stats }: { stats: TotalBarStats }) {
  const items = [
    { lbl: 'TOTAL',  val: fmtMs(stats.totalMs),  color: C.textSec },
    { lbl: 'PLAYED', val: fmtMs(stats.playedMs), color: C.textSec },
    { lbl: 'REM',    val: fmtMs(stats.remainMs), color: stats.remainMs > 0 && stats.remainMs < 120_000 ? '#e74c3c' : C.pvwLabel },
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
