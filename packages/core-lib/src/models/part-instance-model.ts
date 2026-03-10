/**
 * @fileoverview PartInstance — 实际播出单元
 *
 * Part（只读，来自NCS）+ PlayConfig（导播附加）= PartInstance（实际播出）
 *
 * PartInstance 是 Timeline Builder 的输入。
 * Part 永远不被修改，NCS 随时可以更新它，不影响正在播出的内容。
 */

import type { IPart }  from './part-model'
import type { IPiece } from './piece-model'

/**
 * 导播在播出时附加的临时配置
 * 第二轮先实现基础版，AdLib 等后续补充
 */
export interface PlayConfig {
    /** 导播手动选择的摄像机输入（覆盖 Blueprint 默认值） */
    cameraInput?: string
    /** 导播手动选择的视频源 */
    videoInput?:  string
    /** 是否跳过此 Part */
    skip?:        boolean
}

/**
 * PartInstance — 实际送入 Timeline Engine 的数据
 */
export interface IPartInstance {
    /** 唯一实例 ID（每次 TAKE 生成新的） */
    instanceId:  string

    /** 所属 Rundown ID */
    rundownId:   string

    /** 原始 Part（只读引用） */
    part:        IPart

    /** 导播附加配置（可选） */
    playConfig?: PlayConfig

    /** TAKE 时的 Wall Clock 时间戳（Date.now()） */
    startTime:   number

    /** 结束时间（自然结束时设置，TAKE 走时强制结束） */
    endTime?:    number

    /** 是否已结束 */
    ended:       boolean

    /** 是否是预监实例（SEND TO PREVIEW 时创建，TAKE 时替换为正式实例） */
    isPreview?: boolean

    /** 实际生效的 Pieces（Blueprint 计算后填入） */
    pieces:      IPiece[]
}