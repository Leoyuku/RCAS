/**
 * @file MonitorPlaceholder.tsx
 * @description PVW / PGM 监看占位块（纯展示，无状态）
 *
 * 显示内容：16:9 黑色背景 + 彩色边框 + 标签 + "无信号"文字
 * 实时帧接入后本组件将被替换（见 TODO-10）
 *
 * 依赖：
 *   COLOR  — utils/formatters.ts
 *
 * 被使用：RightPanel.tsx
 */

import { COLOR } from '../utils/formatters'

interface MonitorPlaceholderProps {
    label: string
    color: string
}

export default function MonitorPlaceholder({ label, color }: MonitorPlaceholderProps) {
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