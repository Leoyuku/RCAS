/**
 * 设备驱动接口
 *
 * 三条原则：
 * 1. PlayoutController 只依赖这里的接口，不依赖任何具体驱动类
 * 2. 接口方法全部使用逻辑语言（switchToInput、dskOn），不使用设备专有命令
 * 3. 能力守卫（capability guard）在驱动实现内部处理，调用方不需要判断
 */

import type {
    SwitcherCapabilities,
    VideoServerCapabilities,
    GraphicsEngineCapabilities,
} from './device-capabilities'

import type {
    DeviceConfig,
    DeviceStatus,
    TallyState,
    ClipInfo,
} from './device-config'

// ─── 基础接口（所有设备共用）────────────────────────────────────────────────────

export interface IBaseDriver {
    readonly config: DeviceConfig
    connect(): Promise<void>
    disconnect(): Promise<void>
    getStatus(): Promise<DeviceStatus>
}

// ─── 切换台接口 ───────────────────────────────────────────────────────────────

export interface ISwitcherDriver extends IBaseDriver {
    readonly capabilities: SwitcherCapabilities

    // — 视频切换 —
    // inputId 来自 device-config.json sources[x].programSrc，由 PlayoutController 传入
    switchToInput(inputId: string): Promise<void>
    take(): Promise<void>   // 执行硬切
    auto(): Promise<void>   // 执行自动转场
    cut(): Promise<void>   // 执行直切

    // — DDR（仅 canReceiveDDR = true 时有意义）—
    // ddr 参数来自 device-config.json ddrMapping，由 PlayoutController 传入
    //loadClip(clipId: string, ddr: string): Promise<void>
    //playDDR(ddr: string): Promise<void>
    //stopDDR(ddr: string): Promise<void>
    // — 预监切换 —
    setPreview(sourceId: string): Promise<void>
    setPgm(sourceId: string): Promise<void>

    // — DSK（仅 dsk = true 时有意义）—
    // layer 参数来自 device-config.json dskMapping[pieceType]，由 PlayoutController 传入
    dskOn(layer: number): Promise<void>
    dskOff(layer: number): Promise<void>
    dskAuto(layer: number): Promise<void>

    // — 实时预览帧（仅 livePreview = true 时有意义）—
    getPreviewFrame(source: string): Promise<Buffer>
    subscribePreviewFrame(source: string, cb: (frame: Buffer) => void): void
    unsubscribePreviewFrame(source: string): void

    // — Tally（仅 tally = true 时有意义）—
    getTally(): Promise<TallyState>
    subscribeTally(cb: (t: TallyState) => void): void

    // — DataLink（仅 datalink = true 时有意义）—
    // key/value 由上层根据 IPiece 内容填充，驱动只负责发送
    pushDataLink(key: string, value: string): Promise<void>
}

// ─── 视频服务器接口 ────────────────────────────────────────────────────────────

export interface IVideoServerDriver extends IBaseDriver {
    readonly capabilities: VideoServerCapabilities

    // — 预加载（CUE）—
    cue(clipId: string, channel: string): Promise<void>

    // — 播放控制 —
    play(channel: string): Promise<void>
    stop(channel: string): Promise<void>
    pause(channel: string): Promise<void>

    // — 素材信息 —
    getClipInfo(clipId: string): Promise<ClipInfo>

    // — 推送到切换台 DDR（仅 canPushToDDR = true 时有意义）—
    //pushToDDR?(clipId: string, ddr: string): Promise<void>
    pushToDDR?(clipId: string, ddr: string): Promise<void>
    selectFile?(clipId: string, channel: string): Promise<void>
    loadClip?(clipId: string, ddr: string): Promise<void>
    playDDR?(ddr: string): Promise<void>
    stopDDR?(ddr: string): Promise<void>
}

// ─── 图形引擎接口 ─────────────────────────────────────────────────────────────

export interface IGraphicsDriver extends IBaseDriver {
    readonly capabilities: GraphicsEngineCapabilities

    // DataLink 文字填充（阶段二：VIZ 接管字幕内容注入）
    fillDataLink(key: string, value: string): Promise<void>

    // DSK 开关（图形引擎直接控制切换台 DSK 通道）
    dskOn(layer: number): Promise<void>
    dskOff(layer: number): Promise<void>
}