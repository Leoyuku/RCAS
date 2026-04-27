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
 *   IMOSItem.MosObjects[0] → IPiece（媒体文件元数据）
 *
 * Blueprint 类型映射（基于真实 Octopus octext_elemType 字段，2026-04-09 确认）：
 *   studio      → KAM    演播室口播，duration=0（手动切走）
 *   video       → SERVER 新闻包视频
 *   vo          → VO     画外音配合视频
 *   legacyvideo → SERVER 旧系统 VT 素材
 *   jingle      → SERVER 片头/片尾/音效
 *   null / 其他 → UNKNOWN
 *
 * 时长计算：
 *   item.EditorialDuration 为帧数，需除以 TimeBase 换算毫秒
 *   STUDIO 类固定 duration=0（无限等待，手动 TAKE）
 */

import { getMosTypes } from '../1_mos_connection/internals/mosTypes';
import { IMOSRunningOrder, IMOSROStory, IMOSItem } from '../1_mos_connection/internals/model';
import { IRundown }  from '../../../../core-lib/src/models/rundown-model';
import { ISegment }  from '../../../../core-lib/src/models/segment-model';
import { IPart }     from '../../../../core-lib/src/models/part-model';
import { IPiece }    from '../../../../core-lib/src/models/piece-model';
import { PlaylistStatus, PartType } from '../../../../core-lib/src/models/enums';

const mosTypes = getMosTypes(false);

// ─── 工具：提取 octext_elemType ───────────────────────────────────────────────

function getElemType(item: IMOSItem): string {
    return ((item as any).octext_elemType ?? '').toLowerCase()
}

// ─── Blueprint：elemType → PartType ──────────────────────────────────────────

/**
 * 根据 Octopus octext_elemType 字段映射 PartType。
 * 优先使用 octext_elemType（最准确），兜底用 MOSID + ObjectID 推断。
 *
 * 基于 2026-04-09 真实 Octopus XML 数据确认。
 */
export function mapElemTypeToPartType(
    elemType: string | null | undefined,
    objectId: string | null | undefined,
    mosId: string | null | undefined
): PartType {
    if (elemType) {
        const t = elemType.toLowerCase()
        if (t === 'studio')      return PartType.KAM
        if (t === 'video')       return PartType.SERVER
        if (t === 'vo')          return PartType.VO
        if (t === 'legacyvideo') return PartType.SERVER
        if (t === 'jingle')      return PartType.SERVER
    }
    // 兜底：有 Bitcentral objId 但无 elemType → SERVER
    if (objectId && mosId === 'precis1.ny2.ntd.mos') return PartType.SERVER
    return PartType.UNKNOWN
}

// ─── Blueprint：时长计算 ──────────────────────────────────────────────────────

/**
 * 从 IMOSItem 计算播出时长（毫秒）。
 *
 * 优先级：
 *   1. UserTimingDuration / TimeBase
 *   2. EditorialDuration / TimeBase
 *   3. Duration / TimeBase
 *
 * STUDIO 类型固定返回 0（演播室口播无固定时长，必须手动 TAKE）。
 */
function calcDuration(item: IMOSItem): number {
    // studio 类型固定 0
    if (getElemType(item) === 'studio') return 0

    if (item.UserTimingDuration && item.UserTimingDuration > 0 &&
        item.TimeBase && item.TimeBase > 0) {
        return Math.round((item.UserTimingDuration / item.TimeBase) * 1000)
    }

    if (item.EditorialDuration && item.EditorialDuration > 0 &&
        item.TimeBase && item.TimeBase > 0) {
        return Math.round((item.EditorialDuration / item.TimeBase) * 1000)
    }

    if (item.Duration && item.TimeBase && item.TimeBase > 0) {
        return Math.round((item.Duration / item.TimeBase) * 1000)
    }

    return 0
}

// ─── 主转换函数 ───────────────────────────────────────────────────────────────

export function mosRunningOrderToRundown(ro: IMOSRunningOrder): IRundown {
    const externalId = mosTypes.mosString128.stringify(ro.ID)
    const segments   = ro.Stories.map((story, idx) => storyToSegment(story, externalId, idx))

    return {
        _id:               externalId as any,
        externalId,
        name:              mosTypes.mosString128.stringify(ro.Slug),
        expectedStart: ro.EditorialStart ? ro.EditorialStart._mosTime : undefined,
        editorialDuration: ro.EditorialDuration ? ro.EditorialDuration._mosDuration * 1000 : undefined,
        status:            PlaylistStatus.UNKNOWN,
        currentPartId:     null,
        nextPartId:        null,
        modified:          Date.now(),
        segments,
    }
}

// ─── Story → Segment ─────────────────────────────────────────────────────────

function storyToSegment(story: IMOSROStory, rundownId: string, rank: number): ISegment {
    const externalId = mosTypes.mosString128.stringify(story.ID)
    const storySlug  = story.Slug ? mosTypes.mosString128.stringify(story.Slug) : null
    const storyNum   = story.Number ? mosTypes.mosString128.stringify(story.Number) : null
    const parts      = story.Items
        .map((item, idx) => itemToPart(item, externalId, idx, storySlug))
        .filter(part => part.type !== PartType.UNKNOWN)

    // ── 时长换算 ──────────────────────────────────────────────────────────────
    // octext_storyTotalDur / octext_storyPlanDur 单位是帧数
    // TimeBase 从第一个有 TimeBase 的 item 继承，兜底使用 59.94fps
    // 优先用 Octopus story 级时长字段
    const rawTotal = (story as any).octext_storyTotalDur
    const rawPlan  = (story as any).octext_storyPlanDur
    const inferredTimeBase = story.Items.find(i => i.TimeBase && i.TimeBase > 0)?.TimeBase ?? 59.94

    const expectedDuration = (rawTotal && rawTotal > 0)
    ? Math.round((rawTotal / inferredTimeBase) * 1000)
    : (rawPlan && rawPlan > 0)
        ? Math.round((rawPlan / inferredTimeBase) * 1000)
        : story.Items.reduce((acc, item) => {
            if (!item.EditorialDuration || item.EditorialDuration <= 0) return acc
            const tb = (item.TimeBase && item.TimeBase > 0) ? item.TimeBase : inferredTimeBase
            return acc + Math.round((item.EditorialDuration / tb) * 1000)
        }, 0) || undefined

    const planDuration = (rawPlan && rawPlan > 0)
        ? Math.round((rawPlan / inferredTimeBase) * 1000)
        : undefined

    return {
        _id:        externalId as any,
        externalId,
        rundownId,
        rank,
        name:       storySlug ?? externalId,
        storyNum,
        expectedDuration,
        planDuration,
        parts,
    }
}

// ─── Item → Part ─────────────────────────────────────────────────────────────

function itemToPart(item: IMOSItem, segmentId: string, rank: number, storySlug: string | null): IPart {
    const itemId     = mosTypes.mosString128.stringify(item.ID)
    const externalId = `${segmentId}_${itemId}`   // ← 组合确保全局唯一
    const mosId      = item.MOSID ?? null
    const objId      = item.ObjectID ? mosTypes.mosString128.stringify(item.ObjectID) : null

    const partType = mapElemTypeToPartType(
        getElemType(item) || null,
        objId,
        mosId
    )
    const duration = calcDuration(item)
    const pieces   = buildPieces(item, externalId)
    const sourceId = item.camSourceId ?? null  // studio 类型从主播词解析，其余为 null


    return {
        _id:              externalId as any,
        externalId,
        segmentId,
        rank,
        title:            storySlug ?? externalId,
        expectedDuration: duration,
        autoNext:         false,
        autoNextOverlap:  0,
        sourceId,
        type:             partType,
        pieces,
    }
}

// ─── MosObjects → Pieces ─────────────────────────────────────────────────────

function buildPieces(item: IMOSItem, partId: string): IPiece[] {
    const pieces: IPiece[] = []
    const elemType = getElemType(item)
    const mosId    = item.MOSID ?? ''
    const objId    = item.ObjectID ? mosTypes.mosString128.stringify(item.ObjectID) : undefined

    // studio 类无媒体文件，不生成 Piece
    if (elemType === 'studio') return pieces
    // objectId 和 mosId 都为空 → 广告占位或空 item，不生成 Piece
    if (!objId && !mosId) return pieces

    // ── Profile 4：MosObjects 有完整数据 ─────────────────────────────────────
    if (item.MosObjects && item.MosObjects.length > 0) {
        item.MosObjects.forEach((mosObj, idx) => {
            const objIdStr = mosObj.ID
                ? mosTypes.mosString128.stringify(mosObj.ID)
                : (objId ?? `${partId}_piece_${idx}`)

            const pieceDuration = (mosObj.Duration && mosObj.TimeBase && mosObj.TimeBase > 0)
                ? Math.round((mosObj.Duration / mosObj.TimeBase) * 1000)
                : undefined

            const filePath      = mosObj.Paths?.find(p => p.Type === 'PATH')?.Target         ?? null
            const proxyPath     = mosObj.Paths?.find(p => p.Type === 'PROXY PATH')?.Target   ?? null
            const thumbnailPath = mosObj.Paths?.find(p => p.Type === 'METADATA PATH')?.Target ?? null

            const extMeta         = mosObj.MosExternalMetaData ?? []
            const playlistPayload = extMeta.find(m => m.MosScope === 'PLAYLIST')?.MosPayload ?? null
            const objectPayload   = extMeta.find(m => m.MosScope === 'OBJECT')?.MosPayload   ?? null

            pieces.push({
                _id:           `${partId}_piece_${idx}` as any,
                externalId:    objIdStr,
                partId:        partId as any,
                name:          mosTypes.mosString128.stringify(mosObj.Slug),
                enable:        { start: 0, duration: pieceDuration },
                sourceLayerId: idx === 0 ? resolveSourceLayer(elemType) : 'video',
                outputLayerId: 'pgm',
                content: {
                    timelineObjects: [],
                    sourceId:        null,
                    airStatus:       mosObj.AirStatus ?? null,
                    objStatus:       mosObj.Status    ?? null,
                    filePath,
                    proxyPath,
                    thumbnailPath,
                    playlistPayload,
                    objectPayload,
                    mosId,
                    objId: objIdStr,
                },
            })
        })
        return pieces
    }

    // ── Profile 2 兜底：只有基础字段 ─────────────────────────────────────────
    const itemPaths     = item.Paths ?? []
    const filePath      = itemPaths.find(p => p.Type === 'PATH')?.Target          ?? null
    const proxyPath     = itemPaths.find(p => p.Type === 'PROXY PATH')?.Target    ?? null
    // techDescription="JPG" 的 objProxyPath 被映射到 METADATA_PATH（见 xmlConversion.ts）
    const thumbnailPath = itemPaths.find(p => p.Type === 'METADATA PATH')?.Target ?? null

    const itemExtMeta   = item.MosExternalMetaData ?? []
    const itemPlPayload = itemExtMeta.find(m => m.MosScope === 'PLAYLIST')?.MosPayload ?? null

    pieces.push({
        _id:           `${partId}_piece_0` as any,
        externalId:    objId ?? `${partId}_piece_0`,
        partId:        partId as any,
        name:          mosId,
        enable:        { start: 0 },
        sourceLayerId: resolveSourceLayer(elemType),
        outputLayerId: 'pgm',
        content: {
            timelineObjects: [],
            sourceId:        null,
            airStatus:       null,
            objStatus:       null,
            filePath,
            proxyPath,
            thumbnailPath,
            playlistPayload: itemPlPayload,
            objectPayload:   null,
            mosId,
            objId,
        },
    })

    return pieces
}

// ─── sourceLayer 映射 ─────────────────────────────────────────────────────────

/**
 * 根据 octext_elemType 决定 Piece 的 sourceLayerId。
 * sourceLayerId 决定 UI 上的标签颜色和设备路由。
 */
function resolveSourceLayer(elemType: string): string {
    if (elemType === 'jingle')      return 'jingle'
    if (elemType === 'legacyvideo') return 'vt'
    if (elemType === 'vo')          return 'vo'
    if (elemType === 'video')       return 'video'
    if (elemType === 'studio')      return 'studio'
    return 'video'
}