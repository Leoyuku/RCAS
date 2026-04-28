/**
 * @file RightPanel.tsx
 * @description 右侧操作区主容器（右侧 40% 布局）
 *
 * 布局结构（从上到下）：
 *   PVW / PGM 监看占位  — MonitorPlaceholder.tsx（实时帧接入前占位，见 TODO-10）
 *   TAB 标签栏          — CAM / DDR1 / DDR2 / DDR3 / DDR4 / M·E
 *   源卡片区            — SourceCard.tsx（CAM/VT）/ DDRPanel.tsx（DDR通道）
 *   CG PREVIEW 区       — storyNum大字 + VIZ占位（见 TODO-2）
 *   剩余空间            — 待规划（见 TODO-5 指令日志区）
 *
 * 依赖：
 *   useRCASStore        — store/useRCASStore.ts
 *   COLOR               — utils/formatters.ts
 *   TOOLBAR_HEIGHT / SOURCE_CARD_ROWS / DDR_TOOLBAR_HEIGHT / CG_PREVIEW_HEIGHT
 *                       — core-lib/ui-constants.ts
 *   MonitorPlaceholder  — components/MonitorPlaceholder.tsx
 *   DDRPanel            — components/DDRPanel.tsx
 *   SourceCard          — components/SourceCard.tsx
 *   AddSourceCard       — components/AddSourceCard.tsx
 *
 * 被使用：App.tsx
 */

import { useState, useRef, useEffect } from 'react'
import { useRCASStore } from '../store/useRCASStore'
import { COLOR } from '../utils/formatters'
import { TOOLBAR_HEIGHT, SOURCE_CARD_ROWS, DDR_TOOLBAR_HEIGHT, CG_PREVIEW_HEIGHT } from '../../../core-lib/src/ui/ui-constants'
import MonitorPlaceholder from './MonitorPlaceholder'
import { useFramePool } from '../contexts/FramePoolContext'
import DDRPanel from './DDRPanel'
import SourceCard from './SourceCard'
import AddSourceCard from './AddSourceCard'

export function RightPanel() {
    const hoveredSegmentId = useRCASStore(s => s.hoveredSegmentId)
    const activeRundown = useRCASStore(s => s.activeRundown)
    const hoveredSegment = hoveredSegmentId
        ? (activeRundown?.segments ?? []).find(s => s._id === hoveredSegmentId) ?? null
        : null
    const { sources } = useRCASStore()
    const [activeTab, setActiveTab] = useState<string>('camera')
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
    const CARD_HEIGHT = 68
    const CARD_GAP = 6
    const CARD_PADDING = 6

    // 按 type 分组，动态生成 Tab 列表
    const TAB_LABELS: Record<string, string> = {
        camera: 'CAM',
        ddr1:   'DDR 1',
        ddr2:   'DDR 2',
        ddr3:   'DDR 3',
        ddr4:   'DDR 4',
        me:     'M/E',
    }

    // 从 sources 里提取出现过的类型，按固定顺序排列
    const TAB_ORDER = ['camera', 'ddr1', 'ddr2', 'ddr3', 'ddr4', 'me']
    const availableTypes = TAB_ORDER.filter(type =>
        Object.values(sources).some(s => s.type === type)
    )

    // 当前 Tab 的源列表
    const currentSources = Object.values(sources).filter(s => s.type === activeTab)
    const tricasterHost = useRCASStore(s => s.tricasterHost)
    const runtime   = useRCASStore(s => s.runtime)
    const framePool = useFramePool()

    function getPreviewSrc(partId: string | null | undefined): string | null {
        if (!partId || !activeRundown) return null
        for (const seg of activeRundown.segments ?? []) {
            const part = seg.parts?.find(p => (p._id as string) === partId)
            if (!part) continue
            const sourceId = (part as any).sourceId
            if (!sourceId) return null
            return (sources[sourceId] as any)?.previewSrc ?? null
        }
        return null
    }

    const monitorOutputs    = useRCASStore(s => s.monitorOutputs)
    const setMonitorOutputs = useRCASStore(s => s.setMonitorOutputs)

    const pvwSrc = monitorOutputs.pvw ?? getPreviewSrc(runtime?.previewPartId)
    const pgmSrc = monitorOutputs.pgm ?? getPreviewSrc(runtime?.onAirPartId)

    const [editingMonitor, setEditingMonitor] = useState<'pvw' | 'pgm' | null>(null)
    const [inputValue, setInputValue]         = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (editingMonitor) {
            setInputValue(monitorOutputs[editingMonitor] ?? '')
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [editingMonitor])

    async function saveMonitorOutput() {
        const val = inputValue.trim() || null
        const newPvw = editingMonitor === 'pvw' ? val : monitorOutputs.pvw
        const newPgm = editingMonitor === 'pgm' ? val : monitorOutputs.pgm
        setMonitorOutputs(newPvw, newPgm)
        setEditingMonitor(null)
        try {
            const cfg = await fetch('/api/device/config').then(r => r.json())
            cfg.monitorOutputs = { pvw: newPvw, pgm: newPgm }
            await fetch('/api/device/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cfg),
            })
        } catch (e) {
            console.error('[RightPanel] Failed to save monitorOutputs:', e)
        }
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
        }}>
            {/* ── 监看画面区（PVW 左 / PGM 右）── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 0,
                background: COLOR.border,
                flexShrink: 0,
            }}>
                {/* PVW */}
                <div style={{ position: 'relative' }}>
                    {pvwSrc && framePool[pvwSrc] ? (
                        <img src={framePool[pvwSrc]!} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} alt="PVW" />
                    ) : (
                        <MonitorPlaceholder label="PVW" color={COLOR.pvw} />
                    )}
                    <button onClick={() => setEditingMonitor('pvw')} style={{
                        position: 'absolute', top: 4, right: 4,
                        background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 4,
                        color: '#fff', cursor: 'pointer', fontSize: 12, padding: '2px 6px',
                    }}>⚙</button>
                </div>
                {/* PGM */}
                <div style={{ position: 'relative' }}>
                    {pgmSrc && framePool[pgmSrc] ? (
                        <img src={framePool[pgmSrc]!} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} alt="PGM" />
                    ) : (
                        <MonitorPlaceholder label="PGM" color={COLOR.pgm} />
                    )}
                    <button onClick={() => setEditingMonitor('pgm')} style={{
                        position: 'absolute', top: 4, right: 4,
                        background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 4,
                        color: '#fff', cursor: 'pointer', fontSize: 12, padding: '2px 6px',
                    }}>⚙</button>
                </div>
                {/* 输入弹窗 */}
                {editingMonitor && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: '#1a1a2e', border: `1px solid ${COLOR.border}`,
                        borderRadius: 8, padding: 16, zIndex: 1000,
                        display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240,
                    }}>
                        <div style={{ color: '#fff', fontSize: 13 }}>
                            {editingMonitor.toUpperCase()} 信号源（如 output1）
                        </div>
                        <input
                            ref={inputRef}
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveMonitorOutput(); if (e.key === 'Escape') setEditingMonitor(null) }}
                            placeholder="output1"
                            style={{
                                background: '#0d0d1a', border: `1px solid ${COLOR.border}`,
                                borderRadius: 4, color: '#fff', padding: '6px 10px', fontSize: 13,
                            }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditingMonitor(null)} style={{
                                background: 'transparent', border: `1px solid ${COLOR.border}`,
                                borderRadius: 4, color: '#aaa', cursor: 'pointer', padding: '4px 12px',
                            }}>取消</button>
                            <button onClick={saveMonitorOutput} style={{
                                background: COLOR.pvw, border: 'none',
                                borderRadius: 4, color: '#fff', cursor: 'pointer', padding: '4px 12px',
                            }}>确认</button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 源面板 ── */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
                {/* Tab 标签栏 */}
                <div style={{
                    height: TOOLBAR_HEIGHT,
                    display: 'flex',
                    flexShrink: 0,
                    background: '#0D0D0D',
                    paddingLeft: 0,
                }}>
                    {availableTypes.length === 0 ? (
                        <div style={{
                            padding: '8px 12px',
                            fontSize: 10,
                            color: COLOR.textDim,
                            fontFamily: '"JetBrains Mono", monospace',
                        }}>
                            加载中...
                        </div>
                    ) : availableTypes.map(type => (
                        <div
                            key={type}
                            onClick={() => setActiveTab(type)}
                            style={{
                                height: '100%',
                                padding: '0 16px',
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontFamily: '"JetBrains Mono", monospace',
                                fontSize: 12,
                                letterSpacing: '0.06em',
                                userSelect: 'none',
                                borderRadius: 0,
                                border: 'none',
                                marginBottom: 0,
                                fontWeight: activeTab === type ? 700 : 400,
                                color: activeTab === type ? '#FFFFFF' : COLOR.textDim,
                                background: activeTab === type ? '#3a4a5c' : 'transparent',
                            }}
                        >
                            {TAB_LABELS[type] ?? type.toUpperCase()}
                        </div>
                    ))}
                </div>

                {/* Tab 内容区：源卡片（固定高度） */}
                <div style={{
                    height: CARD_PADDING * 2 + SOURCE_CARD_ROWS * CARD_HEIGHT + (SOURCE_CARD_ROWS - 1) * CARD_GAP + DDR_TOOLBAR_HEIGHT,
                    flexShrink: 0,
                    overflowY: 'auto',
                    padding: CARD_PADDING,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignContent: 'flex-start',
                    gap: CARD_GAP,
                    border: 'none',
                    margin: 0,
                    background: '#3a4a5c',
                }}>
                    {/* DDR Tab 单独处理 */}
                    {['ddr1','ddr2','ddr3','ddr4'].includes(activeTab) ? (
                        <DDRPanel channel={activeTab} />
                    ) : (
                        <>
                            {currentSources.length === 0 && (
                                <div style={{
                                    width: '100%',
                                    textAlign: 'center',
                                    color: COLOR.textDim,
                                    fontSize: 11,
                                    marginTop: 24,
                                    fontFamily: '"JetBrains Mono", monospace',
                                }}>
                                    无可用源
                                </div>
                            )}
                            {currentSources.map(source => (
                                <SourceCard
                                    key={source.id}
                                    source={source}
                                    isSelected={selectedSourceId === source.id}
                                    onSelect={() => setSelectedSourceId(source.id)}
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('sourceId', source.id)
                                        e.dataTransfer.effectAllowed = 'copy'
                                    }}
                                />
                            ))}
                            {activeTab === 'camera' && (
                                <AddSourceCard
                                    existingSourceIds={currentSources.map(s => s.id)}
                                    tricasterHost={tricasterHost}
                                />
                            )}
                        </>
                    )}
                </div>

                {/* ── CG 预览区 ── */}
                <div style={{
                    height: TOOLBAR_HEIGHT + CG_PREVIEW_HEIGHT,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    borderTop: `1px solid ${COLOR.border}`,
                }}>
                    {/* 标题栏 */}
                    <div style={{
                        height: TOOLBAR_HEIGHT,
                        flexShrink: 0,
                        borderBottom: `1px solid ${COLOR.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 10px',
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        color: COLOR.textDim,
                    }}>
                        <span>CG PREVIEW</span>
                    </div>

                    {/* 预览画面区 */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'row',    // ← 改为横向
                        alignItems: 'stretch',   // ← 改为撑满高度
                        background: '#000',
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        {/* 左：PG 号 */}
                        <div style={{
                            width: 200,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRight: `1px solid ${COLOR.border}`,
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize: 36,
                            fontWeight: 700,
                            color: hoveredSegment ? COLOR.text : COLOR.textDim,
                            opacity: hoveredSegment ? 1 : 0.3,
                        }}>
                            {hoveredSegment?.storyNum ?? '—'}
                        </div>

                        {/* 中：预览内容区 */}
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            {/* 联调后在此加 <img src={cgFrameUrl} ... /> */}
                            <div style={{
                                color: COLOR.textDim,
                                fontFamily: '"JetBrains Mono", monospace',
                                fontSize: 10,
                                opacity: 0.4,
                            }}>
                                — 待接入 VIZ —
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}