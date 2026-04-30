/* @file ThumbnailPlaceholder.tsx
 * @description 单个 Part 的画面占位符组件（160×90px）
 *
 * 显示优先级（互斥）：
 *   1. CAM 实时帧     — type=KAM 且 frameUrl 存在时，显示 Tricaster WebSocket 帧
 *   2. 视频缩略图     — type=SERVER/VO 且 proxyUrl 存在且非 NOT READY 时，显示代理图
 *   3. NOT READY 警告 — type=SERVER/VO 且 airStatus="NOT READY" 时，显示橙色警告
 *   4. 通用占位符     — 其他情况，显示半透明图标（🎥 或 ▶）
 *
 * 状态装饰：
 *   ON AIR  — 红色脉冲边框（rcas-pgm-pulse 动画，由 injectAnimations 注入）
 *   PREVIEW — 绿色脉冲边框（rcas-pvw-pulse 动画）
 *   OVR 角标 — isOverride=true 时右上角显示橙色 "OVR" 标记
 *
 * 修改指南：
 *   改边框样式/动画   → 修改 boxShadow 和 animation 逻辑
 *   改占位符图标/文字 → 修改 showPlaceholder 分支
 *   改 OVR 角标样式   → 修改末尾 isOverride 条件块
 */

import { PartType } from '../../../core-lib/src/models/enums'
import { C } from './rundown-constants'

interface ThumbnailPlaceholderProps {
    type: string
    isOnAir: boolean
    isPreview: boolean
    proxyUrl?: string | null
    airStatus?: string | null
    frameUrl?: string | null
    isOverride?: boolean
    label?: string | null
}

export function ThumbnailPlaceholder({
    type, isOnAir, isPreview, proxyUrl, airStatus, frameUrl, isOverride = false, label
}: ThumbnailPlaceholderProps) {
    const isCamera      = type === PartType.KAM
    const isVideoServer = type === PartType.SERVER || type === PartType.VO
    const isNotReady    = airStatus === 'NOT READY'

    const showCameraFrame  = isCamera && !!frameUrl
    const showProxyImage   = isVideoServer && !isNotReady && !!proxyUrl
    const showNotReady     = isVideoServer && isNotReady
    const showPlaceholder  = !showCameraFrame && !showProxyImage && !showNotReady

    return (
        <div style={{
            width: 160, height: 90,
            background: 'rgba(0,0,0,0.28)',
            borderRadius: 2,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, position: 'relative', overflow: 'hidden',
            boxShadow: isOnAir
                ? '0 0 0 4px #f8071d, 0 0 16px 6px rgba(255,255,255,0.9)'
                : isPreview
                    ? '0 0 0 4px rgb(10,194,99), 0 0 16px 6px rgba(255,255,255,0.9)'
                    : isNotReady
                        ? '0 0 0 2px rgb(255,140,0)'
                        : '0 0 0 1px rgba(255,255,255,0.08)',
            animation: isOnAir
                ? 'rcas-pgm-pulse 1.5s ease-in-out infinite'
                : isPreview
                    ? 'rcas-pvw-pulse 2.5s ease-in-out infinite'
                    : 'none',
        }}>
            {showCameraFrame && (
                <img src={frameUrl!} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 2 }} alt="camera preview" />
            )}
            {showProxyImage && (
                <img src={proxyUrl!} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 2 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} alt="clip thumbnail" />
            )}
            {showNotReady && (
                <>
                    <div style={{ fontSize: 18, opacity: 0.9, marginBottom: 4 }}>⚠️</div>
                    <div style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'rgb(255,140,0)' }}>NOT READY</div>
                </>
            )}
            {showPlaceholder && (
                <>
                    <div style={{ fontSize: 24, opacity: isOnAir || isPreview ? 0.3 : 0.18, marginBottom: 4 }}>
                        {isCamera ? '🎥' : '▶'}
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)' }}>
                        {isCamera ? 'CAM' : 'VT/VO'}
                    </div>
                </>
            )}
            {label && (
                <div style={{
                    position: 'absolute', top: 3, left: 3,
                    background: 'rgba(0,0,0,0.7)',
                    color: isOverride ? 'rgb(255,140,0)' : 'rgba(255,255,255,0.85)',
                    fontFamily: C.mono, fontSize: 8, fontWeight: 700,
                    padding: '1px 4px', borderRadius: 2, letterSpacing: '0.06em',
                    pointerEvents: 'none',
                }}>{label}</div>
            )}

            {isOverride && (
                <div style={{
                    position: 'absolute', top: 3, right: 3,
                    background: 'rgb(255,140,0)', color: '#000',
                    fontFamily: C.mono, fontSize: 8, fontWeight: 700,
                    padding: '1px 4px', borderRadius: 2, letterSpacing: '0.06em',
                    pointerEvents: 'none',
                }}>OVR</div>
            )}
        </div>
    )
}