/**
 * @file mockRundown.ts
 * @description 基于真实 Octopus API 数据还原的 mock IRundown
 *
 * 数据来源：
 *   - Octopus HTTP API GET /rundown 响应（22条真实条目）
 *   - NewsCaster MOS 设备推送的 mosObj XML（视频文件元数据）
 *
 * 字段映射规则：
 *   Octopus.id          → ISegment._id / externalId
 *   Octopus.storySlug   → ISegment.name / IPart.title
 *   Octopus.itemSlug    → IPart.title（优先，null 时回退 storySlug）
 *   Octopus.type        → IPart.type（见 mapType()）
 *   Octopus.objId       → IPiece.externalId（媒体文件 ID）
 *   Octopus.status      → IPiece.content.airStatus
 *   MOS.objDur/objTB    → IPart.expectedDuration（帧数 / 帧率 * 1000 ms）
 *
 * Segment 分隔符规则：
 *   type === null 且 mosId === null → 纯结构分隔行（如 "SEGMENT 1"），映射为新 ISegment 边界
 *   有 type 的行 → IPart（归属于当前 Segment）
 *
 * PartType 映射（基于 Octopus type 字段）：
 *   STUDIO              → KAM   （演播室口播）
 *   INTRO/VIDEOTEXT     → KAM   （主播+字幕条，以口播为主）
 *   INTRO/VO            → VO    （主播+画外音）
 *   INTRO/VIDEO         → SERVER（主播导入+视频）
 *   VO                  → VO    （纯画外音）
 *   LEGACY              → SERVER（旧系统 VT 素材）
 *   JINGLE              → SERVER（片头/片尾/音效）
 *   VIDEO/VIDEO/...     → SERVER（纯视频/广告）
 *   null（有 mosId）    → UNKNOWN
 */

import type { IRundown } from '../../core-lib/src/models/rundown-model'
import type { ISegment } from '../../core-lib/src/models/segment-model'
import type { IPart } from '../../core-lib/src/models/part-model'
import type { IPiece } from '../../core-lib/src/models/piece-model'
import { PartType, PlaylistStatus } from '../../core-lib/src/models/enums'
import type { RundownRuntime } from '../../core-lib/src/socket/socket-contracts'

// ─── PartType 映射 ─────────────────────────────────

// ─── 时长：帧数 → 毫秒 ────────────────────────────────────────────────────────
// MOS XML: objDur=4030, objTB=59.94 → 4030/59.94*1000 ≈ 67200ms
// 无真实时长的条目用合理估算值

function frames(dur: number, tb: number): number {
    return Math.round((dur / tb) * 1000)
}

// ─── Piece 构建辅助 ───────────────────────────────────────────────────────────

function makePiece(
    id: string,
    name: string,
    partId: string,
    objId?: string,
    airStatus?: 'READY' | null,
): IPiece {
    return {
        _id: id as any,
        externalId: objId ?? id,
        partId: partId as any,
        name,
        enable: { start: 0 },
        sourceLayerId: 'graphics',
        outputLayerId: 'pgm',
        content: {
            timelineObjects: [],
            airStatus,
            objId,
        },
    }
}

// ─── Part 构建辅助 ────────────────────────────────────────────────────────────

let _partRank = 0
function makePart(
    id: string,
    segmentId: string,
    title: string,
    type: PartType,
    durationMs: number,
    pieces: IPiece[] = [],
): IPart {
    return {
        _id: id as any,
        externalId: id,
        segmentId: segmentId as any,
        title,
        rank: _partRank++,
        expectedDuration: durationMs,
        autoNext: false,
        autoNextOverlap: 0,
        type,
        pieces,
    }
}

// ─── Mock Rundown 构建 ────────────────────────────────────────────────────────

_partRank = 0  // reset

// ── Segment 0：开场（index 0-3，type 有值，无分隔符前）──────────────────────

const seg0Id = 'seg-opening'

const part_commercial_0 = makePart(
    'part-1250506433', seg0Id,
    'NTD COMMERCIAL 0',
    PartType.SERVER,
    120_000,  // 广告段，无真实时长，估算 2 分钟
    [
        makePiece('piece-1250506433-video', 'VIDEO', 'part-1250506433'),
    ]
)

const part_hello = makePart(
    'part-1250506434', seg0Id,
    'HELLO',
    PartType.KAM,
    0,   // 演播室 STUDIO，手动切走，duration=0
)

const part_teaser = makePart(
    'part-1250506435', seg0Id,
    'TEASER',
    PartType.SERVER,
    frames(2400, 59.94),  // 估算 ~40s
    [
        makePiece('piece-teaser-legacy', 'LEGACY', 'part-1250506435', '20260313_208177', 'READY'),
    ]
)

const part_opening_jingle = makePart(
    'part-1250506436', seg0Id,
    'HQZJ OPENING',
    PartType.SERVER,
    frames(1800, 59.94),  // 估算 ~30s
    [
        makePiece('piece-opening-jingle', 'JINGLE', 'part-1250506436', '20250213_177569', 'READY'),
    ]
)

const segment0: ISegment = {
    _id: seg0Id as any,
    externalId: seg0Id,
    rundownId: 'rundown-mock-001',
    name: '开场',
    rank: 0,
    parts: [part_commercial_0, part_hello, part_teaser, part_opening_jingle],
}

// ── Segment 1：第一节目段（index 4-12，到 BREAK1）────────────────────────────

const seg1Id = 'seg-block-1'

const part_hegseth = makePart(
    'part-1250818549', seg1Id,
    '赫格塞斯：打擊伊朗力度 週五將創歷史新高',
    PartType.KAM,   // INTRO/VIDEOTEXT → 主播为主
    frames(3600, 59.94),  // ~60s
    [
        makePiece('piece-hegseth-vt', 'VIDEOTEXT', 'part-1250818549', '20260313_208173', 'READY'),
    ]
)

const part_refueling = makePart(
    'part-1250730750', seg1Id,
    '美軍加油機伊拉克墜毀 飛行員全部遇難',
    PartType.KAM,
    frames(3600, 59.94),
    [
        makePiece('piece-refueling-vt', 'VIDEOTEXT', 'part-1250730750', '20260313_208168', 'READY'),
    ]
)

const part_iran_french = makePart(
    'part-1250730770', seg1Id,
    '法軍在伊拉克遇襲1死6傷 馬克龍：不可接受',
    PartType.VO,    // INTRO/VO
    frames(2400, 59.94),
    [
        makePiece('piece-iran-french-vo', 'VO', 'part-1250730770', '20260313_208161', 'READY'),
    ]
)

const part_dc_livehit = makePart(
    'part-1250730765', seg1Id,
    '【華府連線】川普豁免全球一個月內買俄油',
    PartType.VO,    // INTRO/VO，但含 livehit 标注，实为连线播出
    frames(3000, 59.94),
    [
        makePiece('piece-dc-vo', 'VO', 'part-1250730765', '20260313_208148', 'READY'),
    ]
)

const part_china_301 = makePart(
    'part-1250730769', seg1Id,
    '【短訊】美啟動301調查 聚焦60國的強迫勞動商品',
    PartType.KAM,
    // 这条是真实 MOS 数据：objDur=4030, objTB=59.94
    frames(4030, 59.94),  // ≈ 67,200ms ≈ 1:07
    [
        makePiece('piece-china-301-vt', 'VIDEOTEXT', 'part-1250730769', '20260313_208149', 'READY'),
    ]
)

const part_textile = makePart(
    'part-1250730720', seg1Id,
    '油價推動原料價格瘋漲 重擊中國紡織業',
    PartType.SERVER,  // INTRO/VIDEO
    frames(5400, 59.94),  // ~90s
    [
        makePiece('piece-textile-video', 'VIDEO', 'part-1250730720', '20260313_208128', 'READY'),
    ]
)

const part_hormuz = makePart(
    'part-1250730763', seg1Id,
    '【嘉賓連線】牽動全球市場 霍爾木茲海峽有多重要？',
    PartType.VO,
    frames(7200, 59.94),  // ~2分钟，嘉宾连线
    [
        makePiece('piece-hormuz-vo', 'VO', 'part-1250730763', '20260313_208143', 'READY'),
    ]
)

const part_documentary = makePart(
    'part-1250730759', seg1Id,
    '紀錄片《堅不可摧：神韻幕後的故事》即將上映',
    PartType.KAM,
    frames(3000, 59.94),
    [
        makePiece('piece-doc-vt', 'VIDEOTEXT', 'part-1250730759', '20260313_208162', 'READY'),
    ]
)

const part_break1 = makePart(
    'part-1250506437', seg1Id,
    'BREAK 1',
    PartType.SERVER,
    frames(7200, 59.94),  // 广告 ~2分钟
    [
        makePiece('piece-break1-legacy', 'LEGACY', 'part-1250506437', '20260313_208178', 'READY'),
    ]
)

const segment1: ISegment = {
    _id: seg1Id as any,
    externalId: seg1Id,
    rundownId: 'rundown-mock-001',
    name: '第一節',
    rank: 1,
    parts: [
        part_hegseth,
        part_refueling,
        part_iran_french,
        part_dc_livehit,
        part_china_301,
        part_textile,
        part_hormuz,
        part_documentary,
        part_break1,
    ],
}

// ── Segment 2：广告段（index 13-16，SEGMENT 1 / COMMERCIAL1 分隔）────────────

const seg2Id = 'seg-commercial-1'

const part_commercial_1 = makePart(
    'part-1250506440', seg2Id,
    'NTD COMMERCIAL 1',
    PartType.SERVER,
    120_000,  // 广告，3支 30s/60s，估算 2 分钟
    [
        makePiece('piece-comm1-video', 'VIDEO', 'part-1250506440',
            'EC_30_Healthfirst_BridgeCamp24-AD_s8_e240_v1_i0', 'READY'),
    ]
)

const part_coming_back = makePart(
    'part-1250506441', seg2Id,
    'HQZJ COMING BACK',
    PartType.SERVER,
    frames(1800, 59.94),
    [
        makePiece('piece-coming-back-jingle', 'JINGLE', 'part-1250506441', '20250127_176119', 'READY'),
    ]
)

const segment2: ISegment = {
    _id: seg2Id as any,
    externalId: seg2Id,
    rundownId: 'rundown-mock-001',
    name: '廣告段',
    rank: 2,
    parts: [part_commercial_1, part_coming_back],
}

// ── Segment 3：第二节目段（index 17-19）──────────────────────────────────────

const seg3Id = 'seg-block-2'

const part_nepal = makePart(
    'part-1250818502', seg3Id,
    '【口播】尼泊爾大選 改革派新政黨獲壓倒性勝利',
    PartType.VO,
    frames(2400, 59.94),
    [
        makePiece('piece-nepal-vo', 'VO', 'part-1250818502', '20260313_208157', 'READY'),
    ]
)

const part_virginia = makePart(
    'part-1250818579', seg3Id,
    '【口播】美國弗州校園槍擊案 2死2傷 槍手曾涉恐怖組織',
    PartType.VO,
    frames(2400, 59.94),
    [
        makePiece('piece-virginia-vo', 'VO', 'part-1250818579', '20260313_208180', 'READY'),
    ]
)

const part_finance = makePart(
    'part-1250730774', seg3Id,
    '【財經簡訊】美下調第四季GDP增速 1月核心通脹3.1%',
    PartType.SERVER,  // INTRO/VIDEO
    frames(3600, 59.94),
    [
        makePiece('piece-finance-video', 'VIDEO', 'part-1250730774', '20260313_208152', 'READY'),
    ]
)

const segment3: ISegment = {
    _id: seg3Id as any,
    externalId: seg3Id,
    rundownId: 'rundown-mock-001',
    name: '第二節',
    rank: 3,
    parts: [part_nepal, part_virginia, part_finance],
}

// ── Segment 4：结尾（index 20-21）────────────────────────────────────────────

const seg4Id = 'seg-ending'

const part_goodbye = makePart(
    'part-1250506442', seg4Id,
    'GOODBYE',
    PartType.KAM,
    0,  // 演播室 STUDIO，手动切走
)

const part_ending_jingle = makePart(
    'part-1250506443', seg4Id,
    'HQZJ ENDING',
    PartType.SERVER,
    frames(1800, 59.94),
    [
        makePiece('piece-ending-jingle', 'JINGLE', 'part-1250506443', '20250127_176120', 'READY'),
    ]
)

const segment4: ISegment = {
    _id: seg4Id as any,
    externalId: seg4Id,
    rundownId: 'rundown-mock-001',
    name: '結尾',
    rank: 4,
    parts: [part_goodbye, part_ending_jingle],
}

// ─── 完整 IRundown ────────────────────────────────────────────────────────────

export const mockRundown: IRundown = {
    _id: 'rundown-mock-001' as any,
    externalId: 'rundown-mock-001',
    name: 'NTD 午間新聞 2026-03-13',
    expectedStart: new Date('2026-03-13T12:00:00Z').getTime(),
    expectedDuration: 30 * 60 * 1000,  // 30 分钟
    status: PlaylistStatus.ACTIVE,
    currentPartId: null,
    nextPartId: null,
    modified: Date.now(),
    segments: [segment0, segment1, segment2, segment3, segment4],
}

// ─── Mock Runtime（模拟播出状态，可按需修改）─────────────────────────────────

/**
 * 模拟：正在播出 part_china_301，预览 part_textile，下一个 part_hormuz
 * 修改这三个 partId 可以测试不同状态的 UI 渲染
 */

export const mockRuntime: RundownRuntime = {
    rundownId: 'rundown-mock-001',
    engineState: 'RUNNING'as const,
    onAirPartId: 'part-1250730769',   // 【短訊】美啟動301調查
    previewPartId: 'part-1250730720',   // 油價推動原料價格瘋漲
    nextPartId: 'part-1250730763',   // 【嘉賓連線】霍爾木茲
}