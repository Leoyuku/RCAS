/**
 * @file timeline-model.ts
 * @description 定义“时间线”——Timeline。
 * 这是 "Temporal Domain" (时间域) 的核心模型。
 * 它是 Core Engine 计算的产物，也是 Playout Gateway 的唯一输入。
 */

import { TimelineObjId, DeviceType } from './enums';

export enum TimelineObjType {
    /** 手动创建的对象 */
    MANUAL = 'manual',
    /** 从 Rundown 逻辑生成的对象 */
    RUNDOWN = 'rundown',
}

/**
 * 时间线对象的启用条件
 * 这是声明式时间线的灵魂。
 */
export interface TimelineEnable {
    /** 
     * 开始时间 
     * number: 绝对时间戳 (Unix ms)
     * 'now': 立即开始
     */
    start: number | 'now';

    /** 
     * 持续时间 (ms) 
     * 如果同时设置了 end，duration 可能会被忽略或用于计算 end
     */
    duration?: number;

    /** 
     * 结束时间 (绝对时间戳)
     */
    end?: number;

    /** 
     * 重复周期 (用于循环播放，可选) 
     */
    repeating?: number;
}

/**
 * 核心时间线对象
 * 描述了：在什么时候 (Enable)，哪个层 (Layer)，哪个设备 (Device)，做什么 (Content)。
 */
export interface ITimelineObject {
    /** 唯一 ID */
    id: TimelineObjId;

    /** 启用条件 */
    enable: TimelineEnable;

    /** 
     * 逻辑层级 (Layer)
     * TSR 使用这个 ID 来处理冲突。同一 Layer 在同一时间只能有一个对象 Active。
     * 例如: 'layer_casparcg_clip', 'layer_atem_me1_pgm'
     */
    layer: string;

    /**
     * 优先级 (Priority)
     * 当两个对象在同一 Layer 时间重叠时，Priority 高的胜出。
     * 0 是最低优先级。
     */
    priority: number;

    /**
     * 内容 (Content)
     * 这是设备驱动真正关心的部分。
     * 它的结构由具体的 DeviceType 决定 (例如 CasparCG 的 play 命令参数)。
     */
    content: {
        deviceType: DeviceType;
        type?: any; // 具体设备的动作类型
        [key: string]: any;
    };

    /**
     * 关键帧 (Keyframes)
     * 允许在一个对象内部定义更细粒度的属性变化 (例如：音量淡入淡出)。
     */
    keyframes?: Array<{
        id: string;
        enable: {
            start: number; // 相对时间
            duration?: number;
        };
        content: any; // 覆盖主 content 中的属性
    }>;

    /** 
     * 对象类型 (元数据)
     * 帮助调试追踪来源
     */
    objectType: TimelineObjType;

    /**
     * 仅仅用于分组或引用的类名
     */
    classes?: string[];

    /**
     * 这是一个正在保持 (Hold) 的对象吗？
     * (用于处理跨 Part 的状态保持)
     */
    isHold?: boolean;
}

/**
 * 完整的时间线状态
 */
export interface ITimeline {
    /** 生成时间戳 */
    generated: number;
    
    /** 所属的 Rundown ID (如果是基于 Rundown 生成的) */
    rundownId?: string;

    /** 包含的所有对象 */
    objects: ITimelineObject[];
}
