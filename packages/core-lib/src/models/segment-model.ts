/**
 * @file segment-model.ts
 * @description 定义“节目段落”——Segment。
 * 对应 MOS 协议中的 Story。它是一组逻辑相关的 Part 的集合。
 * 例如：一条完整的“晚间新闻”可能是一个 Segment，包含“主播口播(Part1)”和“新闻视频(Part2)”。
 */

import { SegmentId, RundownId } from './enums';
import { IPart } from './part-model';

export interface ISegment {
    /** 内部唯一 ID */
    _id: SegmentId;

    /** 外部 ID (来自 MOS 的 StoryID) */
    externalId: string;

    /** 所属的 Rundown ID */
    rundownId: RundownId;

    /** 段落名称 (例如 "国际新闻") */
    name: string;

    /** 
     * 排序权重 
     */
    rank: number;

    /**
     * 页码/稿件编号（来自 MOS storyNum）
     * 导播用于快速定位稿件，显示在行号区域
     */
    storyNum?: string | null;

    /**
     * 故事预计总时长（毫秒）
     * 来自 Octopus octext_storyTotalDur（帧数），由 mos-to-rundown.ts 换算
     */
    expectedDuration?: number;

    /**
     * 故事计划时长（毫秒）
     * 来自 Octopus octext_storyPlanDur（帧数），节目表排定的时长
     * 注意：很多故事此值为 0，表示无计划时长限制
     */
    planDuration?: number;

    /** 
     * 是否在 UI 上折叠显示
     */
    isHidden?: boolean;

    /**
     * 包含的 Parts
     */
    parts?: IPart[];
    
    /** 元数据 (保留字段) */
    metaData?: any;
}
