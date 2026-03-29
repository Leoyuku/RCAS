/**
 * 设备能力声明
 *
 * 这是硬件抽象的基础。PlayoutController 的所有决策只读这里，
 * 不读设备品牌，不读型号，不读 IP。
 */

export interface SwitcherCapabilities {
    canReceiveDDR: boolean  // 有 DDR 通道，可以接受本地加载的素材播放
    canReceiveInput: boolean  // 可以切换外部输入源（摄像机、视频服务器输出）
    livePreview: boolean  // 能输出实时预览帧（用于前端缩略图）
    tally: boolean  // 能上报 Tally 灯状态
    datalink: boolean  // 支持 DataLink 文字填充（字幕数据注入）
    dsk: boolean  // 有 DSK 叠加层
    dskLayers: number   // DSK 层数（0 = 无）
}

export interface VideoServerCapabilities {
    canPlayVideo: boolean  // 自己有播出通道，能直接控制播放（如 Bitcentral Precis）
    canStoreVideo: boolean  // 能存储素材
    canPushToDDR: boolean  // 能把素材推送到切换台 DDR（如 Newscaster）
}

export interface GraphicsEngineCapabilities {
    canFillDataLink: boolean  // 能填充 DataLink 文字（字幕内容注入）
    canControlDSK: boolean  // 能直接控制切换台 DSK 通道开关
}