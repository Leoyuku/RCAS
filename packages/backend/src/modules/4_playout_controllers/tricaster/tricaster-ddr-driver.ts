/**
 * TricasterDDRDriver
 *
 * 职责：通过 Tricaster shortcut 指令控制 DDR 通道的媒体内容操作
 * 实现 IVideoServerDriver 接口，复用 TricasterClient 的 WebSocket 连接
 *
 * 支持能力：canPushToDDR = true
 * 不支持：canPlayVideo（无 VDCP 协议）
 *
 * 修改指南：
 * - DDR shortcut 名称变更 → 只改本文件的 sendShortcut 调用
 * - 新增 DDR 通道 → 不需要改本文件，由调用方传入 channel 参数
 */

import { tricasterClient } from './tricaster-client'
import type { IVideoServerDriver } from '../interfaces/device-drivers'
import type { VideoServerCapabilities } from '../interfaces/device-capabilities'
import type { DeviceConfig, DeviceStatus, ClipInfo } from '../interfaces/device-config'
import { logger } from '../../../shared/logger'

export class TricasterDDRDriver implements IVideoServerDriver {

    readonly capabilities: VideoServerCapabilities = {
        canPlayVideo: false,
        canStoreVideo: false,
        canPushToDDR: true,
    }

    // ── IBaseDriver ──────────────────────────────────────────────────────────

    get config(): DeviceConfig {
        throw new Error('[TricasterDDRDriver] config not available, use TricasterDriver')
    }

    async connect(): Promise<void> {
        // 复用 TricasterClient 连接，无需独立连接
    }

    async disconnect(): Promise<void> {
        // 复用 TricasterClient 连接，无需独立断开
    }

    async getStatus(): Promise<DeviceStatus> {
        throw new Error('[TricasterDDRDriver] getStatus not available, use TricasterDriver')
    }

    // ── IVideoServerDriver：DDR 内容操作 ─────────────────────────────────────

    /**
     * 选中 DDR 通道内的指定文件
     * @param clipId  文件路径（绝对路径）
     * @param channel DDR 通道名，如 "ddr1" / "ddr2"
     */
    async selectFile(clipId: string, channel: string): Promise<void> {
        tricasterClient.sendShortcut(`${channel}_select_file`, clipId)
        logger.info(`[TricasterDDRDriver] selectFile: ${channel} → "${clipId}"`)
    }

    /**
     * 推送文件列表到 DDR 通道（替换当前播放列表）
     * @param clipId  文件路径，多个文件用 | 分隔
     * @param channel DDR 通道名，如 "ddr1"
     */
    async pushToDDR(clipId: string, channel: string): Promise<void> {
        tricasterClient.sendShortcut(`${channel}_add_clips`, clipId)
        logger.info(`[TricasterDDRDriver] pushToDDR: ${channel} → "${clipId}"`)
    }

    /**
     * 加载素材到 DDR（pushToDDR 的语义别名，供接口兼容）
     */
    async loadClip(clipId: string, channel: string): Promise<void> {
        await this.pushToDDR(clipId, channel)
    }

    /**
     * 播放 DDR 通道
     */
    async playDDR(channel: string): Promise<void> {
        tricasterClient.sendShortcut(`${channel}_play`)
        logger.info(`[TricasterDDRDriver] playDDR: ${channel}`)
    }

    /**
     * 停止 DDR 通道
     */
    async stopDDR(channel: string): Promise<void> {
        tricasterClient.sendShortcut(`${channel}_stop`)
        logger.info(`[TricasterDDRDriver] stopDDR: ${channel}`)
    }

    // ── IVideoServerDriver：不支持的能力（降级处理）────────────────────────

    async cue(clipId: string, channel: string): Promise<void> {
        logger.warn('[TricasterDDRDriver] cue() not supported, use selectFile() instead')
    }

    async play(channel: string): Promise<void> {
        await this.playDDR(channel)
    }

    async stop(channel: string): Promise<void> {
        await this.stopDDR(channel)
    }

    async pause(channel: string): Promise<void> {
        logger.warn('[TricasterDDRDriver] pause() not supported on DDR channel')
    }

    async getClipInfo(clipId: string): Promise<ClipInfo> {
        logger.warn('[TricasterDDRDriver] getClipInfo() not supported')
        return { clipId, title: '', duration: 0 }
    }
}

export const tricasterDDRDriver = new TricasterDDRDriver()