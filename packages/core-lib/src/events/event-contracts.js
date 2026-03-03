"use strict";
/**
 * @file event-contracts.ts
 * @description 定义整个系统中所有跨模块通信的事件“契约”。
 * 这是我们实现“编译时安全”和“非直接耦合”的基石。
 */
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
// --- Zod Schemas for Event Payloads ---
// 我们为每一个事件的 payload 定义一个 Zod schema，以实现运行时的验证（可选，但推荐）
const MosRundownCreatedSchema = zod_1.z.object({
    rundown: zod_1.z.any(), // 简化：假设 mos.model.ts 中导出了 Rundown schema
});
const RundownValidatedSchema = zod_1.z.object({
    rundown: zod_1.z.any(), // 简化：假设 rundown.model.ts 中导出了 Rundown schema
});
const TimelineGeneratedSchema = zod_1.z.object({
    rundownId: zod_1.z.string(),
    timeline: zod_1.z.any(), // 简化：假设 timeline.model.ts 中导出了 Timeline schema
});
const TakeNextPartSchema = zod_1.z.object({
    rundownId: zod_1.z.string(),
});
//# sourceMappingURL=event-contracts.js.map