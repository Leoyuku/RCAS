/* @file rundown-constants.ts
 * @description Rundown 模块的所有静态常量
 *
 * 包含：
 *   C                — 颜色系统（背景、边框、文字、ON AIR/PVW/NEXT 三色）
 *   StoryDisplayType — Story 显示类型枚举（用于左侧 TYPE 色块）
 *   StoryTypeStyle   — 每种 StoryDisplayType 对应的显示样式
 *   STORY_TYPE_STYLE — StoryDisplayType → StoryTypeStyle 映射表
 *   SOURCE_TYPE_MAP  — PartType → 允许的 source.type[] 映射（拖拽 + 右键菜单共用）
 *
 * 修改指南：
 *   改颜色主题        → 修改 C 对象
 *   新增 Story 类型   → 在 StoryDisplayType 和 STORY_TYPE_STYLE 同步添加
 *   改拖拽/右键约束   → 修改 SOURCE_TYPE_MAP
 */

import { PartType } from '../../../core-lib/src/models/enums'

export const C = {
    bgBase: '#090b0e',
    bgSurface: '#0d1117',
    bgRaised: '#1a1f28',
    border: '#1e2530',
    borderMid: '#252d3a',
    borderStrong: '#2d3848',
    textPrimary: '#dde4ee',
    textSec: '#FFFFFF',
    textDim: '#FFFFFF',

    pgmBorder: '#f8071d',
    pvwBorder: '#0ac242',
    pvwLabel: '#0ac242',
    nxtBorder: '#8a6a00',
    nxtText: '#e0b830',

    mono: '"IBM Plex Mono", "JetBrains Mono", monospace',
    sans: '"IBM Plex Sans Condensed", "Helvetica Neue", sans-serif',
}

export type StoryDisplayType =
    'COLD_OPEN' | 'TEASER' | 'OPENING' | 'COMING_BACK' | 'ENDING' |
    'PKG' | 'VO' | 'CAM' | 'LIVE' | 'WEATHER' |
    'BREAK' | 'AD' | 'UNKNOWN'

export interface StoryTypeStyle {
    line1: string
    line2?: string
    color: string
    bg: string
}

export const STORY_TYPE_STYLE: Record<StoryDisplayType, StoryTypeStyle> = {
    COLD_OPEN:   { line1: 'COLD',    line2: 'OPEN',  color: '#E8572A', bg: 'rgba(232,87,42,.18)' },
    TEASER:      { line1: 'TEASER',                  color: '#E89020', bg: 'rgba(232,144,32,.18)' },
    OPENING:     { line1: 'OPENING',                 color: '#D4A800', bg: 'rgba(212,168,0,.18)' },
    COMING_BACK: { line1: 'COMING',  line2: 'BACK',  color: '#2A9D8F', bg: 'rgba(42,157,143,.18)' },
    ENDING:      { line1: 'ENDING',                  color: '#4A7FA5', bg: 'rgba(74,127,165,.18)' },
    PKG:         { line1: 'PKG',                     color: '#7B5EA7', bg: 'rgba(123,94,167,.18)' },
    VO:          { line1: 'VO',                      color: '#2E8B57', bg: 'rgba(46,139,87,.18)' },
    CAM:         { line1: 'CAM',                     color: '#2B6CB0', bg: 'rgba(43,108,176,.18)' },
    LIVE:        { line1: 'LIVE',                    color: '#C0392B', bg: 'rgba(192,57,43,.18)' },
    WEATHER:     { line1: 'WEATHER',                 color: '#5B9BD5', bg: 'rgba(91,155,213,.18)' },
    BREAK:       { line1: 'BREAK',                   color: '#5A6B7A', bg: 'rgba(90,107,122,.18)' },
    AD:          { line1: 'AD',                      color: '#8B2020', bg: 'rgba(139,32,32,.18)' },
    UNKNOWN:     { line1: '???',                     color: '#4a5568', bg: 'rgba(74,85,104,.12)' },
}

// 按 partType 允许的 source 类型（拖拽 + 右键菜单共用）
export const SOURCE_TYPE_MAP: Record<string, string[]> = {
    [PartType.KAM]:    ['camera'],
    [PartType.SERVER]: ['vt', 'ddr1', 'ddr2', 'ddr3', 'ddr4'],
    [PartType.VO]:     ['vt', 'ddr1', 'ddr2', 'ddr3', 'ddr4'],
    [PartType.LIVE]:   ['camera'],
}