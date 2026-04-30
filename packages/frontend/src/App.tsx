/**
 * @file App.tsx
 * @description RCAS 主界面入口 — 负责全局状态初始化、Socket 连接、顶层布局
 *
 * ═══════════════════════════════════════════════════════════════
 *  布局结构
 * ═══════════════════════════════════════════════════════════════
 *
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  Header.tsx  — 顶栏                                      │
 *  │  Logo | Socket状态 | Rundown名称 | TC状态 | 时钟/NTP       │
 *  ├───────────────────────────┬─────────────────────────────┤
 *  │                           │                             │
 *  │  RundownListView.tsx      │  RightPanel.tsx             │
 *  │  左侧 60%                  │  右侧 40%                   │
 *  │  Rundown 节目单列表主体      │  PVW/PGM监看占位             │
 *  │  每行 = 一条 Story          │  TAB栏（CAM/DDR1-4/M·E）    │
 *  │  Part = 横向缩略图卡片       │  源卡片区                    │
 *  │                            │  CG PREVIEW区               │
 *  ├───────────────────────────┴─────────────────────────────┤
 *  │  InfoPanel.tsx  — 底部信息栏                              │
 *  │  字幕信息 | 节目余量 | 实时偏差 | COUNTDOWN                 │
 *  └─────────────────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════
 *  组件文件索引
 * ═══════════════════════════════════════════════════════════════
 *
 *  components/
 *    Header.tsx             顶栏：Logo、Socket/TC连接状态、RUN按钮、时钟
 *    InfoPanel.tsx          底部：字幕区、时间偏差三格（余量/实时偏差/倒计时）
 *    TimingBox.tsx          单个时间格子，被 InfoPanel 复用
 *    RightPanel.tsx         右侧操作区主容器（PVW/PGM + TAB + 卡片区 + CG区）
 *    MonitorPlaceholder.tsx PVW/PGM 监看占位块（实时帧接入前的占位）
 *    SourceCard.tsx         CAM/VT 源卡片，含 Tricaster 实时帧（useTricasterFrame）
 *    AddSourceCard.tsx      添加新 CAM 源的"+"卡片，验证 Tricaster 槽位后写入配置
 *    DDRPanel.tsx           DDR 通道面板，含文件列表、拖拽、DDRFileCard
 *    FileBrowserModal.tsx   文件浏览弹窗，支持多选视频文件（TODO-9 扩展驱动器支持）
 *
 *  hooks/
 *    useTricasterFrame.ts   直连 Tricaster WebSocket，拉取指定源的实时帧（5fps）
 *    useClock.ts            本地实时时钟 + NTP 同步逻辑
 *
 *  store/
 *    useRCASStore.ts        Zustand 全局状态：rundown、三指针、Socket事件、设备状态
 *
 *  utils/
 *    formatters.ts          COLOR 颜色常量、fmtMs() 时间格式化函数
 *
 *  RundownListView.tsx      Rundown 列表主体（Story行、Part缩略图、键盘导航）
 *
 * ═══════════════════════════════════════════════════════════════
 *  全局状态初始化（本文件负责）
 * ═══════════════════════════════════════════════════════════════
 *
 *  - Socket.io 连接建立与事件监听（snapshot / rundown:update / device:status）
 *  - tricasterHost 写入 store（供 SourceCard、DDRPanel 直连 Tricaster 使用）
 *  - isRunning 状态管理（RUN/STOP 控制播出流程）
 */

import { useEffect, useState } from 'react'
import RundownListView from './RundownListView'
import { useRCASStore } from './store/useRCASStore'
import { useMemo } from 'react'
import { useTricasterFramePool } from './hooks/useTricasterFramePool'
import { FramePoolContext } from './contexts/FramePoolContext'
import ConfigPanel from './components/ConfigPanel'
import { InfoPanel } from './components/InfoPanel'
import { COLOR } from './utils/formatters'
import { Header } from './components/Header'
import { RightPanel } from './components/RightPanel'

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function App() {
    const {
        connected, summaries, activeRundown, runtime,
        activate, take, setNext, run, stop, _initSocket,
        tricasterStatus,
    } = useRCASStore()

    const sources       = useRCASStore(s => s.sources)
    const tricasterHost    = useRCASStore(s => s.tricasterHost)
    const monitorOutputs   = useRCASStore(s => s.monitorOutputs)

    const previewSrcs = useMemo(() => {
        if (!activeRundown || !sources) return []
        const seen = new Set<string>()
        for (const segment of activeRundown.segments ?? []) {
            for (const part of segment.parts ?? []) {
                const sourceId = (part as any).sourceId
                if (!sourceId) continue
                const src = (sources[sourceId] as any)?.previewSrc
                if (src) seen.add(src)
            }
        }
        // 加入手动 pinned 的 source
        for (const source of Object.values(sources)) {
            if ((source as any).pinned && (source as any).previewSrc) {
                seen.add((source as any).previewSrc)
            }
        }
        
        if (monitorOutputs.pvw) seen.add(monitorOutputs.pvw)
            if (monitorOutputs.pgm) seen.add(monitorOutputs.pgm)
            return [...seen]
    }, [activeRundown, sources, monitorOutputs])

    const framePool = useTricasterFramePool(tricasterHost, previewSrcs)

    const [isRunning, setIsRunning] = useState(false)
    const [showRundownPanel, setShowRundownPanel] = useState(false)
    const [showConfigPanel, setShowConfigPanel] = useState(false)
    const [selectedId, setSelectedId]             = useState<string | null>(null)

    useEffect(() => {
        _initSocket()
    }, [])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return
            if (e.code === 'Space') {
                e.preventDefault()
                if (isRunning) take()
            } else if (e.code === 'Enter') {
                e.preventDefault()
            } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                const store = useRCASStore.getState()
                const rows = (store.activeRundown?.segments ?? [])
                    .filter(seg => (seg.parts ?? []).length > 0)
                    .map(seg => ({
                        segmentId: seg._id as string,
                        parts: seg.parts ?? [],
                    }))
                if (rows.length === 0) return
                store.setKeyboardMode(true)
                e.preventDefault()
            
                const currentSegIdx = rows.findIndex(r => r.segmentId === store.hoveredSegmentId)
            
                if (e.code === 'ArrowUp') {
                    const targetIdx = currentSegIdx <= 0 ? 0 : currentSegIdx - 1
                    store.setHoveredSegmentId(rows[targetIdx].segmentId)
                    store.setHoveredPartId(rows[targetIdx].parts[0]?._id as string ?? null)
                }
            
                if (e.code === 'ArrowDown') {
                    const targetIdx = currentSegIdx === -1 ? 0
                        : currentSegIdx >= rows.length - 1 ? rows.length - 1
                        : currentSegIdx + 1
                    store.setHoveredSegmentId(rows[targetIdx].segmentId)
                    store.setHoveredPartId(rows[targetIdx].parts[0]?._id as string ?? null)
                }
            
                if (e.code === 'ArrowLeft') {
                    if (currentSegIdx === -1) return
                    const currentRow = rows[currentSegIdx]
                    const currentPartIdx = currentRow.parts.findIndex(p => (p._id as string) === store.hoveredPartId)
                    if (currentPartIdx > 0) {
                        store.setHoveredPartId(currentRow.parts[currentPartIdx - 1]._id as string)
                    } else if (currentSegIdx > 0) {
                        const prevRow = rows[currentSegIdx - 1]
                        store.setHoveredSegmentId(prevRow.segmentId)
                        store.setHoveredPartId(prevRow.parts[prevRow.parts.length - 1]?._id as string ?? null)
                    }
                }
            
                if (e.code === 'ArrowRight') {
                    if (currentSegIdx === -1) return
                    const currentRow = rows[currentSegIdx]
                    const currentPartIdx = currentRow.parts.findIndex(p => (p._id as string) === store.hoveredPartId)
                    if (currentPartIdx < currentRow.parts.length - 1) {
                        store.setHoveredPartId(currentRow.parts[currentPartIdx + 1]._id as string)
                    } else if (currentSegIdx < rows.length - 1) {
                        const nextRow = rows[currentSegIdx + 1]
                        store.setHoveredSegmentId(nextRow.segmentId)
                        store.setHoveredPartId(nextRow.parts[0]?._id as string ?? null)
                    }
                }
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [take, isRunning])

    const engineState    = runtime?.engineState ?? 'STOPPED'
    const isDisconnected = !connected
    const activeSum      = summaries.find(s => s.lifecycle === 'active' || s.lifecycle === 'on-air')

    // 是否有活跃 Rundown 数据
    const hasRundown = activeRundown !== null

    return (
        <FramePoolContext.Provider value={framePool}>

    return (
        <div 
        style={{
            display:       'flex',
            flexDirection: 'column',
            height:        '100vh',
            background:    COLOR.bgDark,
            color:         COLOR.text,
            fontFamily:    '"IBM Plex Sans Condensed", "Noto Sans SC", sans-serif',
            fontSize:      '13px',
            overflow:      'hidden',
            userSelect:    'none',
        }}>
            {/* ── 顶栏 ── */}
            <Header
                connected={connected}
                rundownName={activeSum?.name ?? activeRundown?.name ?? null}
                engineState={engineState}
                onOpenRundown={() => setShowRundownPanel(true)}
                onOpenConfig={() => setShowConfigPanel(true)}
                onRun={() => {
                    if (!isRunning) {
                        run()
                        setIsRunning(true)
                    } else {
                        stop()
                        setIsRunning(false)
                    }
                }}
                isRunning={isRunning}
                hasRundown={hasRundown}
                tricasterStatus={tricasterStatus}
            />

            {/* ── Rundown 选择面板 ── */}
            {showRundownPanel && (
                <div
                    style={{
                        position:   'fixed',
                        inset:      0,
                        zIndex:     100,
                    }}
                    onClick={() => { setShowRundownPanel(false); setSelectedId(null) }}
                >
                    <div
                        style={{
                            position:   'absolute',
                            top:        48,
                            left:       160,
                            width:      420,
                            background: '#111',
                            border:     `1px solid ${COLOR.border}`,
                            borderRadius: 4,
                            boxShadow:  '0 8px 32px rgba(0,0,0,0.6)',
                            overflow:   'hidden',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* 面板标题 */}
                        <div style={{
                            padding:       '10px 16px',
                            borderBottom:  `1px solid ${COLOR.border}`,
                            fontFamily:    '"JetBrains Mono", monospace',
                            fontSize:      10,
                            fontWeight:    700,
                            letterSpacing: '0.12em',
                            color:         COLOR.textDim,
                            textTransform: 'uppercase',
                        }}>
                            选择节目单
                        </div>

                        {/* Rundown 列表 */}
                        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                            {summaries.length === 0 ? (
                                <div style={{ padding: '20px 16px', color: COLOR.textDim, fontSize: 12 }}>
                                    暂无节目单
                                </div>
                            ) : summaries.map(s => {
                                const isSelected = s.id === selectedId
                                const isActive   = s.lifecycle === 'active' || s.lifecycle === 'on-air'
                                const lcColor    = isActive ? COLOR.pvw : s.lifecycle === 'standby' ? COLOR.next : COLOR.gray
                                return (
                                    <div
                                        key={s.id}
                                        onClick={() => setSelectedId(s.id)}
                                        style={{
                                            display:    'flex',
                                            alignItems: 'center',
                                            gap:        12,
                                            padding:    '10px 16px',
                                            cursor:     'pointer',
                                            background: isSelected ? '#1A1A2E' : 'transparent',
                                            borderLeft: isSelected ? `3px solid ${COLOR.pvw}` : '3px solid transparent',
                                            borderBottom: `1px solid ${COLOR.border}`,
                                        }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{
                                                fontSize:   13,
                                                fontWeight: 600,
                                                color:      isSelected ? COLOR.text : COLOR.textDim,
                                            }}>
                                                {s.name}
                                            </div>
                                            <div style={{ fontSize: 11, color: COLOR.textDim, marginTop: 2 }}>
                                                {s.segmentCount} 个段落
                                            </div>
                                        </div>
                                        <div style={{
                                            fontFamily:    '"JetBrains Mono", monospace',
                                            fontSize:      9,
                                            fontWeight:    700,
                                            letterSpacing: '0.1em',
                                            color:         lcColor,
                                        }}>
                                            {s.lifecycle.toUpperCase()}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* 底部按钮 */}
                        <div style={{
                            display:       'flex',
                            justifyContent:'flex-end',
                            gap:           8,
                            padding:       '10px 16px',
                            borderTop:     `1px solid ${COLOR.border}`,
                        }}>
                            <button
                                onClick={() => { setShowRundownPanel(false); setSelectedId(null) }}
                                style={{
                                    padding:      '5px 16px',
                                    background:   'transparent',
                                    border:       `1px solid ${COLOR.border}`,
                                    borderRadius: 2,
                                    color:        COLOR.textDim,
                                    fontSize:     12,
                                    cursor:       'pointer',
                                }}
                            >
                                取消
                            </button>
                            <button
                                onClick={() => {
                                    if (selectedId && connected) {
                                        activate(selectedId)
                                        setShowRundownPanel(false)
                                        setSelectedId(null)
                                    }
                                }}
                                disabled={!selectedId || !connected}
                                style={{
                                    padding:      '5px 16px',
                                    background:   selectedId && connected ? COLOR.pvw + '22' : 'transparent',
                                    border:       `1px solid ${selectedId && connected ? COLOR.pvw : COLOR.border}`,
                                    borderRadius: 2,
                                    color:        selectedId && connected ? COLOR.pvw : COLOR.textDim,
                                    fontSize:     12,
                                    fontWeight:   700,
                                    cursor:       selectedId && connected ? 'pointer' : 'not-allowed',
                                }}
                            >
                                激 活
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showConfigPanel && (
                <ConfigPanel onClose={() => setShowConfigPanel(false)} />
            )}

            {/* ── 断线横幅 ── */}
            {isDisconnected && (
                <div style={{
                    background:    '#7B0000',
                    color:         '#FFB3B3',
                    textAlign:     'center',
                    padding:       '6px',
                    fontSize:      '12px',
                    fontWeight:    700,
                    letterSpacing: '0.1em',
                    borderBottom:  '1px solid #C0392B',
                }}>
                    ⚠ 连接中断 — 所有操作已禁用
                </div>
            )}

            {/* ── 主体两栏 ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

            {/* 左栏 60% */}
            <div style={{
                width:         '60%',
                display:       'flex',
                flexDirection: 'column',
                borderRight:   `1px solid ${COLOR.border}`,
                overflow:      'hidden',
            }}>
                {/* ── 信息区 216px ── */}
                <InfoPanel
                    runtime={runtime}
                    activeRundown={activeRundown}
                />
                {/* ── Rundown 列表 ── */}
                {hasRundown ? (
                    <RundownListView
                        rundown={activeRundown!}
                        runtime={runtime}
                        onSetNext={connected ? setNext : () => {}}
                        disabled={!connected || !isRunning}
                    />
                ) : (
                    <div style={{
                        flex:           1,
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        flexDirection:  'column',
                        gap:            12,
                        color:          COLOR.textDim,
                        fontFamily:     '"JetBrains Mono", monospace',
                        fontSize:       11,
                        letterSpacing:  '0.12em',
                    }}>
                        <div>NO ACTIVE RUNDOWN</div>
                        <div style={{ fontSize: 10, opacity: 0.5 }}>点击顶栏 RUNDOWN 选择节目单</div>
                    </div>
                )}
            </div>

            {/* 右栏 40% */}
            <div style={{
                width:         '40%',
                display:       'flex',
                flexDirection: 'column',
                overflow:      'hidden',
            }}>
                <RightPanel />
            </div>

            </div>

            {/* ── 字体加载 ── */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
                * { box-sizing: border-box; margin: 0; padding: 0; }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: #111; }
                ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
                body { overflow: hidden; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
            `}</style>
        </div>
        </FramePoolContext.Provider>
    )
}


