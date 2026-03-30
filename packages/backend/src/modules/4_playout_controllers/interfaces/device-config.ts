/**
 * 设备配置类型
 *
 * 这些类型直接映射 device-config.json 的结构。
 * 持久化层（磁盘）和运行时层（内存）都基于这套类型。
 */

import type {
    SwitcherCapabilities,
    VideoServerCapabilities,
    GraphicsEngineCapabilities,
} from './device-capabilities'

// ─── 基础类型 ──────────────────────────────────────────────────────────────────

export type DeviceRole = 'switcher' | 'video-server' | 'graphics'

export type DeviceType =
    | 'tricaster'
    | 'atem'
    | 'vmix'
    | 'bitcentral-precis'
    | 'newscaster'
    | 'viz-engine'

export type DeviceStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface ConnectionConfig {
    host: string
    port: number
}

// ─── 设备配置（按角色区分）─────────────────────────────────────────────────────

export interface SwitcherConfig {
    type: DeviceType
    role: 'switcher'
    label: string
    capabilities: SwitcherCapabilities
    connection: ConnectionConfig
}

export interface VideoServerConfig {
    type: DeviceType
    role: 'video-server'
    label: string
    capabilities: VideoServerCapabilities
    connection: ConnectionConfig
    protocol?: 'vdcp' | 'ftp' | 'proprietary'
    // key = 逻辑通道名（'A'/'B'），value = 该通道的物理映射
    channels?: Record<string, VideoServerChannel>
}

export interface VideoServerChannel {
    vdcpUnit?: number  // VDCP Unit Address（0, 1, ...）
    tricasterInput?: string  // 对应切换台的物理输入口 ID（从 sources 读）
}

export interface GraphicsConfig {
    type: DeviceType
    role: 'graphics'
    label: string
    capabilities: GraphicsEngineCapabilities
    connection: ConnectionConfig
    enabled: boolean
}

export type DeviceConfig = SwitcherConfig | VideoServerConfig | GraphicsConfig

// ─── 源（Source）配置 ────────────────────────────────────────────────────────────
// 逻辑源：PlayoutController 只操作逻辑源 ID，不直接写物理口

export type SourceType = 'camera' | 'vt' | 'me' | 'graphics' | 'remote' | 'other'

export interface SourceConfig {
    id: string
    label: string
    type: SourceType
    previewSrc?: string      // camera/vt 类有；me 类没有，改为可选
    switcherName?: string    // shortcut value 用；me 类没有，改为可选
    meIndex?: number         // me 类专用
}

// ─── DSK 映射 ─────────────────────────────────────────────────────────────────

export interface DskMapping {
    [pieceType: string]: number  // 'L3RD' → 1, 'BUG' → 2, ...
}

// ─── L3RD 时序配置 ────────────────────────────────────────────────────────────

export interface L3rdConfig {
    delayIn: number  // TAKE 后多少 ms 开 DSK（毫秒）
    duration: number  // DSK 开启持续多少 ms 后关闭（毫秒）
}

// ─── 完整配置文件结构（对应 device-config.json）────────────────────────────────

export interface DeviceConfigFile {
    // 当前激活的设备 ID（指向 devices 里的 key）
    activeDevices: {
        switcher?: string
        videoServer?: string
        vizEngine?: string
    }

    // 所有已配置的设备
    devices: Record<string, DeviceConfig>

    // 逻辑源映射表
    sources: Record<string, SourceConfig>

    // 按 PartType 的默认逻辑源映射
    // 当 MOS 数据里没有显式机位信息时使用
    // 联调后如果 MOS 数据能提供 sourceId，此字段降为兜底
    defaultSources: {
        kam?:     string   // KAM 类型默认源，通常是 'CAM1'
        server?:  string   // SERVER 类型默认源，通常是 'VT_A'
        vo?:      string   // VO 类型默认源，通常是 'VT_A'
        live?:    string   // LIVE 类型默认源，通常是 'CAM1'
    }

    // DSK 层分配
    dskMapping: DskMapping

    // L3RD 时序参数
    l3rd: L3rdConfig

    // 预设方案（预留）
    presets: Record<string, unknown>
}

// ─── 运行时状态 ───────────────────────────────────────────────────────────────

export interface TallyState {
    program: string[]  // 正在 program 的物理输入口 ID 列表
    preview: string[]  // 正在 preview 的物理输入口 ID 列表
}

export interface ClipInfo {
    clipId: string
    title: string
    duration: number   // 毫秒
    proxyUrl?: string
}