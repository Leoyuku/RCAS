/**
 * @fileoverview PlayoutController — Engine 与设备驱动之间的胶水层
 *
 * 职责：
 * - 监听 RundownEngine 的 runtimeChanged 事件
 * - 分析 runtime 变化（哪个指针动了、动到哪）
 * - 从 RundownStore 拿到 Part 数据
 * - 查 DeviceConfigService 确定逻辑源 → 物理源的映射
 * - 根据设备能力调用 ISwitcherDriver / IVideoServerDriver
 *
 * 不知道的事：
 * - 设备品牌（只看 capabilities）
 * - 物理输入口名称（从 device-config 读）
 * - MOS 协议细节（从 Part/Piece 里读已解析好的字段）
 */

import { rundownEngine } from '../3_domain_engine/engine/rundown-engine'
import { rundownStore } from '../3_domain_engine/store/rundown-store'
import { logger } from '../../shared/logger'
import { tricasterDriver } from './tricaster/tricaster-driver'
import type { ISwitcherDriver } from './interfaces/device-drivers'
import type { IVideoServerDriver } from './interfaces/device-drivers'
import type { RundownRuntime } from '../../../../core-lib/src/socket/socket-contracts'
import type { IPart } from '../../../../core-lib/src/models/part-model'
import type { IPiece } from '../../../../core-lib/src/models/piece-model'
import type { DeviceConfigFile, SourceConfig, L3rdConfig } from './interfaces/device-config'
import { PartType } from '../../../../core-lib/src/models/enums'
import { runtimeOverrideStore } from './runtime-override-store'

// ─── 意图对象：PlayoutController 内部用，标准化 Part 的播出需求 ────────────────

interface PartPlayoutIntent {
    partId: string
    partType: PartType
    sourceId: string | null   // 逻辑源 ID（'CAM1'、'VT_A'），null = 未知
    clipId: string | null   // 素材 ID（VT/SERVER 类型），null = 无素材
    proxyPath: string | null
    l3rdPiece: IPiece | null   // L3RD 字幕 Piece，null = 无字幕
    bugPiece: IPiece | null   // BUG 台标 Piece，null = 无台标
}

// ─── PlayoutController ────────────────────────────────────────────────────────

export class PlayoutController {

    private _switcher: ISwitcherDriver
    private _videoServer: IVideoServerDriver | null = null
    private _config: DeviceConfigFile | null = null
    private _prevRuntime: RundownRuntime | null = null

    // L3RD 定时器 handle，防止多次 TAKE 时旧定时器叠加
    private _l3rdOnTimer: ReturnType<typeof setTimeout> | null = null
    private _l3rdOffTimer: ReturnType<typeof setTimeout> | null = null

    constructor(switcher: ISwitcherDriver, videoServer: IVideoServerDriver | null = null) {
        this._switcher = switcher
        this._videoServer = videoServer
    }

    // ── 初始化 ──────────────────────────────────────────────────────────────────

    init(config: DeviceConfigFile): void {
        this._config = config

        rundownEngine.on('runtimeChanged', (runtime) => {
            this._handleRuntimeChanged(runtime).catch(err => {
                logger.error(`[PlayoutController] runtimeChanged error: ${err.message}`)
            })
        })

        logger.info('[PlayoutController] Initialized.')
    }

    // ── 配置热更新（技术人员在 Settings 页修改配置后调用）────────────────────────

    updateConfig(config: DeviceConfigFile): void {
        this._config = config
        logger.info('[PlayoutController] Config updated.')
    }

    // ─── 核心：处理 runtime 变化 ─────────────────────────────────────────────────

    private async _handleRuntimeChanged(runtime: RundownRuntime): Promise<void> {
        const prev = this._prevRuntime
        this._prevRuntime = runtime

        // 只有 onAirPartId 真正变化时才需要操作设备
        // previewPartId 变化只影响前端显示，不需要发设备指令（联调阶段再加 SEND TO PREVIEW 逻辑）
        if (runtime.onAirPartId === prev?.onAirPartId) return
        if (!runtime.onAirPartId) return

        logger.info(`[PlayoutController] onAir changed → "${runtime.onAirPartId}"`)

        // 1. 拿到 Part 数据
        const part = this._getPart(runtime.rundownId, runtime.onAirPartId)
        if (!part) {
            logger.error(`[PlayoutController] Part "${runtime.onAirPartId}" not found in store`)
            return
        }

        // 2. 解析播出意图
        const intent = this._resolvePartIntent(part)
        logger.info(`[PlayoutController] Intent: type=${intent.partType}, source=${intent.sourceId}, clip=${intent.clipId}`)

        // 3. 执行播出
        await this._executeTake(intent)
    }

    // ─── 播出执行 ────────────────────────────────────────────────────────────────

    private async _executeTake(intent: PartPlayoutIntent): Promise<void> {
        const config = this._config
        if (!config) {
            logger.error('[PlayoutController] No config loaded, cannot execute take')
            return
        }

        try {
            switch (intent.partType) {

                case PartType.KAM:
                    await this._executeKamTake(intent, config)
                    break

                case PartType.SERVER:
                case PartType.VO:
                    await this._executeServerTake(intent, config)
                    break

                case PartType.LIVE:
                case PartType.REMOTE:
                    await this._executeLiveTake(intent, config)
                    break

                case PartType.GRAPHICS:
                    // TODO：全屏图文，联调时确认走哪个通道
                    logger.warn('[PlayoutController] GRAPHICS type not yet implemented')
                    await this._switcher.take()
                    break

                default:
                    logger.warn(`[PlayoutController] Unknown PartType: ${intent.partType}, executing bare take`)
                    await this._switcher.take()
            }

            // L3RD 处理（与 PartType 无关，只要有 L3RD Piece 就触发）
            if (intent.l3rdPiece) {
                this._schedulL3rd(config.l3rd, config.dskMapping['L3RD'] ?? 1)
            } else {
                // 没有 L3RD 的 Part，确保 DSK 关闭（防止上一条 L3RD 残留）
                this._cancelL3rd()
                await this._switcher.dskOff(config.dskMapping['L3RD'] ?? 1)
            }

        } catch (err: any) {
            logger.error(`[PlayoutController] executeTake failed: ${err.message}`)
        }
    }

    // ── KAM（摄像机/口播）────────────────────────────────────────────────────────

    private async _executeKamTake(intent: PartPlayoutIntent, config: DeviceConfigFile): Promise<void> {
        if (!intent.sourceId) {
            logger.warn('[PlayoutController] KAM take: no sourceId, executing bare take')
            await this._switcher.take()
            return
        }
    
        const source = config.sources[intent.sourceId]
        if (!source) {
            logger.warn(`[PlayoutController] KAM take: sourceId "${intent.sourceId}" not in config.sources`)
            await this._switcher.take()
            return
        }
    
        // switcherName 对 camera/vt 类必有，me 类没有
        if (!source.switcherName) {
            logger.warn(`[PlayoutController] KAM take: source "${intent.sourceId}" has no switcherName`)
            await this._switcher.take()
            return
        }
    
        await (this._switcher as any).setPreview(source.switcherName)
        await this._switcher.take()
        logger.info(`[PlayoutController] KAM take: ${intent.sourceId} → ${source.switcherName}`)
    }

    // ── SERVER/VO（视频服务器播出）────────────────────────────────────────────────

    private async _executeServerTake(intent: PartPlayoutIntent, config: DeviceConfigFile): Promise<void> {
        // 没有视频服务器驱动 → 降级为直接切换 input
        if (!this._videoServer) {
            logger.warn('[PlayoutController] No videoServer driver, falling back to input switch')
            if (intent.sourceId) {
                const source = config.sources[intent.sourceId]
                if (source?.switcherName) await (this._switcher as any).setPreview(source.switcherName)
            }
            await this._switcher.take()
            return
        }

        const vs = this._videoServer

        if (vs.capabilities.canPlayVideo) {
            // ── Bitcentral Precis 模式：VDCP 控制播放 ──
            if (!intent.clipId) {
                logger.warn('[PlayoutController] SERVER take: no clipId for canPlayVideo device')
                await this._switcher.take()
                return
            }

            // 选择通道（简化：固定用 A 通道，未来支持 A/B 轮换）
            const channel = 'A'
            await vs.cue(intent.clipId, channel)
            // TODO：等待 CUE/INIT DONE 确认（PORT STATUS 查询，联调时补充）
            await vs.play(channel)

            // 切换台切到对应输入口
            if (intent.sourceId) {
                const source = config.sources[intent.sourceId]
                if (source?.switcherName) await (this._switcher as any).setPreview(source.switcherName)
            }
            await this._switcher.take()
            logger.info(`[PlayoutController] SERVER take (canPlayVideo): clip=${intent.clipId}, channel=${channel}`)

        } else if (vs.capabilities.canPushToDDR) {
            // ── Newscaster 模式：推文件到 DDR ──
            if (!intent.clipId || !vs.pushToDDR) {
                logger.warn('[PlayoutController] SERVER take: canPushToDDR but no clipId or pushToDDR method')
                await this._switcher.take()
                return
            }
            const ddr = 'ddr1'  // 来自 config，联调时从 ddrMapping 读
            await vs.pushToDDR(intent.clipId, ddr)
            await this._switcher.loadClip(intent.clipId, ddr)
            await this._switcher.playDDR(ddr)
            await this._switcher.take()
            logger.info(`[PlayoutController] SERVER take (canPushToDDR): clip=${intent.clipId}, ddr=${ddr}`)

        } else {
            logger.warn('[PlayoutController] SERVER take: videoServer has no playback capability')
            await this._switcher.take()
        }
    }

    // ── LIVE/REMOTE（现场连线）────────────────────────────────────────────────────

    private async _executeLiveTake(intent: PartPlayoutIntent, config: DeviceConfigFile): Promise<void> {
        // LIVE 和 REMOTE 本质上和 KAM 一样：切换到对应 input
        await this._executeKamTake(intent, config)
    }

    // ─── L3RD 时序控制 ────────────────────────────────────────────────────────────

    private _schedulL3rd(l3rdConfig: L3rdConfig, dskLayer: number): void {
        // 取消上一条 L3RD 的残留定时器
        this._cancelL3rd()

        logger.info(`[PlayoutController] L3RD scheduled: delayIn=${l3rdConfig.delayIn}ms, duration=${l3rdConfig.duration}ms, layer=${dskLayer}`)

        this._l3rdOnTimer = setTimeout(async () => {
            await this._switcher.dskOn(dskLayer)
            logger.info(`[PlayoutController] L3RD ON: layer ${dskLayer}`)

            this._l3rdOffTimer = setTimeout(async () => {
                await this._switcher.dskOff(dskLayer)
                logger.info(`[PlayoutController] L3RD OFF: layer ${dskLayer}`)
            }, l3rdConfig.duration)

        }, l3rdConfig.delayIn)
    }

    private _cancelL3rd(): void {
        if (this._l3rdOnTimer) { clearTimeout(this._l3rdOnTimer); this._l3rdOnTimer = null }
        if (this._l3rdOffTimer) { clearTimeout(this._l3rdOffTimer); this._l3rdOffTimer = null }
    }

    // ─── 意图解析 ─────────────────────────────────────────────────────────────────

    private _resolvePartIntent(part: IPart): PartPlayoutIntent {
        const pieces = part.pieces ?? []

        // 主 Piece：index=0，buildPieces 里第一个永远是主媒体
        const mainPiece = pieces[0] ?? null

        // clipId：媒体对象 ID，兜底用文件路径
        // objId 是 Octopus 的媒体资产唯一标识，视频服务器 CUE 用这个
        const clipId: string | null =
            mainPiece?.content?.objId ??
            mainPiece?.content?.filePath ??
            null

        // proxyPath：代理视频 URL，前端缩略图用
        const proxyPath: string | null =
            mainPiece?.content?.proxyPath ?? null

        // sourceId 两层优先级：
        // 1. MOS 数据里的显式机位（联调后从 content.sourceId 读取）
        // 2. device-config.json defaultSources 按 PartType 兜底
        const sourceId: string | null =
            runtimeOverrideStore.get(part._id)?.sourceId ??   // 1. 运行时覆盖
            mainPiece?.content?.sourceId ??                    // 2. MOS 数据
            this._resolveSourceId(part.type)                   // 3. defaultSources 兜底

        // L3RD Piece：sourceLayerId === 'videotext'（INTRO/VIDEOTEXT 类型）
        // 已从 mos-to-rundown.ts resolveSourceLayer() 确认
        const l3rdPiece = pieces.find(p =>
            p.sourceLayerId === 'videotext'
        ) ?? null

        // BUG Piece：暂无对应 sourceLayerId，预留
        const bugPiece = pieces.find(p =>
            p.sourceLayerId === 'bug'
        ) ?? null

        return {
            partId: part._id,
            partType: part.type as PartType,
            sourceId,
            clipId,
            proxyPath,
            l3rdPiece,
            bugPiece,
        }
    }

    // 按 PartType 从 defaultSources 读取兜底逻辑源
    // 联调后如果 MOS 数据能提供 sourceId，此方法只作为最终兜底
    private _resolveSourceId(partType: string): string | null {
        const defaults = this._config?.defaultSources
        if (!defaults) return null
        switch (partType) {
        case PartType.KAM:    return defaults.kam    ?? null
        case PartType.SERVER: return defaults.server ?? null
        case PartType.VO:     return defaults.vo     ?? null
        case PartType.LIVE:   return defaults.live   ?? null
        default:              return null
        }
    }

    // ─── 工具 ─────────────────────────────────────────────────────────────────────

    private _getPart(rundownId: string, partId: string): IPart | null {
        const rundown = rundownStore.getRundown(rundownId)
        if (!rundown?.segments) return null
        for (const seg of rundown.segments) {
            const part = seg.parts?.find(p => p._id === partId)
            if (part) return part
        }
        return null
    }
}

// ─── 全局单例 ──────────────────────────────────────────────────────────────────
// 第五步（device-config.json 落地）之前，直接注入已有的 tricasterDriver 单例
// 第五步完成后，改为从 factory.ts createDriver() 注入

export const playoutController = new PlayoutController(
    tricasterDriver as unknown as ISwitcherDriver,
    null   // videoServer：Bitcentral 驱动 P2 实现后注入
)