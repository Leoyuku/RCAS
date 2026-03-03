"use strict";
/**
 * @file enums.ts
 * @description 系统通用的枚举和基础类型定义
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaylistStatus = exports.PartType = exports.DeviceType = void 0;
// --- 基础枚举 ---
/**
 * 设备类型 (用于 Timeline 和 Blueprint)
 * 对应底层 TSR (Timeline State Resolver) 支持的设备
 */
var DeviceType;
(function (DeviceType) {
    DeviceType[DeviceType["ABSTRACT"] = 0] = "ABSTRACT";
    DeviceType[DeviceType["CASPARCG"] = 1] = "CASPARCG";
    DeviceType[DeviceType["ATEM"] = 2] = "ATEM";
    DeviceType[DeviceType["OBS"] = 3] = "OBS";
    DeviceType[DeviceType["HTTP"] = 4] = "HTTP";
    DeviceType[DeviceType["SISYFOS"] = 5] = "SISYFOS";
    DeviceType[DeviceType["VMIX"] = 6] = "VMIX";
    DeviceType[DeviceType["OSC"] = 7] = "OSC";
})(DeviceType || (exports.DeviceType = DeviceType = {}));
/**
 * 节目片段类型 (用于 UI 显示和逻辑分组)
 * 这决定了 Part 在时间线上的视觉样式
 */
var PartType;
(function (PartType) {
    PartType["UNKNOWN"] = "unknown";
    PartType["KAM"] = "kam";
    PartType["SERVER"] = "server";
    PartType["VO"] = "vo";
    PartType["LIVE"] = "live";
    PartType["GRAPHICS"] = "graphics";
    PartType["REMOTE"] = "remote";
})(PartType || (exports.PartType = PartType = {}));
/**
 * 播放状态
 */
var PlaylistStatus;
(function (PlaylistStatus) {
    PlaylistStatus[PlaylistStatus["UNKNOWN"] = 0] = "UNKNOWN";
    PlaylistStatus[PlaylistStatus["ACTIVE"] = 1] = "ACTIVE";
    PlaylistStatus[PlaylistStatus["REHEARSAL"] = 2] = "REHEARSAL";
})(PlaylistStatus || (exports.PlaylistStatus = PlaylistStatus = {}));
//# sourceMappingURL=enums.js.map