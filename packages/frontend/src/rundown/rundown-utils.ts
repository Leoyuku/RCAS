/* @file rundown-utils.ts
 * @description Rundown 模块的纯函数工具集（无副作用，无 React 依赖）
 *
 * 包含：
 *   StoryRow           — Story 行数据结构（segment + parts + 时间信息）
 *   fmtMs()            — 毫秒 → "m:ss" 格式字符串
 *   buildStoryRows()   — IRundown → StoryRow[]，计算每行的 DUR 和 BACK 时间
 *   getStoryDisplayType() — ISegment → StoryDisplayType，按 slug 关键词和 Part 组合推断类型
 *   injectAnimations() — 向 document.head 注入 ON AIR / PVW 脉冲动画 CSS（幂等）
 *
 * 修改指南：
 *   改时间显示格式     → 修改 fmtMs()
 *   改 Story 类型判断逻辑 → 修改 getStoryDisplayType()（关键词优先，Part 组合兜底）
 *   改 ON AIR/PVW 动画效果 → 修改 injectAnimations() 中的 keyframes
 */

import { PartType } from '../../../core-lib/src/models/enums'
import type { IRundown } from '../../../core-lib/src/models/rundown-model'
import type { ISegment } from '../../../core-lib/src/models/segment-model'
import type { StoryDisplayType } from './rundown-constants'

export interface StoryRow {
    segment: ISegment
    parts: import('../../../core-lib/src/models/part-model').IPart[]
    pgLabel: string
    totalDurMs: number
    backTimeMs: number
}

export function fmtMs(ms: number): string {
    if (!ms || ms <= 0) return '—'
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}

export function buildStoryRows(rundown: IRundown): StoryRow[] {
    const allSegments = (rundown.segments ?? []) as ISegment[]
    const segments = allSegments.filter(seg => (seg.parts ?? []).length > 0)
    const rows: StoryRow[] = []
    const allParts = segments.flatMap(seg => seg.parts ?? [])
    const totalDuration = allParts.reduce((acc, p) => acc + (p.expectedDuration ?? 0), 0)
    let accumulated = 0

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        const parts = seg.parts ?? []
        const storyDur = seg.expectedDuration
            ?? parts.reduce((acc, p) => acc + (p.expectedDuration ?? 0), 0)
        rows.push({
            segment: seg,
            parts,
            pgLabel: seg.storyNum ?? String(i + 1).padStart(2, '0'),
            totalDurMs: storyDur,
            backTimeMs: totalDuration - accumulated,
        })
        accumulated += storyDur
    }
    return rows
}

export function getStoryDisplayType(segment: ISegment): StoryDisplayType {
    const slug = segment.name.toUpperCase()
    const parts = segment.parts ?? []

    if (slug.includes('COLD') || slug.includes('COLD_OPEN')) return 'COLD_OPEN'
    if (slug.includes('TEASER')) return 'TEASER'
    if (slug.includes('OPENING') || slug.includes('OPEN')) return 'OPENING'
    if (slug.includes('COMING') || slug.includes('COME_BACK')
        || slug.includes('COMING_BACK') || slug.includes('COMINGBACK')) return 'COMING_BACK'
    if (slug.includes('ENDING') || slug.includes('GOODBYE')) return 'ENDING'
    if (slug.includes('BREAK') || slug.includes('BRK')) return 'BREAK'
    if (slug.includes('COMMERCIAL') || slug.includes('AD')
        || slug.includes('AD_')) return 'AD'
    if (slug.includes('WEATHER') || slug.includes('WX')) return 'WEATHER'
    if (slug.includes('HELLO')) return 'COLD_OPEN'

    const hasCAM = parts.some(p => p.type === PartType.KAM)
    const hasVT  = parts.some(p => p.type === PartType.SERVER)
    const hasVO  = parts.some(p => p.type === PartType.VO)
    const hasLV  = parts.some(p => p.type === PartType.LIVE)

    if (hasLV) return 'LIVE'
    if (hasCAM && hasVT) return 'PKG'
    if (hasCAM && hasVO) return 'VO'
    if (hasCAM) return 'CAM'
    if (hasVT)  return 'PKG'
    return 'UNKNOWN'
}

export function injectAnimations() {
    if (typeof document === 'undefined') return
    if (document.getElementById('rcas-rl-anim')) return
    const style = document.createElement('style')
    style.id = 'rcas-rl-anim'
    style.textContent = `
        @keyframes rcas-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes rcas-pgm-pulse {
            0%,100% { box-shadow: 0 0 0 4px #f8071d, 0 0 16px 6px rgba(255,255,255,0.9); }
            50%     { box-shadow: 0 0 0 4px rgba(248,7,29,0.3), 0 0 6px 2px rgba(255,255,255,0.2); }
        }
        @keyframes rcas-pvw-pulse {
            0%,100% { box-shadow: 0 0 0 4px rgb(10,194,99), 0 0 16px 6px rgba(255,255,255,0.9); }
            50%     { box-shadow: 0 0 0 4px rgba(10,194,99,0.3), 0 0 6px 2px rgba(255,255,255,0.2); }
        }
    `
    document.head.appendChild(style)
}