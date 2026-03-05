/**
 * @fileoverview mos-to-rundown.ts — MOS 协议对象 → RCAS 业务对象
 *
 * 设计原则：
 * - 纯函数，无状态，无副作用
 * - 不依赖任何全局单例
 * - 极易单元测试：输入 IMOSRunningOrder，输出 IRundown
 *
 * 映射关系：
 *   IMOSRunningOrder  →  IRundown
 *   IMOSROStory       →  ISegment  （一条稿件 = 一个播出段落）
 *   IMOSItem          →  IPart     （一个媒体项 = 一个播出单元）
 *   IPiece            →  暂不生成，等 4_playout_controllers 需要时补充
 */

import { getMosTypes } from '../1_mos_connection/internals/mosTypes';
import { IMOSRunningOrder, IMOSROStory, IMOSItem } from '../1_mos_connection/internals/model';
import { IRundown }  from '../../../../core-lib/src/models/rundown-model';
import { ISegment }  from '../../../../core-lib/src/models/segment-model';
import { IPart }     from '../../../../core-lib/src/models/part-model';
import { PlaylistStatus, PartType } from '../../../../core-lib/src/models/enums';

const mosTypes = getMosTypes(false);

// ─── 主转换函数 ───────────────────────────────────────────────────────────────

/**
 * 将 MOS 协议原始对象转换为 RCAS 内部业务对象。
 * 纯函数：相同输入永远产生相同输出。
 */
export function mosRunningOrderToRundown(ro: IMOSRunningOrder): IRundown {
    const externalId = mosTypes.mosString128.stringify(ro.ID);
    const segments   = ro.Stories.map((story, idx) => storyToSegment(story, externalId, idx));

    return {
        _id:              externalId as any,
        externalId,
        name:             mosTypes.mosString128.stringify(ro.Slug),
        expectedStart:    ro.EditorialStart    ? Number(ro.EditorialStart)    : undefined,
        expectedDuration: ro.EditorialDuration ? Number(ro.EditorialDuration) : undefined,
        status:           PlaylistStatus.UNKNOWN,
        currentPartId:    null,
        nextPartId:       null,
        modified:         Date.now(),
        segments,
    };
}

// ─── Story → Segment ─────────────────────────────────────────────────────────

function storyToSegment(story: IMOSROStory, rundownId: string, rank: number): ISegment {
    const externalId = mosTypes.mosString128.stringify(story.ID);
    const parts      = story.Items.map((item, idx) => itemToPart(item, externalId, idx));

    return {
        _id:        externalId as any,
        externalId,
        rundownId,
        rank,
        name:       story.Slug ? mosTypes.mosString128.stringify(story.Slug) : externalId,
        parts,
    };
}

// ─── Item → Part ─────────────────────────────────────────────────────────────

function itemToPart(item: IMOSItem, segmentId: string, rank: number): IPart {
    const externalId = mosTypes.mosString128.stringify(item.ID);

    return {
        _id:              externalId as any,
        externalId,
        segmentId,
        rank,
        title:            item.Slug ? mosTypes.mosString128.stringify(item.Slug) : externalId,
        expectedDuration: 0,
        autoNext:         false,
        autoNextOverlap:  0,
        type:             PartType.UNKNOWN,
        pieces:           [],
    };
}