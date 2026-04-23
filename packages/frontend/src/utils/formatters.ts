/**
 * @file formatters.ts
 * @description 全局颜色常量 + 时间格式化工具函数
 *
 * 导出：
 *   COLOR   — 全局 UI 颜色常量（pgm红 / pvw绿 / next橙 / 背景/边框/文字系列）
 *   fmtMs() — 毫秒转 m:ss 格式字符串（≤0 返回 '—'）
 *
 * 被使用：几乎所有组件和 hooks
 */

export const COLOR = {
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

export function fmtMs(ms: number): string {
    if (!ms || ms <= 0) return '—'
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}