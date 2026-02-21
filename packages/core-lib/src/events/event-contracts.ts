/**
 * @file event-contracts.ts
 * @description 定义整个系统中所有跨模块通信的事件“契约”。
 * 这是我们实现“编译时安全”和“非直接耦合”的基石。
 */

import { z } from 'zod';
import { Rundown as MosRundown } from '../models/mos-model';
import { Rundown as ValidatedRundown } from '../models/rundown-model';
import { Timeline } from '../models/timeline-model';

// --- Zod Schemas for Event Payloads ---
// 我们为每一个事件的 payload 定义一个 Zod schema，以实现运行时的验证（可选，但推荐）

const MosRundownCreatedSchema = z.object({
    rundown: z.any(), // 简化：假设 mos.model.ts 中导出了 Rundown schema
});

const RundownValidatedSchema = z.object({
    rundown: z.any(), // 简化：假设 rundown.model.ts 中导出了 Rundown schema
});

const TimelineGeneratedSchema = z.object({
    rundownId: z.string(),
    timeline: z.any(), // 简化：假设 timeline.model.ts 中导出了 Timeline schema
});

const TakeNextPartSchema = z.object({
    rundownId: z.string(),
});


// --- TypeScript Types inferred from Schemas ---
// 我们从 Zod schema 自动推导出 TypeScript 类型，用于编译时检查

export type MosRundownCreatedPayload = z.infer<typeof MosRundownCreatedSchema>;
export type RundownValidatedPayload = z.infer<typeof RundownValidatedSchema>;
export type TimelineGeneratedPayload = z.infer<typeof TimelineGeneratedSchema>;
export type TakeNextPartPayload = z.infer<typeof TakeNextPartSchema>;


// --- The Master Event Map ---
// 这是我们系统的“事件总线地图”，它将事件名映射到其 payload 的确切类型。

export interface AppEventMap {
    // --- 数据流入流水线 ---
    'mos:roCreate:received': MosRundownCreatedPayload;
    'parser:js-object:parsed': { source: string; data: any }; // 从 parser 到 validator
    'validator:rundown:validated': RundownValidatedPayload;

    // --- UI/外部控制指令 ---
    'actions:takeNext': TakeNextPartPayload;
    // ... 'actions:setNext', 'actions:activate' etc.

    // --- 引擎到执行器的核心输出 ---
    'engine:timeline:generated': TimelineGeneratedPayload;

    // --- 执行器到外部的状态反馈 ---
    'device:state:changed': { deviceId: string; state: any; timestamp: number };
    'mos:ack:send': { rundownId: string; status: 'OK' | 'Error'; description: string };
    
    // ... 其他所有需要的事件
}
