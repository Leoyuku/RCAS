/**
 * @file part-model.ts
 * @description 定义“播出单元”——Part。
 * Part 是自动化系统控制光标移动的最小单位（对应 MOS 中的 Item 或 Story 的一部分）。
 * 点击 "TAKE" 按钮，通常就是切换到下一个 Part。
 */

import { PartId, SegmentId, PartType } from './enums';
import { IPiece } from './piece-model';

export interface IPart {
    /** 内部唯一 ID */
    _id: PartId;

    /** 外部 ID (来自 MOS 的 StoryID) */
    externalId: string;

    /** 所属的 Segment ID */
    segmentId: SegmentId;

    /** 标题 (例如 "主持人开场") */
    title: string;

    /** 
     * 排序权重 
     * 越小越靠前
     */
    rank: number;

    /** 
     * 预期持续时间 (毫秒)
     * 用于倒计时显示。如果是 0，表示这是一个如果不手动切走就会一直停着的 Part。
     */
    expectedDuration: number;

    /**
     * 自动跳转 (Auto Next)
     * 如果为 true，当前 Part 播放完 expectedDuration 后，会自动 TAKE 到下一个 Part。
     */
    autoNext: boolean;

    /**
     * 自动跳转重叠时间 (Overlap)
     * 用于实现 J-Cut / L-Cut。
     */
    autoNextOverlap: number;

    /**
     * Part 类型 (用于 UI 着色和逻辑判断)
     */
    type: PartType;

    /**
     * 播出源 ID（对应 device-config.json 里的 source key）
     * studio 类型：从主播词 <<CAM X>> 解析，如 'CAM1'、'CAM2'
     * 其他类型：null（由 _resolvePartIntent() 决定）
     */
    sourceId?: string | null;

    /**
     * 包含的 Pieces (在运行时可能会被 populate，或者单独查询)
     * 在数据库存储模型中，这通常是分离的；但在内存模型中可能包含。
     */
    pieces?: IPiece[];

    /** 是否无效/被禁用 (例如 MOS 标记为不播出) */
    invalid?: boolean;
}
