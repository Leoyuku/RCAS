/* @file PartContextMenu.tsx
 * @description Part 的右键覆盖菜单（通过 ReactDOM Portal 渲染到 document.body）
 *
 * 功能：
 *   - 列出当前 Part 类型允许的所有 source（由 SOURCE_TYPE_MAP 过滤）
 *   - 点击 source 项 → 调用 setPartOverride(partId, sourceId)
 *   - 已有覆盖时显示"清除覆盖"选项 → 调用 clearPartOverride(partId)
 *   - 当前已选中的 source 显示橙色 ✓ 标记
 *
 * 数据来源：
 *   sources / overrides / setPartOverride / clearPartOverride — 全部从 useRCASStore 取
 *   SOURCE_TYPE_MAP — 从 rundown-constants 取，决定哪些 source 可以出现在菜单里
 *
 * 关闭时机：由父组件（StoryRowItem）控制：
 *   - window click 事件 → onClose()
 *   - 菜单项点击后 → onClose()
 *
 * 修改指南：
 *   改菜单样式        → 修改最外层 div style
 *   改可选 source 范围 → 修改 rundown-constants.ts 中的 SOURCE_TYPE_MAP
 *   加菜单项（如"编辑备注"）→ 在 allowedSources.map 之后追加 div
 */

import ReactDOM from 'react-dom'
import { C, SOURCE_TYPE_MAP } from './rundown-constants'
import { useRCASStore } from '../store/useRCASStore'

interface PartContextMenuProps {
    partId: string
    partType: string
    x: number
    y: number
    isTemp?: boolean
    onClose: () => void
}

export function PartContextMenu({ partId, partType, x, y, isTemp = false, onClose }: PartContextMenuProps) {
    const sources         = useRCASStore(s => s.sources)
    const partOverrides   = useRCASStore(s => s.overrides)
    const setPartOverride = useRCASStore(s => s.setPartOverride)
    const clearPartOverride = useRCASStore(s => s.clearPartOverride)
    const removeTempPart = useRCASStore(s => s.removeTempPart)

    const allowedSources = Object.values(sources)
        .filter(s => (SOURCE_TYPE_MAP[partType] ?? []).includes(s.type))

    return ReactDOM.createPortal(
        <div
            onClick={e => e.stopPropagation()}
            style={{
                position: 'fixed', top: y, left: x, zIndex: 9999,
                background: '#1a1f28', border: '1px solid #2d3848', borderRadius: 4,
                padding: '4px 0', minWidth: 148,
                boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                fontFamily: C.mono, fontSize: 11,
            }}
        >
            {allowedSources.map(source => {
                const isSelected = partOverrides[partId]?.sourceId === source.id
                return (
                    <div
                        key={source.id}
                        onClick={() => { setPartOverride(partId, source.id); onClose() }}
                        style={{
                            padding: '5px 12px', cursor: 'pointer',
                            color: isSelected ? 'rgb(255,140,0)' : '#dde4ee',
                            background: isSelected ? 'rgba(255,140,0,0.1)' : 'transparent',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(255,140,0,0.1)' : 'transparent' }}
                    >
                        <span>{isSelected ? '✓ ' : ''}{source.label}</span>
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginLeft: 8 }}>{source.id}</span>
                    </div>
                )
            })}
            {!!partOverrides[partId] && (
                <>
                    <div style={{ height: 1, background: '#2d3848', margin: '4px 0' }} />
                    <div
                        onClick={() => { clearPartOverride(partId); onClose() }}
                        style={{ padding: '5px 12px', cursor: 'pointer', color: 'rgb(255,140,0)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        清除覆盖
                    </div>
                </>
            )}

            {isTemp && (
                <>
                    <div style={{ height: 1, background: '#2d3848', margin: '4px 0' }} />
                    <div
                        onClick={() => { removeTempPart(partId); onClose() }}
                        style={{ padding: '5px 12px', cursor: 'pointer', color: '#e74c3c' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        移除此 Part
                    </div>
                </>
            )}
        </div>,
        document.body
    )
}