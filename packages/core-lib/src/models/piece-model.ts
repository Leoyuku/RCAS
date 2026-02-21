/**
 * @file piece-model.ts
 * @description 定义“素材原子”——Piece。
 * Piece 是构成 Part 的最小单位，它代表了一个具体的媒体意图。
 * 例如：一个视频文件、一条字幕、一个灯光指令、一个特定的音频推子位置。
 */

import { PartId, PieceId, DeviceType } from './enums';

export interface PieceEnable {
    start: number; // 毫秒，相对于 Part 开始的时间 (0 表示随 Part 一起开始)
    duration?: number; // 持续时间。如果未定义，通常持续到 Part 结束或被覆盖
}

export interface IPiece {
    /** 内部唯一 ID */
    _id: PieceId;

    /** 外部 ID (来自 MOS 的 ItemID 或 ObjectID) */
    externalId: string;

    /** 所属的 Part ID */
    partId: PartId;

    /** 显示名称 (例如 "Headlines Video") */
    name: string;

    /** 
     * 启用时间逻辑 
     * 决定了这个 Piece 在 Part 内部何时生效
     */
    enable: PieceEnable;

    /**
     * 源层 (Source Layer) ID
     * 决定了它在 UI 上的哪一行显示 (例如: "vtr", "graphics", "camera")
     */
    sourceLayerId: string;

    /**
     * 输出层 (Output Layer) ID
     * 决定了它最终输出到哪个逻辑通道 (例如: "pgm", "monitor")
     * TSR 用这个来解决图层冲突
     */
    outputLayerId: string;

    /**
     * 核心内容 (Content)
     * 这里的结构取决于 Blueprint 的定义，通常包含文件名、路径、模板数据等。
     * 它将被 Blueprint 转化为最终的 TimelineObject。
     */
    content: {
        timelineObjects: any[]; // 预生成的 TimelineObjects (可选，取决于架构策略)
        [key: string]: any;     // 其他元数据
    };

    /**
     * 预期持续时间 (用于 UI 显示)
     * 不同于 enable.duration，这可能是文件的实际长度
     */
    expectedDuration?: number;

    /** 是否是虚拟/占位元素 (例如由 AdLib 插入) */
    virtual?: boolean;
}
