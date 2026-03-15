/**
 * @fileoverview TimelineBuilder — 将 PartInstance 转换为 TimelineObjects
 *
 * 核心原则：纯函数，无副作用，无外部依赖
 *   buildTimeline(partInstances) → ITimelineObject[]
 *
 * Blueprint 规则（基于真实 Octopus 数据，2026-03-14 更新）：
 *   part.type 由 mos-to-rundown.ts 的 mapMosIdToPartType() 在入库时确定，
 *   此处直接读取，不再猜测关键词。
 *
 *   PartType → Tricaster 输入源映射：
 *   KAM     → Input1   演播室摄像机
 *   SERVER  → DDR1     视频服务器
 *   VO      → DDR1     配音（同走视频服务器通道）
 *   LIVE    → Input5   现场连线信号
 *   GRAPHICS→ null     全屏图文，不切视频源（由 VIZ 直接叠加）
 *   UNKNOWN → Input1   安全默认值，回退到摄像机
 *
 * 第三轮范围：
 *   ✅ 根据 PartType 生成对应的 Tricaster shortcut TimelineObject
 *   ✅ Preview 实例只生成 preview 源切换，不生成 TAKE 命令
 *   ❌ AdLib Timeline（第四轮）
 *   ❌ System Timeline（第四轮）
 *   ❌ VIZ / LAWO Timeline（第四轮）
 */

import type { IPartInstance }  from '../../../../../core-lib/src/models/part-instance-model'
import type { ITimelineObject } from '../../../../../core-lib/src/models/timeline-model'
import { TimelineObjType }     from '../../../../../core-lib/src/models/timeline-model'
import { PartType, DeviceType } from '../../../../../core-lib/src/models/enums'
import { logger }              from '../../../shared/logger'

// ─── Blueprint 规则：Part 类型 → Tricaster 预览源 ────────────────────────────

/**
 * 根据 PartType 返回对应的 Tricaster 预览源 shortcut 值。
 * 返回 null 表示不需要切换预览源（如全屏图文由 VIZ 直接处理）。
 *
 * 输入源编号基于实际 Tricaster 接线配置，后续可通过配置文件驱动。
 */
function getPreviewSource(type: PartType): string | null {
    switch (type) {
        case PartType.KAM:      return 'Input1'   // 演播室摄像机
        case PartType.SERVER:   return 'DDR1'     // 视频服务器（Newscaster）
        case PartType.VO:       return 'DDR1'     // 配音也走 DDR 通道
        case PartType.LIVE:     return 'Input5'   // 现场连线信号
        case PartType.REMOTE:   return 'Input5'   // 远程信号同 LIVE
        case PartType.GRAPHICS: return null       // 全屏图文，不切视频源
        case PartType.UNKNOWN:  return 'Input1'   // 安全默认值
        default:                return 'Input1'
    }
}

// ─── Timeline Builder 主函数 ──────────────────────────────────────────────────

/**
 * 将所有存活的 PartInstances 转换为 TimelineObjects。
 * 纯函数：相同输入永远得到相同输出。
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
 * 为单个 PartInstance 生成 TimelineObjects。
 *
 * Preview 实例（isPreview=true）：只生成 preview 源切换，不发 TAKE 命令。
 * 正式实例（isPreview=false）：生成 preview 源切换 + TAKE 命令。
 */
function buildPartTimeline(instance: IPartInstance): ITimelineObject[] {
    const objects: ITimelineObject[] = []
    const { part, startTime, instanceId, isPreview } = instance

    // part.type 由 mos-to-rundown.ts 在入库时通过 mapMosIdToPartType() 确定
    // 不再需要在这里猜测关键词
    const partType = part.type

    // ① Preview 源切换：设置 Tricaster 预监输入
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

    // ② TAKE 命令：只有正式播出实例才触发（Preview 实例不 TAKE）
    if (!isPreview) {
        objects.push({
            id:         `${instanceId}_take`,
            layer:      'video.take',
            enable:     { start: startTime, duration: 100 },
            priority:   1,
            content: {
                deviceType: DeviceType.ABSTRACT,
                type:       'tricaster_shortcut',
                shortcut:   'main_background_take',
            },
            objectType: TimelineObjType.RUNDOWN,
        })
    }

    logger.debug(`[TimelineBuilder] Part "${part._id}" (${partType})${isPreview ? ' [PREVIEW]' : ''}: ${objects.length} objects`)
    return objects
}