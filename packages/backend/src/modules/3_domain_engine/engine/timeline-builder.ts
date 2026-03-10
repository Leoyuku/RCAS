/**
 * @fileoverview TimelineBuilder — 将 PartInstance 转换为 TimelineObjects
 *
 * 核心原则：纯函数，无副作用，无外部依赖
 *   buildTimeline(partInstances) → ITimelineObject[]
 *
 * 第三轮范围：
 *   ✅ 根据 PartType 生成对应的 Tricaster shortcut TimelineObject
 *   ✅ 三来源合并：Base（Part生成）
 *   ❌ AdLib Timeline（第四轮）
 *   ❌ System Timeline（第四轮）
 *
 * Blueprint 识别规则（临时，待真实 Octopus 数据后调整）：
 *   itemSlug 含 VT/VO  → SERVER/VO → DDR1
 *   itemSlug 含 CAM/KAM → KAM      → Input1
 *   itemSlug 含 LIVE    → LIVE      → Input5
 *   其他               → UNKNOWN   → main_background_take only
 */

import type { IPartInstance }  from '../../../../../core-lib/src/models/part-instance-model'
import type { ITimelineObject } from '../../../../../core-lib/src/models/timeline-model'
import { TimelineObjType }     from '../../../../../core-lib/src/models/timeline-model'
import { PartType, DeviceType } from '../../../../../core-lib/src/models/enums'
import { logger }              from '../../../shared/logger'

// ─── Blueprint 规则：Part 类型识别 ───────────────────────────────────────────

/**
 * 根据 Part 的 title/externalId 识别类型
 * 待真实 Octopus 数据后调整识别规则
 */
export function detectPartType(title: string): PartType {
    const upper = title.toUpperCase()
    if (upper.includes('VT') || upper.includes('VO'))   return PartType.VO
    if (upper.includes('SERVER'))                        return PartType.SERVER
    if (upper.includes('CAM') || upper.includes('KAM')) return PartType.KAM
    if (upper.includes('LIVE') || upper.includes('连线')) return PartType.LIVE
    if (upper.includes('GRAPHICS') || upper.includes('字幕')) return PartType.GRAPHICS
    return PartType.UNKNOWN
}

// ─── Blueprint 规则：Part 类型 → Tricaster 输入源 ────────────────────────────

/**
 * 根据 PartType 返回对应的 Tricaster 预览源 shortcut 值
 * 这是临时的硬编码映射，未来由 Blueprint 配置文件驱动
 */
function getPreviewSource(type: PartType): string | null {
    switch (type) {
        case PartType.KAM:     return 'Input1'   // 摄像机1
        case PartType.SERVER:  return 'DDR1'     // 视频服务器1
        case PartType.VO:      return 'DDR1'     // 配音也走 DDR
        case PartType.LIVE:    return 'Input5'   // 连线信号
        case PartType.GRAPHICS: return null      // 全屏图文，不切视频源
        case PartType.UNKNOWN: return null       // 未知类型，不预设输入源
        default:               return null
    }
}

// ─── Timeline Builder 主函数 ──────────────────────────────────────────────────

/**
 * 将所有存活的 PartInstances 转换为 TimelineObjects
 *
 * 纯函数：相同输入永远得到相同输出
 */
export function buildTimeline(partInstances: IPartInstance[]): ITimelineObject[] {
    const objects: ITimelineObject[] = []

    for (const instance of partInstances) {
        const partObjects = buildPartTimeline(instance)
        objects.push(...partObjects)
    }

    logger.debug(`[TimelineBuilder] Built ${objects.length} objects from ${partInstances.length} instances`)
    return objects
}

/**
 * 为单个 PartInstance 生成 TimelineObjects
 */
function buildPartTimeline(instance: IPartInstance): ITimelineObject[] {
    const objects: ITimelineObject[] = []
    const { part, startTime, instanceId } = instance

    // Blueprint：识别 Part 类型
    const partType = part.type !== PartType.UNKNOWN
        ? part.type
        : detectPartType(part.title)

    // ① 主视频切换：设置 Preview 源
    const previewSource = getPreviewSource(partType)
    if (previewSource) {
        objects.push({
            id:         `${instanceId}_pvw`,
            layer:      'video.preview',
            enable:     { start: startTime },
            priority:   1,
            content: {
                deviceType: DeviceType.ABSTRACT,
                type:       'tricaster_shortcut',
                shortcut:   'main_preview_source',
                value:      previewSource,
            },
            objectType: TimelineObjType.RUNDOWN,
        })
    }

    // ② TAKE 命令：在 startTime 触发切换
    objects.push({
        id:         `${instanceId}_take`,
        layer:      'video.take',
        enable:     { start: startTime, duration: 100 }, // 100ms 脉冲
        priority:   1,
        content: {
            deviceType: DeviceType.ABSTRACT,
            type:       'tricaster_shortcut',
            shortcut:   'main_background_take',
        },
        objectType: TimelineObjType.RUNDOWN,
    })

    logger.debug(`[TimelineBuilder] Part "${part._id}" (${partType}): ${objects.length} objects`)
    return objects
}