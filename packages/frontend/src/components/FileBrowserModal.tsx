/**
 * @file FileBrowserModal.tsx
 * @description 文件浏览弹窗组件
 *
 * 功能：浏览服务器文件系统 → 过滤视频文件（mp4/mov/avi/mxf/mkv/wmv/m4v）
 *       → 支持单选 / Shift多选 / Ctrl多选 → 回调返回选中文件列表
 *
 * ⚠️  TODO-9：当前根目录固定为 C:\，待扩展驱动器枚举支持
 *     扩展方案：path='' 时调用 GET /api/files/drives，展示所有驱动器入口
 *
 * 依赖：
 *   COLOR              — utils/formatters.ts
 *   /api/files/browse  — 后端接口，返回目录内容（entries / current / parent）
 *
 * 被使用：DDRPanel.tsx
 */

import { useState, useEffect } from 'react'
import { COLOR } from '../utils/formatters'

export interface FileEntry {
    name:        string
    fullPath:    string
    isDirectory: boolean
}

interface FileBrowserModalProps {
    title:     string
    onConfirm: (files: { name: string; fullPath: string }[]) => void
    onCancel:  () => void
}

export default function FileBrowserModal({ title, onConfirm, onCancel }: FileBrowserModalProps) {
    const [currentPath, setCurrentPath] = useState<string>('')
    const [entries, setEntries]         = useState<FileEntry[]>([])
    const [parent, setParent]           = useState<string | null>(null)
    const [selected, setSelected]       = useState<Set<string>>(new Set())
    const [lastClicked, setLastClicked] = useState<number | null>(null)
    const [loading, setLoading]         = useState(false)
    const [error, setError]             = useState<string | null>(null)

    useEffect(() => { browse('') }, [])

    async function browse(path: string) {
        setLoading(true)
        setError(null)
        try {
            const url = path ? `/api/files/browse?path=${encodeURIComponent(path)}` : '/api/files/browse'
            const res  = await fetch(url)
            const data = await res.json()
            if (data.error) { setError(data.error); return }
            setEntries(data.entries ?? [])
            setCurrentPath(data.current ?? path)
            setParent(data.parent ?? null)
            setSelected(new Set())
            setLastClicked(null)
        } catch {
            setError('无法读取目录')
        } finally {
            setLoading(false)
        }
    }

    function handleEntryClick(entry: FileEntry, _index: number, e: React.MouseEvent) {
        if (entry.isDirectory) {
            browse(entry.fullPath)
            return
        }

        const fileEntries = entries.filter(e => !e.isDirectory)
        const fileIndex   = fileEntries.indexOf(entry)

        setSelected(prev => {
            const next = new Set(prev)
            if (e.shiftKey && lastClicked !== null) {
                const from = Math.min(lastClicked, fileIndex)
                const to   = Math.max(lastClicked, fileIndex)
                fileEntries.slice(from, to + 1).forEach(f => next.add(f.fullPath))
            } else if (e.ctrlKey || e.metaKey) {
                next.has(entry.fullPath) ? next.delete(entry.fullPath) : next.add(entry.fullPath)
            } else {
                next.clear()
                next.add(entry.fullPath)
            }
            return next
        })
        setLastClicked(fileIndex)
    }

    function handleConfirm() {
        const selectedFiles = entries
            .filter(e => !e.isDirectory && selected.has(e.fullPath))
            .map(e => ({ name: e.name, fullPath: e.fullPath }))
        if (selectedFiles.length > 0) onConfirm(selectedFiles)
    }

    const VIDEO_EXT = ['.mp4', '.mov', '.avi', '.mxf', '.mkv', '.wmv', '.m4v']
    const isVideo = (name: string) =>
        VIDEO_EXT.some(ext => name.toLowerCase().endsWith(ext))

    return (
        <div
            style={{
                position:       'fixed',
                inset:          0,
                zIndex:         200,
                background:     'rgba(0,0,0,0.7)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
            }}
            onClick={onCancel}
        >
            <div
                style={{
                    width:         520,
                    maxHeight:     480,
                    background:    '#151515',
                    border:        `1px solid ${COLOR.border}`,
                    borderRadius:  6,
                    display:       'flex',
                    flexDirection: 'column',
                    overflow:      'hidden',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* 标题栏 */}
                <div style={{
                    padding:       '10px 16px',
                    borderBottom:  `1px solid ${COLOR.border}`,
                    fontFamily:    '"JetBrains Mono", monospace',
                    fontSize:      11,
                    fontWeight:    700,
                    color:         COLOR.text,
                    letterSpacing: '0.08em',
                }}>
                    {title}
                </div>

                {/* 当前路径 */}
                <div style={{
                    padding:       '5px 16px',
                    borderBottom:  `1px solid ${COLOR.border}`,
                    fontFamily:    '"JetBrains Mono", monospace',
                    fontSize:      9,
                    color:         COLOR.textDim,
                    letterSpacing: '0.04em',
                    whiteSpace:    'nowrap',
                    overflow:      'hidden',
                    textOverflow:  'ellipsis',
                }}>
                    {currentPath || '根目录'}
                </div>

                {/* 文件列表 */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading && (
                        <div style={{
                            padding:    '20px',
                            textAlign:  'center',
                            color:      COLOR.textDim,
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize:   11,
                        }}>
                            加载中...
                        </div>
                    )}

                    {error && (
                        <div style={{
                            padding:    '20px',
                            textAlign:  'center',
                            color:      COLOR.pgm,
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize:   11,
                        }}>
                            {error}
                        </div>
                    )}

                    {!loading && parent !== null && (
                        <div
                            onClick={() => browse(parent)}
                            style={{
                                padding:      '7px 16px',
                                display:      'flex',
                                alignItems:   'center',
                                gap:          8,
                                cursor:       'pointer',
                                borderBottom: `1px solid ${COLOR.border}`,
                                color:        COLOR.textDim,
                                fontSize:     12,
                                fontFamily:   '"JetBrains Mono", monospace',
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#2A2A2A'}
                            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                        >
                            <span>📁</span>
                            <span>..</span>
                        </div>
                    )}

                    {!loading && entries.map((entry, index) => {
                        const isSelected = !entry.isDirectory && selected.has(entry.fullPath)
                        const show = entry.isDirectory || isVideo(entry.name)
                        if (!show) return null

                        return (
                            <div
                                key={entry.fullPath}
                                onClick={(e) => handleEntryClick(entry, index, e)}
                                style={{
                                    padding:      '7px 16px',
                                    display:      'flex',
                                    alignItems:   'center',
                                    gap:          8,
                                    cursor:       entry.isDirectory ? 'pointer' : 'default',
                                    borderBottom: `1px solid ${COLOR.border}`,
                                    background:   isSelected ? `${COLOR.pvw}22` : 'transparent',
                                    color:        isSelected ? COLOR.pvw : entry.isDirectory ? COLOR.textDim : COLOR.text,
                                    fontSize:     12,
                                    fontFamily:   '"JetBrains Mono", monospace',
                                }}
                                onMouseEnter={e => {
                                    if (!isSelected)
                                        (e.currentTarget as HTMLDivElement).style.background = '#2A2A2A'
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLDivElement).style.background = isSelected ? `${COLOR.pvw}22` : 'transparent'
                                }}
                            >
                                <span>{entry.isDirectory ? '📁' : '🎬'}</span>
                                <span style={{
                                    flex:         1,
                                    overflow:     'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace:   'nowrap',
                                }}>
                                    {entry.name}
                                </span>
                                {isSelected && <span style={{ fontSize: 10, color: COLOR.pvw }}>✓</span>}
                            </div>
                        )
                    })}
                </div>

                {/* 底部按钮栏 */}
                <div style={{
                    padding:        '10px 16px',
                    borderTop:      `1px solid ${COLOR.border}`,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'space-between',
                }}>
                    <span style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize:   10,
                        color:      COLOR.textDim,
                    }}>
                        {selected.size > 0 ? `已选 ${selected.size} 个文件` : '未选择文件'}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={onCancel}
                            style={{
                                padding:      '5px 16px',
                                background:   'transparent',
                                border:       `1px solid ${COLOR.border}`,
                                borderRadius: 2,
                                color:        COLOR.textDim,
                                fontSize:     12,
                                cursor:       'pointer',
                                fontFamily:   '"JetBrains Mono", monospace',
                            }}
                        >
                            取消
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={selected.size === 0}
                            style={{
                                padding:      '5px 16px',
                                background:   selected.size > 0 ? `${COLOR.pvw}22` : 'transparent',
                                border:       `1px solid ${selected.size > 0 ? COLOR.pvw : COLOR.border}`,
                                borderRadius: 2,
                                color:        selected.size > 0 ? COLOR.pvw : COLOR.textDim,
                                fontSize:     12,
                                fontWeight:   700,
                                cursor:       selected.size > 0 ? 'pointer' : 'not-allowed',
                                fontFamily:   '"JetBrains Mono", monospace',
                            }}
                        >
                            确认
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}