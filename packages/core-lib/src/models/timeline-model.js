"use strict";
/**
 * @file timeline-model.ts
 * @description 定义“时间线”——Timeline。
 * 这是 "Temporal Domain" (时间域) 的核心模型。
 * 它是 Core Engine 计算的产物，也是 Playout Gateway 的唯一输入。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineObjType = void 0;
var TimelineObjType;
(function (TimelineObjType) {
    /** 手动创建的对象 */
    TimelineObjType["MANUAL"] = "manual";
    /** 从 Rundown 逻辑生成的对象 */
    TimelineObjType["RUNDOWN"] = "rundown";
})(TimelineObjType || (exports.TimelineObjType = TimelineObjType = {}));
//# sourceMappingURL=timeline-model.js.map