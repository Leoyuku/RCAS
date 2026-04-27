/**
 * @file ConfigPanel.tsx
 * @description 系统配置面板
 *
 * 功能：设备连接 / Sources 管理 / 默认源 / 节目时长
 * 数据：GET /api/device/config 加载，PUT /api/device/config 保存
 *
 * 依赖：
 *   COLOR — utils/formatters.ts
 *
 * 被使用：App.tsx
 */

import { useState, useEffect } from 'react'
import { COLOR } from '../utils/formatters'

interface DeviceConfig {
    plannedDuration: number
    devices: Record<string, {
        label: string
        connection: { host: string; port: number }
    }>
    sources: Record<string, {
        id: string
        type: string
        previewSrc?: string
        switcherName?: string
        label?: string
    }>
    defaultSources: { kam: string; server: string; vo: string; live: string }
}

const TABS = [
    { id: 'device',   label: '设备连接' },
    { id: 'sources',  label: 'Sources' },
    { id: 'defaults', label: '默认源' },
    { id: 'timing',   label: '节目时长' },
]

const M = '"JetBrains Mono", monospace'

interface ConfigPanelProps {
    onClose: () => void
}

export default function ConfigPanel({ onClose }: ConfigPanelProps) {
    const [activeTab, setActiveTab]   = useState('device')
    const [config, setConfig]         = useState<DeviceConfig | null>(null)
    const [dirty, setDirty]           = useState(false)
    const [saving, setSaving]         = useState(false)
    const [saveMsg, setSaveMsg]       = useState<string | null>(null)
    const [newSourceId, setNewSourceId] = useState('')

    useEffect(() => {
        fetch('/api/device/config')
            .then(r => r.json())
            .then(setConfig)
    }, [])

    function update(fn: (c: DeviceConfig) => DeviceConfig) {
        setConfig(prev => prev ? fn(prev) : prev)
        setDirty(true)
    }

    async function save() {
        if (!config) return
        setSaving(true)
        try {
            await fetch('/api/device/config', {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(config),
            })
            setDirty(false)
            setSaveMsg('已保存')
            setTimeout(() => setSaveMsg(null), 2000)
        } catch {
            setSaveMsg('保存失败')
        } finally {
            setSaving(false)
        }
    }

    function addSource() {
        const id = newSourceId.trim().toUpperCase()
        if (!id || !config || config.sources[id]) return
        update(c => ({
            ...c,
            sources: {
                ...c.sources,
                [id]: { id, type: 'camera', previewSrc: '', switcherName: '', label: id },
            }
        }))
        setNewSourceId('')
    }

    function removeSource(id: string) {
        update(c => {
            const next = { ...c.sources }
            delete next[id]
            return { ...c, sources: next }
        })
    }

    if (!config) return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: COLOR.textDim, fontFamily: M, fontSize: 12,
        }}>
            加载中...
        </div>
    )

    const tricasterKey = Object.keys(config.devices)[0]
    const tricaster    = config.devices[tricasterKey]

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 300,
                background: 'rgba(0,0,0,0.75)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: 680, height: 520,
                    background: '#111',
                    border: `1px solid ${COLOR.border}`,
                    borderRadius: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* 标题栏 */}
                <div style={{
                    padding: '10px 16px',
                    borderBottom: `1px solid ${COLOR.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <span style={{ fontFamily: M, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: COLOR.text }}>
                        系统配置
                    </span>
                    <button onClick={onClose} style={{
                        background: 'transparent', border: 'none',
                        color: COLOR.textDim, fontSize: 16, cursor: 'pointer', lineHeight: 1,
                    }}>✕</button>
                </div>

                {/* 主体：左侧 Tab + 右侧内容 */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                    {/* 左侧导航 */}
                    <div style={{
                        width: 120, borderRight: `1px solid ${COLOR.border}`,
                        display: 'flex', flexDirection: 'column', padding: '8px 0',
                    }}>
                        {TABS.map(tab => (
                            <div
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    padding: '9px 16px',
                                    fontFamily: M, fontSize: 11, cursor: 'pointer',
                                    color: activeTab === tab.id ? COLOR.pvw : COLOR.textDim,
                                    background: activeTab === tab.id ? `${COLOR.pvw}11` : 'transparent',
                                    borderLeft: activeTab === tab.id ? `2px solid ${COLOR.pvw}` : '2px solid transparent',
                                }}
                            >
                                {tab.label}
                            </div>
                        ))}
                    </div>

                    {/* 右侧内容区 */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

                        {/* ── 设备连接 ── */}
                        {activeTab === 'device' && (
                            <div>
                                <SectionTitle>Tricaster</SectionTitle>
                                <Field label="IP 地址">
                                    <Input
                                        value={tricaster.connection.host}
                                        onChange={v => update(c => ({
                                            ...c,
                                            devices: {
                                                ...c.devices,
                                                [tricasterKey]: {
                                                    ...tricaster,
                                                    connection: { ...tricaster.connection, host: v }
                                                }
                                            }
                                        }))}
                                    />
                                </Field>
                                <Field label="端口">
                                    <Input
                                        value={String(tricaster.connection.port)}
                                        onChange={v => update(c => ({
                                            ...c,
                                            devices: {
                                                ...c.devices,
                                                [tricasterKey]: {
                                                    ...tricaster,
                                                    connection: { ...tricaster.connection, port: Number(v) }
                                                }
                                            }
                                        }))}
                                    />
                                </Field>
                            </div>
                        )}

                        {/* ── Sources 管理 ── */}
                        {activeTab === 'sources' && (
                            <div>
                                <SectionTitle>Sources</SectionTitle>
                                {/* 新增 */}
                                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                                    <input
                                        value={newSourceId}
                                        onChange={e => setNewSourceId(e.target.value)}
                                        placeholder="新 Source ID（如 CAM3）"
                                        style={inputStyle}
                                    />
                                    <button onClick={addSource} style={btnStyle(true)}>添加</button>
                                </div>
                                {/* 列表 */}
                                {Object.values(config.sources).map(src => (
                                    <div key={src.id} style={{
                                        border: `1px solid ${COLOR.border}`,
                                        borderRadius: 4, padding: 12, marginBottom: 8,
                                    }}>
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            marginBottom: 8, alignItems: 'center',
                                        }}>
                                            <span style={{ fontFamily: M, fontSize: 11, fontWeight: 700, color: COLOR.text }}>
                                                {src.id}
                                            </span>
                                            <button
                                                onClick={() => removeSource(src.id)}
                                                style={{ background: 'transparent', border: 'none', color: COLOR.pgm, cursor: 'pointer', fontSize: 12 }}
                                            >
                                                删除
                                            </button>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <Field label="类型">
                                                <select
                                                    value={src.type}
                                                    onChange={e => update(c => ({
                                                        ...c,
                                                        sources: { ...c.sources, [src.id]: { ...src, type: e.target.value } }
                                                    }))}
                                                    style={{ ...inputStyle, width: '100%' }}
                                                >
                                                    {['camera','vt','ddr1','ddr2','ddr3','ddr4','me'].map(t => (
                                                        <option key={t} value={t}>{t}</option>
                                                    ))}
                                                </select>
                                            </Field>
                                            <Field label="previewSrc">
                                                <Input
                                                    value={src.previewSrc ?? ''}
                                                    onChange={v => update(c => ({
                                                        ...c,
                                                        sources: { ...c.sources, [src.id]: { ...src, previewSrc: v } }
                                                    }))}
                                                />
                                            </Field>
                                            <Field label="switcherName">
                                                <Input
                                                    value={src.switcherName ?? ''}
                                                    onChange={v => update(c => ({
                                                        ...c,
                                                        sources: { ...c.sources, [src.id]: { ...src, switcherName: v } }
                                                    }))}
                                                />
                                            </Field>
                                            <Field label="标签">
                                                <Input
                                                    value={src.label ?? src.id}
                                                    onChange={v => update(c => ({
                                                        ...c,
                                                        sources: { ...c.sources, [src.id]: { ...src, label: v } }
                                                    }))}
                                                />
                                            </Field>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── 默认源 ── */}
                        {activeTab === 'defaults' && (
                            <div>
                                <SectionTitle>默认源映射</SectionTitle>
                                {(['kam', 'server', 'vo', 'live'] as const).map(key => (
                                    <Field key={key} label={key.toUpperCase()}>
                                        <select
                                            value={config.defaultSources[key]}
                                            onChange={e => update(c => ({
                                                ...c,
                                                defaultSources: { ...c.defaultSources, [key]: e.target.value }
                                            }))}
                                            style={{ ...inputStyle, width: '100%' }}
                                        >
                                            {Object.keys(config.sources).map(id => (
                                                <option key={id} value={id}>{id}</option>
                                            ))}
                                        </select>
                                    </Field>
                                ))}
                            </div>
                        )}

                        {/* ── 节目时长 ── */}
                        {activeTab === 'timing' && (
                            <div>
                                <SectionTitle>节目时长</SectionTitle>
                                <Field label="计划时长（分钟）">
                                    <Input
                                        value={String(Math.round(config.plannedDuration / 60000))}
                                        onChange={v => update(c => ({
                                            ...c,
                                            plannedDuration: Number(v) * 60000
                                        }))}
                                    />
                                </Field>
                            </div>
                        )}
                    </div>
                </div>

                {/* 底部保存栏 */}
                <div style={{
                    padding: '10px 16px',
                    borderTop: `1px solid ${COLOR.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
                }}>
                    {saveMsg && (
                        <span style={{ fontFamily: M, fontSize: 11, color: saveMsg === '已保存' ? COLOR.pvw : COLOR.pgm }}>
                            {saveMsg}
                        </span>
                    )}
                    {dirty && (
                        <span style={{ fontFamily: M, fontSize: 10, color: 'rgb(255,140,0)' }}>
                            ● 有未保存的更改
                        </span>
                    )}
                    <button onClick={onClose} style={btnStyle(false)}>取消</button>
                    <button onClick={save} disabled={!dirty || saving} style={btnStyle(dirty && !saving)}>
                        {saving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── 内部小组件 ────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
            marginBottom: 12, paddingBottom: 6,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
            {children}
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 9, color: 'rgba(255,255,255,0.35)',
                letterSpacing: '0.08em', marginBottom: 4,
            }}>
                {label}
            </div>
            {children}
        </div>
    )
}

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <input
            value={value}
            onChange={e => onChange(e.target.value)}
            style={inputStyle}
        />
    )
}

const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 3, padding: '5px 8px',
    fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
    color: '#dde4ee', outline: 'none',
}

function btnStyle(active: boolean): React.CSSProperties {
    return {
        padding: '5px 16px',
        background: active ? 'rgba(10,194,99,0.15)' : 'transparent',
        border: `1px solid ${active ? 'rgb(10,194,99)' : 'rgba(255,255,255,0.15)'}`,
        borderRadius: 2, cursor: active ? 'pointer' : 'not-allowed',
        color: active ? 'rgb(10,194,99)' : 'rgba(255,255,255,0.3)',
        fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 700,
    }
}