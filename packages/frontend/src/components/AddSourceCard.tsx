/**
 * @file AddSourceCard.tsx
 * @description 添加新 CAM 源的"+"卡片组件
 *
 * 功能：展开下拉菜单 → 选择 CAM 编号 → 查询 Tricaster 验证槽位存在
 *       → 验证通过后写入 device-config（addSource）
 * CAM 候选列表：CAM1-CAM9 中去掉已配置的源
 *
 * 依赖：
 *   COLOR         — utils/formatters.ts
 *   useRCASStore  — store/useRCASStore.ts（addSource 方法）
 *   /api/device/inputs — 后端接口，验证 Tricaster 槽位
 *
 * 被使用：RightPanel.tsx
 */

import { useState } from 'react'
import { COLOR } from '../utils/formatters'
import { useRCASStore } from '../store/useRCASStore'

interface AddSourceCardProps {
    existingSourceIds: string[]
    tricasterHost: string | null
    allCameraIds: string[]
}

export default function AddSourceCard({ existingSourceIds, tricasterHost, allCameraIds }: AddSourceCardProps) {
    const [open, setOpen]       = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError]     = useState<string | null>(null)
    const { addSource } = useRCASStore()

    const candidates = allCameraIds.filter(id => !existingSourceIds.includes(id))
        .filter(id => !existingSourceIds.includes(id))

    async function handleSelect(camId: string) {
        if (!tricasterHost) return
        setLoading(true)
        setError(null)

        try {
            const res  = await fetch(`/api/device/inputs`)
            const data = await res.json()
            const slot = data.slots?.find((s: any) =>
                s.switcherName?.replace(/\s+/g, '').toUpperCase() === camId.replace(/\s+/g, '').toUpperCase()
            )

            if (!slot) {
                setError(`Tricaster 中未找到 ${camId}，请先在 Tricaster 中命名该槽位`)
                setLoading(false)
                return
            }

            await addSource({
                id:           camId,
                label:        camId,
                type:         'camera',
                previewSrc:   slot.previewSrc,
                switcherName: slot.switcherName,
                pinned:       true,
            } as any)

            setOpen(false)
        } catch {
            setError('查询失败，请检查网络连接')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ position: 'relative' }}>
            <div
                onClick={() => { setOpen(!open); setError(null) }}
                style={{
                    width:          '120px',
                    aspectRatio:    '16/9',
                    background:     open ? '#2A2A2A' : '#1C1C1C',
                    border:         `1px dashed ${COLOR.border}`,
                    borderRadius:   3,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    cursor:         'pointer',
                    color:          COLOR.textDim,
                    fontSize:       22,
                    fontWeight:     300,
                    userSelect:     'none',
                    transition:     'background 0.1s',
                }}
            >
                +
            </div>

            {open && (
                <div style={{
                    position:     'absolute',
                    top:          '100%',
                    left:         0,
                    marginTop:    4,
                    background:   '#1A1A1A',
                    border:       `1px solid ${COLOR.border}`,
                    borderRadius: 4,
                    zIndex:       100,
                    minWidth:     120,
                    overflow:     'hidden',
                }}>
                    {candidates.length === 0 ? (
                        <div style={{
                            padding:    '8px 12px',
                            fontSize:   11,
                            color:      COLOR.textDim,
                            fontFamily: '"JetBrains Mono", monospace',
                        }}>
                            无可添加
                        </div>
                    ) : candidates.map(camId => (
                        <div
                            key={camId}
                            onClick={() => handleSelect(camId)}
                            style={{
                                padding:      '7px 12px',
                                fontSize:     11,
                                color:        loading ? COLOR.textDim : COLOR.text,
                                fontFamily:   '"JetBrains Mono", monospace',
                                cursor:       loading ? 'not-allowed' : 'pointer',
                                borderBottom: `1px solid ${COLOR.border}`,
                            }}
                            onMouseEnter={e => {
                                if (!loading)
                                    (e.currentTarget as HTMLDivElement).style.background = '#2A2A2A'
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                            }}
                        >
                            {loading ? '验证中...' : camId}
                        </div>
                    ))}

                    {error && (
                        <div style={{
                            padding:    '6px 12px',
                            fontSize:   10,
                            color:      COLOR.pgm,
                            fontFamily: '"JetBrains Mono", monospace',
                            borderTop:  `1px solid ${COLOR.border}`,
                            lineHeight: 1.4,
                        }}>
                            {error}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}