/**
 * @file enums.ts
 * @description 系统通用的枚举和基础类型定义
 */

// --- 核心 ID 类型别名 (为了代码语义清晰) ---
export type RundownId = string;
export type SegmentId = string;
export type PartId = string;
export type PieceId = string;
export type TimelineObjId = string;

// --- 基础枚举 ---

/**
 * 设备类型 (用于 Timeline 和 Blueprint)
 * 对应底层 TSR (Timeline State Resolver) 支持的设备
 */
export enum DeviceType {
    ABSTRACT = 0, // 抽象设备 (用于逻辑控制)
    CASPARCG = 1, // CasparCG 图文/视频服务器
    ATEM = 2,     // Blackmagic ATEM 切换台
    OBS = 3,      // OBS Studio
    HTTP = 4,     // HTTP 请求发送器
    SISYFOS = 5,  // Sisyfos 音频混音器 (或者其它音频设备)
    VMIX = 6,     // vMix
    OSC = 7,      // Open Sound Control
}

/**
 * 节目片段类型 (用于 UI 显示和逻辑分组)
 * 这决定了 Part 在时间线上的视觉样式
 */
export enum PartType {
    UNKNOWN = 'unknown',
    KAM = 'kam',       // 摄像机/口播
    SERVER = 'server', // 视频片段
    VO = 'vo',         // 配音/画外音
    LIVE = 'live',     // 现场连线
    GRAPHICS = 'graphics', // 全屏图文
    REMOTE = 'remote', // 远程信号
}

/**
 * 播放状态
 */
export enum PlaylistStatus {
    UNKNOWN = 0,
    ACTIVE = 1, // 激活 (On Air)
    REHEARSAL = 2, // 排练模式 (不输出到主 PGM)
}
