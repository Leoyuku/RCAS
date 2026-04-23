/**
 * @file DDRPanel.tsx
 * @description DDR 通道面板组件
 *
 * 显示内容：已加载文件列表（DDRFileCard）+ "＋添加"按钮 + FileBrowserModal 弹窗
 * 支持：单选/Shift多选/Ctrl多选、拖拽到节目单、通知 Tricaster 选中文件
 *
 * 内部组件：
 *   DDRFileCard   — DDR 文件卡片（16:9，可拖拽，选中高亮），仅在本文件内使用
 *
 * 数据流：
 *   FileBrowserModal 选中文件 → POST /api/ddr/load → 推送到 Tricaster DDR 通道
 *   → 本地 ddrFiles 状态更新
 *
 * 依赖：
 *   COLOR              — utils/formatters.ts
 *   useRCASStore       — store/useRCASStore.ts（tricasterHost）
 *   FileBrowserModal   — components/FileBrowserModal.tsx
 *   /api/ddr/load      — 后端接口，推送文件路径到 Tricaster DDR
 *
 * 被使用：RightPanel.tsx
 */

import { useState } from 'react'
import { COLOR } from '../utils/formatters'
import { useRCASStore } from '../store/useRCASStore'
import FileBrowserModal from './FileBrowserModal'

export interface DDRFile {
    name:     string
    fullPath: string
    selected: boolean
}

function DDRFileCard({ file, index, onClick, onDragStart }: {
    file:        DDRFile
    index:       number
    onClick:     (e: React.MouseEvent) => void
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => void
}) {
    const displayName = file.name.length > 14
        ? file.name.slice(0, 13) + '…'
        : file.name

    const pgLabel = String(index + 1).padStart(2, '0')

    return (
        <div
            draggable
            onClick={onClick}
            onDragStart={onDragStart}
            style={{
                width:          '120px',
                aspectRatio:    '16/9',
                background:     file.selected ? '#2A3A2A' : '#1C1C1C',
                border:         `1px solid ${file.selected ? COLOR.pvw : COLOR.border}`,
                borderRadius:   3,
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                cursor:         'grab',
                position:       'relative',
                overflow:       'hidden',
                userSelect:     'none',
            }}
        >
            <div style={{ fontSize: 20, opacity: 0.3 }}>🎬</div>

            <div style={{
                position:      'absolute',
                bottom:        0,
                left:          0,
                right:         0,
                padding:       '2px 4px',
                background:    'rgba(0,0,0,0.75)',
                fontSize:      9,
                fontWeight:    700,
                color:         COLOR.text,
                fontFamily:    '"JetBrains Mono", monospace',
                letterSpacing: '0.04em',
                display:       'flex',
                gap:           4,
                alignItems:    'center',
            }}>
                <span style={{ color: COLOR.textDim, flexShrink: 0 }}>{pgLabel}</span>
                <span style={{
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                }}>
                    {displayName}
                </span>
            </div>

            {file.selected && (
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

export default function DDRPanel({ channel }: { channel: string }) {
    const tricasterHost = useRCASStore(s => s.tricasterHost)
    const [ddrFiles, setDdrFiles] = useState<Record<string, DDRFile[]>>({
        DDR1: [], DDR2: [], DDR3: [], DDR4: [],
    })
    const [showBrowser, setShowBrowser]   = useState(false)
    const [lastSelected, setLastSelected] = useState<number | null>(null)

    const channelKey = channel.toUpperCase()
    const channelCmd = channel.toLowerCase()
    const currentFiles = ddrFiles[channelKey] ?? []

    function handleFileClick(index: number, e: React.MouseEvent) {
        setDdrFiles(prev => {
            const files = [...(prev[channelKey] ?? [])]

            if (e.shiftKey && lastSelected !== null) {
                const from = Math.min(lastSelected, index)
                const to   = Math.max(lastSelected, index)
                return {
                    ...prev,
                    [channelKey]: files.map((f, i) => ({
                        ...f,
                        selected: i >= from && i <= to ? true : f.selected,
                    }))
                }
            } else if (e.ctrlKey || e.metaKey) {
                return {
                    ...prev,
                    [channelKey]: files.map((f, i) => ({
                        ...f,
                        selected: i === index ? !f.selected : f.selected,
                    }))
                }
            } else {
                return {
                    ...prev,
                    [channelKey]: files.map((f, i) => ({
                        ...f,
                        selected: i === index,
                    }))
                }
            }
        })
        setLastSelected(index)

        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && tricasterHost) {
            const file = ddrFiles[channelKey]?.[index]
            if (file) {
                fetch(`http://${tricasterHost}/v1/shortcut?name=${channelCmd}_select_file&path=${encodeURIComponent(file.fullPath)}`)
                    .catch(() => {})
            }
        }
    }

    async function handleFilesSelected(files: { name: string; fullPath: string }[]) {
        if (!tricasterHost || files.length === 0) return

        const paths = files.map(f => f.fullPath).join('|')
        await fetch('/api/ddr/load', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ channel: channelCmd, filePath: paths }),
        })

        setDdrFiles(prev => ({
            ...prev,
            [channelKey]: [
                ...(prev[channelKey] ?? []),
                ...files.map(f => ({ ...f, selected: false })),
            ]
        }))
        setShowBrowser(false)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            {/* 添加按钮 */}
            <div style={{
                display:        'flex',
                justifyContent: 'flex-end',
                padding:        '4px 6px',
                borderBottom:   `1px solid ${COLOR.border}`,
                flexShrink:     0,
            }}>
                <div
                    onClick={() => setShowBrowser(true)}
                    style={{
                        padding:      '4px 10px',
                        fontSize:     10,
                        color:        COLOR.pvw,
                        cursor:       'pointer',
                        fontFamily:   '"JetBrains Mono", monospace',
                        border:       `1px solid ${COLOR.pvw}44`,
                        borderRadius: 2,
                        userSelect:   'none',
                    }}
                >
                    + 添加
                </div>
            </div>

            {/* 文件列表 */}
            <div style={{
                flex:         1,
                overflowY:    'auto',
                padding:      6,
                display:      'flex',
                flexWrap:     'wrap',
                alignContent: 'flex-start',
                gap:          6,
            }}>
                {currentFiles.length === 0 ? (
                    <div style={{
                        width:      '100%',
                        textAlign:  'center',
                        color:      COLOR.textDim,
                        fontSize:   11,
                        marginTop:  24,
                        fontFamily: '"JetBrains Mono", monospace',
                    }}>
                        暂无文件，点击"+ 添加"
                    </div>
                ) : currentFiles.map((file, index) => (
                    <DDRFileCard
                        key={file.fullPath + index}
                        file={file}
                        index={index}
                        onClick={(e) => handleFileClick(index, e)}
                        onDragStart={(e) => {
                            e.dataTransfer.setData('sourceId', channelKey)
                            e.dataTransfer.setData('sourceType', 'ddr')
                            e.dataTransfer.setData('ddrFile', file.fullPath)
                            e.dataTransfer.effectAllowed = 'copy'
                        }}
                    />
                ))}
            </div>

            {showBrowser && (
                <FileBrowserModal
                    title={`${channelKey} — 选择文件`}
                    onConfirm={handleFilesSelected}
                    onCancel={() => setShowBrowser(false)}
                />
            )}
        </div>
    )
}