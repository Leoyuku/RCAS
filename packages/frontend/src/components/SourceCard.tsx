/**
 * @file SourceCard.tsx
 * @description CAM / VT 源卡片组件（含实时帧，可拖拽）
 *
 * 显示内容：Tricaster 实时帧（CAM类型）/ 图标占位（其他类型）+ 源ID标签
 * CAM 类型传入 tricasterHost，其他类型传 null 以跳过 WebSocket 连接
 *
 * 依赖：
 *   COLOR              — utils/formatters.ts
 *   useTricasterFrame  — hooks/useTricasterFrame.ts（直连 Tricaster WebSocket，5fps）
 *
 * 被使用：RightPanel.tsx
 */

import { COLOR } from '../utils/formatters'
import { useTricasterFrame } from '../hooks/useTricasterFrame'

interface SourceCardProps {
    source:        { id: string; label: string; type: string; previewSrc?: string }
    isSelected:    boolean
    tricasterHost: string | null
    onSelect:      () => void
    onDragStart:   (e: React.DragEvent<HTMLDivElement>) => void
}

export default function SourceCard({ source, isSelected, tricasterHost, onSelect, onDragStart }: SourceCardProps) {
    const frameUrl = useTricasterFrame(
        tricasterHost,
        source.previewSrc ?? null
    )

    return (
        <div
            draggable
            onClick={onSelect}
            onDragStart={onDragStart}
            style={{
                width:          '120px',
                aspectRatio:    '16/9',
                background:     isSelected ? '#3A3A3A' : '#1C1C1C',
                border:         `1px solid ${isSelected ? COLOR.pvw : COLOR.border}`,
                borderRadius:   3,
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                cursor:         'grab',
                position:       'relative',
                overflow:       'hidden',
            }}
        >
            {frameUrl ? (
                <img
                    src={frameUrl}
                    alt={source.id}
                    style={{
                        position:  'absolute',
                        inset:     0,
                        width:     '100%',
                        height:    '100%',
                        objectFit: 'cover',
                    }}
                />
            ) : (
                <div style={{ fontSize: 14, marginBottom: 4, opacity: 0.4 }}>
                    {source.type === 'camera' ? '📷' : source.type === 'vt' ? '▶' : '🎬'}
                </div>
            )}

            <div style={{
                position:       'absolute',
                bottom:         0,
                left:           0,
                right:          0,
                padding:        '2px 4px',
                background:     'rgba(0,0,0,0.65)',
                fontSize:       9,
                fontWeight:     700,
                color:          COLOR.text,
                fontFamily:     '"JetBrains Mono", monospace',
                letterSpacing:  '0.06em',
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'center',
            }}>
                <span>{source.id}</span>
                <span style={{ color: COLOR.textDim, fontWeight: 400 }}>{source.label}</span>
            </div>

            {isSelected && (
                <div style={{
                    position:      'absolute',
                    inset:         0,
                    border:        `2px solid ${COLOR.pvw}`,
                    borderRadius:  3,
                    pointerEvents: 'none',
                }}/>
            )}
        </div>
    )
}