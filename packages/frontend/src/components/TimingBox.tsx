/**
 * @file TimingBox.tsx
 * @description 单个时间格子组件（纯展示，无状态）
 *
 * 显示内容：标签 + 时间值，支持自定义颜色和宽度比例
 *
 * 依赖：无外部依赖
 *
 * 被使用：InfoPanel.tsx
 */

export function TimingBox({ label, value, color, flex: flexVal }: {
    label:   string
    value:   string
    color?:  string
    flex?:   number
}) {
    return (
        <div style={{
            flex:          flexVal ?? 1,
            background:    '#141920',
            border:        `1px solid #2a3444`,
            borderRadius:  4,
            padding:       '6px 10px',
            display:       'flex',
            flexDirection: 'column',
            gap:           6,
        }}>
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: '0.12em',
                color:         '#f5f5f5',
                textTransform: 'uppercase',
            }}>
                {label}
            </div>
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      24,
                fontWeight:    700,
                color:         color ?? '#ffffff',
                letterSpacing: '0.04em',
            }}>
                {value}
            </div>
        </div>
    )
}