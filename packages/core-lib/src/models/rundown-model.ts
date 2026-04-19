/**
 * @file rundown-model.ts
 * @description 定义最顶层的“节目”——Rundown。
 * 对应 MOS 协议中的 Running Order (RO)。
 */

import { RundownId, PlaylistStatus, SegmentId, PartId } from './enums';
import { ISegment } from './segment-model';

export interface IRundown {
    /** 内部唯一 ID */
    _id: RundownId;

    /** 外部 ID (来自 NCS 的 RO ID) */
    externalId: string;

    /** 节目名称 */
    name: string;

    /** 
     * 预期的开始时间 (Unix Timestamp) 
     * 仅供参考
     */
    expectedStart?: number;

    /**
     * 预期的持续时间
     */
    expectedDuration?: number;

    /**
     * Octopus 实时推送的节目实际总时长 (Unix Timestamp, 毫秒)
     * 来自 MOS roEdDur，由 roMetadataReplace 动态更新
     * 与 plannedDuration 的差值 = rundown层面的理论偏差
     */
    editorialDuration?: number;

    /**
     * 播放列表状态 (Active / Rehearsal / Inactive)
     * 只有 Active 状态下，Playout Gateway 才会真正输出控制信号。
     */
    status: PlaylistStatus;

    /**
     * 当前正在播出的 Part ID (On Air)
     * 这是系统的核心状态指针。
     */
    currentPartId: PartId | null;

    /**
     * 下一个即将播出的 Part ID (Next)
     * 這是系统的预备状态指针。
     */
    nextPartId: PartId | null;

    /**
     * 上一次修改时间
     * 用于数据同步和缓存失效
     */
    modified: number;

    /**
     * 包含的 Segments
     */
    segments?: ISegment[];
}
