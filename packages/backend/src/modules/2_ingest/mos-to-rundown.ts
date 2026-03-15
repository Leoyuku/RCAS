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
 * Blueprint 类型映射（基于真实 Octopus mosId 字段，2026-03-14 确认）：
 *   STUDIO              → KAM    演播室口播，duration=0（手动切走）
 *   INTRO/VIDEOTEXT     → KAM    主播+字幕条
 *   INTRO/VO            → VO     主播导入+画外音
 *   INTRO/VIDEO         → SERVER 主播导入+视频
 *   VO                  → VO     纯画外音
 *   LEGACY              → SERVER 旧系统 VT 素材
 *   JINGLE              → SERVER 片头/片尾/音效
 *   VIDEO/...           → SERVER 纯视频/广告
 *   null / 其他         → UNKNOWN
 *
 * 时长计算：
 *   item.Duration（帧数）/ item.TimeBase（帧率）* 1000 = 毫秒
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

// ─── Blueprint：mosId → PartType ─────────────────────────────────────────────

/**
 * 根据 Octopus mosId 字段映射 PartType。
 * mosId 对应 MOS Item 的 MOSID 字段，即设备/类型标识符。
 *
 * 基于 2026-03-13 真实 Octopus rundown 数据确认。
 */
export function mapMosIdToPartType(mosId: string | null | undefined): PartType {
    if (!mosId) return PartType.UNKNOWN;
    const m = mosId.toUpperCase();

    if (m === 'STUDIO')             return PartType.KAM;
    if (m === 'INTRO/VIDEOTEXT')    return PartType.KAM;
    if (m === 'INTRO/VO')           return PartType.VO;
    if (m === 'INTRO/VIDEO')        return PartType.SERVER;
    if (m === 'VO')                 return PartType.VO;
    if (m === 'LEGACY')             return PartType.SERVER;
    if (m === 'JINGLE')             return PartType.SERVER;
    if (m.startsWith('VIDEO'))      return PartType.SERVER;

    // 其他 INTRO/* 变体（未来可能出现）以口播为主
    if (m.startsWith('INTRO/'))     return PartType.KAM;

    return PartType.UNKNOWN;
}

// ─── Blueprint：时长计算 ──────────────────────────────────────────────────────

/**
 * 从 IMOSItem 计算播出时长（毫秒）。
 *
 * 优先级：
 *   1. UserTimingDuration（itemUserTimingDur）— 导播界面显示用，最准确
 *   2. EditorialDuration（itemEdDur）         — 编辑时长
 *   3. Duration（objDur）/ TimeBase（objTB）  — MOS 对象帧数/帧率，兜底
 *
 * STUDIO 类型固定返回 0（演播室口播无固定时长，必须手动 TAKE）。
 *
 * 注意：MOS 规范中时长单位依赖 TimeBase。Octopus 实测
 * UserTimingDuration / EditorialDuration 为毫秒直接值，
 * 而 Duration/TimeBase 是帧数/帧率需换算。
 * 联调时如果时长不对，优先检查这里的单位假设。
 */
function calcDuration(item: IMOSItem): number {
    const mosId = item.MOSID ?? '';
    if (mosId.toUpperCase() === 'STUDIO') return 0;

    // 优先：UserTimingDuration（itemUserTimingDur）
    if (item.UserTimingDuration && item.UserTimingDuration > 0) {
        return item.UserTimingDuration;
    }

    // 次选：EditorialDuration（itemEdDur）
    if (item.EditorialDuration && item.EditorialDuration > 0) {
        return item.EditorialDuration;
    }

    // 兜底：Duration（objDur）/ TimeBase（objTB）帧数换算
    if (item.Duration && item.TimeBase && item.TimeBase > 0) {
        return Math.round((item.Duration / item.TimeBase) * 1000);
    }

    return 0;
}

// ─── Blueprint：Piece 名称 ────────────────────────────────────────────────────

/**
 * 根据 mosId 生成 Piece 的显示名称（用于 UI 胶囊标签）。
 * 提取 mosId 的后半部分作为标签，如 INTRO/VIDEOTEXT → VIDEOTEXT。
 */
function getPieceName(mosId: string): string {
    const parts = mosId.split('/');
    return parts[parts.length - 1] || mosId;
}

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
    const mosId      = item.MOSID ?? null;
    const partType   = mapMosIdToPartType(mosId);
    const duration   = calcDuration(item);

    // title: itemSlug 优先，否则用 objectSlug，否则用 externalId
    const title =
        (item.Slug       ? mosTypes.mosString128.stringify(item.Slug)       : null) ??
        (item.ObjectSlug ? mosTypes.mosString128.stringify(item.ObjectSlug) : null) ??
        externalId;

    // Pieces：从 MosObjects 生成（视频文件、音频等媒体资产）
    const pieces = buildPieces(item, externalId);

    return {
        _id:              externalId as any,
        externalId,
        segmentId,
        rank,
        title,
        expectedDuration: duration,
        autoNext:         false,
        autoNextOverlap:  0,
        type:             partType,
        pieces,
    };
}

// ─── MosObjects → Pieces ─────────────────────────────────────────────────────

/**
 * 从 IMOSItem 生成 IPiece 列表。
 *
 * 数据来源优先级：
 *   1. item.MosObjects[]（Profile 4 roStorySend 推送，含完整媒体元数据）
 *   2. item 本身的基础字段（Profile 2 roCreate，只有 objID / mosID）
 *
 * content 字段保留所有原始 MOS 数据，Tricaster 驱动层按需读取：
 *   - filePath     : 媒体文件 Windows 路径（\\server\media\clip.mov）
 *   - proxyPath    : 代理视频 HTTP URL（用于预览）
 *   - metadataPath : 元数据 XML URL
 *   - airStatus    : 就绪状态（READY / NOT READY）
 *   - mediaInfo    : 编解码信息（来自 mosExternalMetadata mosPayload）
 *   - mosPayload   : mosExternalMetadata 的完整原始 payload（不解析，原样保留）
 */
function buildPieces(item: IMOSItem, partId: string): IPiece[] {
    const pieces: IPiece[] = [];
    const mosId = item.MOSID ?? '';

    // STUDIO 类无媒体文件，不生成 Piece
    if (!mosId || mosId.toUpperCase() === 'STUDIO') return pieces;

    const objId = item.ObjectID
        ? mosTypes.mosString128.stringify(item.ObjectID)
        : undefined;

    // ── Profile 4：MosObjects 有完整数据 ─────────────────────────────────────
    if (item.MosObjects && item.MosObjects.length > 0) {
        item.MosObjects.forEach((mosObj, idx) => {
            const objIdStr = mosObj.ID
                ? mosTypes.mosString128.stringify(mosObj.ID)
                : (objId ?? `${partId}_piece_${idx}`);

            const pieceDuration = (mosObj.Duration && mosObj.TimeBase && mosObj.TimeBase > 0)
                ? Math.round((mosObj.Duration / mosObj.TimeBase) * 1000)
                : undefined;

            // 从 Paths 分类提取路径
            const filePath      = mosObj.Paths?.find(p => p.Type === 'PATH')?.Target ?? null;
            const proxyPath     = mosObj.Paths?.find(p => p.Type === 'PROXY PATH')?.Target ?? null;
            const metadataPath  = mosObj.Paths?.find(p => p.Type === 'METADATA PATH')?.Target ?? null;

            // 从 MosExternalMetaData 提取 mosPayload（原样保留，不解析）
            // 包含：mediaType、source（文件路径）、owner、found、version、metaData（编解码）
            const extMeta = mosObj.MosExternalMetaData ?? [];
            const playlistPayload = extMeta.find(m => m.MosScope === 'PLAYLIST')?.MosPayload ?? null;
            const objectPayload   = extMeta.find(m => m.MosScope === 'OBJECT')?.MosPayload   ?? null;

            pieces.push({
                _id:           `${partId}_piece_${idx}` as any,
                externalId:    objIdStr,
                partId:        partId as any,
                name:          mosTypes.mosString128.stringify(mosObj.Slug),
                enable:        { start: 0, duration: pieceDuration },
                sourceLayerId: idx === 0 ? resolveSourceLayer(mosId) : 'video',
                outputLayerId: 'pgm',
                content: {
                    timelineObjects: [],
                    // 就绪状态
                    airStatus:    mosObj.AirStatus   ?? null,
                    objStatus:    mosObj.Status       ?? null,
                    // 媒体文件路径（Tricaster 播放用）
                    filePath,       // \\server\media\clip.mov
                    proxyPath,      // http://server/proxy/clip.mp4
                    metadataPath,   // http://server/proxy/clip.xml
                    // mosExternalMetadata payload 原样保留
                    // playlistPayload 包含: mediaType, source, owner, found, version, metaData(编解码)
                    playlistPayload,
                    objectPayload,
                    // 原始标识
                    mosId,
                    objId: objIdStr,
                },
            });
        });

        return pieces;
    }

    // ── Profile 2 兜底：只有基础字段，无完整媒体元数据 ───────────────────────
    // 此时 filePath 等均为 null，等待后续 roStorySend 补全
    const itemPaths = item.Paths ?? [];
    const filePath      = itemPaths.find(p => p.Type === 'PATH')?.Target      ?? null;
    const proxyPath     = itemPaths.find(p => p.Type === 'PROXY PATH')?.Target ?? null;
    const metadataPath  = itemPaths.find(p => p.Type === 'METADATA PATH')?.Target ?? null;

    // item 级别的 mosExternalMetadata（转场参数等播出行为，也原样保留）
    const itemExtMeta     = item.MosExternalMetaData ?? [];
    const itemPlPayload   = itemExtMeta.find(m => m.MosScope === 'PLAYLIST')?.MosPayload ?? null;

    pieces.push({
        _id:           `${partId}_piece_0` as any,
        externalId:    objId ?? `${partId}_piece_0`,
        partId:        partId as any,
        name:          getPieceName(mosId),
        enable:        { start: 0 },
        sourceLayerId: resolveSourceLayer(mosId),
        outputLayerId: 'pgm',
        content: {
            timelineObjects: [],
            airStatus:       null,   // Profile 2 无状态，等 roStorySend 补全
            objStatus:       null,
            filePath,
            proxyPath,
            metadataPath,
            playlistPayload: itemPlPayload,
            objectPayload:   null,
            mosId,
            objId,
        },
    });

    return pieces;
}

// ─── sourceLayer 映射 ─────────────────────────────────────────────────────────

/**
 * 根据 mosId 决定 Piece 的 sourceLayerId。
 * sourceLayerId 决定 UI 上的标签颜色和设备路由。
 */
function resolveSourceLayer(mosId: string): string {
    const m = mosId.toUpperCase();
    if (m === 'JINGLE')             return 'jingle';
    if (m === 'LEGACY')             return 'vt';
    if (m.startsWith('VIDEO'))      return 'video';
    if (m.includes('VIDEOTEXT'))    return 'videotext';
    if (m.includes('VO'))           return 'vo';
    return 'video';
}