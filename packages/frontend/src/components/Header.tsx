/**
 * @file Header.tsx
 * @description 顶栏组件（48px）
 *
 * 显示内容：Logo | Socket连接状态 | Rundown名称 | TC连接状态（呼吸灯）| 实时时钟 | RUN/STOP按钮
 *
 * 依赖：
 *   COLOR            — utils/formatters.ts
 *   TOOLBAR_HEIGHT   — core-lib/ui-constants.ts
 *   useClock         — hooks/useClock.ts（时钟在本组件内部调用）
 *
 * 被使用：App.tsx
 */

import { COLOR } from '../utils/formatters'
import { TOOLBAR_HEIGHT } from '../../../core-lib/src/ui/ui-constants'

export function Header({ connected, rundownName, engineState, onOpenRundown, onOpenConfig, onRun, isRunning, hasRundown, tricasterStatus }: {
    connected:       boolean
    rundownName:     string | null
    engineState:     string
    onOpenRundown:   () => void
    onOpenConfig:    () => void
    onRun:           () => void
    isRunning:       boolean
    hasRundown:      boolean
    tricasterStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR'
}) {
    const engineColor =
        engineState === 'RUNNING'    ? COLOR.pgm  :
        engineState === 'READY'      ? COLOR.pvw  :
        engineState === 'TAKING'     ? '#FF6B35'  :
        engineState === 'TRANSITION' ? '#FF6B35'  :
        engineState === 'ERROR'      ? '#E74C3C'  :
        COLOR.gray

    return (
        <div style={{
            height:       TOOLBAR_HEIGHT,
            minHeight:    TOOLBAR_HEIGHT,
            background:   '#105752',
            borderBottom: `1px solid ${COLOR.border}`,
            display:      'flex',
            alignItems:   'center',
            padding:      '0 16px',
            gap:          16,
        }}>
            {/* Logo */}
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      14,
                fontWeight:    600,
                letterSpacing: '0.2em',
                color:         '#FFF',
                marginRight:   8,
            }}>
                RCAS
            </div>

            {/* 连接状态 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                    width:        7,
                    height:       7,
                    borderRadius: '50%',
                    background:   connected ? COLOR.pvw : COLOR.pgm,
                    boxShadow:    connected ? `0 0 6px ${COLOR.pvw}` : `0 0 6px ${COLOR.pgm}`,
                }}/>
                <span style={{ color: '#FFF', fontSize: 14 }}>
                    {connected ? 'CONNECTED' : 'OFFLINE'}
                </span>
            </div>

            {/* Tricaster 连接状态 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                    width:        7,
                    height:       7,
                    borderRadius: '50%',
                    background:   tricasterStatus === 'CONNECTED' ? COLOR.pvw
                                : tricasterStatus === 'CONNECTING' ? COLOR.next
                                : COLOR.pgm,
                    boxShadow:    tricasterStatus === 'CONNECTED' ? `0 0 6px ${COLOR.pvw}`
                                : tricasterStatus === 'CONNECTING' ? `0 0 6px ${COLOR.next}`
                                : `0 0 6px ${COLOR.pgm}`,
                    animation:    tricasterStatus === 'CONNECTING' ? 'pulse 1s infinite' : 'none',
                }}/>
                <span style={{ color: '#FFF', fontSize: 14 }}>TC</span>
            </div>

            {/* 分隔 */}
            <div style={{ width: 1, height: 20, background: COLOR.border }}/>

            {/* Rundown 名称 */}
            <div style={{
                flex:         1,
                fontSize:     14,
                fontWeight:   600,
                color:        rundownName ? COLOR.text : COLOR.textDim,
                overflow:     'hidden',
                whiteSpace:   'nowrap',
                textOverflow: 'ellipsis',
            }}>
                {rundownName ?? '— 未选择节目单 —'}
            </div>

            {/* RUN 按钮 */}
            {hasRundown && (
                <button
                    onClick={onRun}
                    style={{
                        fontFamily:    '"JetBrains Mono", monospace',
                        fontSize:      12,
                        fontWeight:    700,
                        letterSpacing: '0.1em',
                        color:         isRunning ? '#FFFFFF' : COLOR.text,
                        background:    isRunning ? COLOR.pgm : 'transparent',
                        border:        `1px solid ${isRunning ? COLOR.pgm : COLOR.pvw}`,
                        padding:       '3px 10px',
                        borderRadius:  2,
                        cursor:        'pointer',
                    }}
                >
                    {isRunning ? '■ STOP' : '▶ RUN'}
                </button>
            )}

            {/* RUNDOWN 菜单按钮 */}
            <button
                onClick={onOpenRundown}
                style={{
                    fontFamily:    '"JetBrains Mono", monospace',
                    fontSize:      12,
                    fontWeight:    700,
                    letterSpacing: '0.1em',
                    color:         COLOR.text,
                    background:    'transparent',
                    border:        `1px solid ${COLOR.border}`,
                    padding:       '3px 10px',
                    borderRadius:  2,
                    cursor:        'pointer',
                }}
            >
                RUNDOWN ▾
            </button>

            <button
                onClick={onOpenConfig}
                style={{
                    fontFamily:    '"JetBrains Mono", monospace',
                    fontSize:      14,
                    color:         COLOR.textDim,
                    background:    'transparent',
                    border:        `1px solid ${COLOR.border}`,
                    padding:       '3px 8px',
                    borderRadius:  2,
                    cursor:        'pointer',
                    lineHeight:    1,
                }}
            >
                ⚙
            </button>

            {/* ENGINE 状态 */}
            <div style={{
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      12,
                fontWeight:    700,
                letterSpacing: '0.1em',
                color:         engineColor,
                background:    engineColor + '15',
                border:        `1px solid ${engineColor}40`,
                padding:       '3px 8px',
                borderRadius:  2,
            }}>
                ENGINE {engineState}
            </div>
        </div>
    )
}