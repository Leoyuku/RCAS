/**
 * @fileoverview Device Config REST API 路由
 *
 * GET  /api/device/config            → 读取当前配置
 * PUT  /api/device/config            → 保存配置（含备注）
 * POST /api/device/active            → 切换激活设备
 * GET  /api/device/status            → 各设备连接状态
 * POST /api/device/test-connection   → 测试单个设备连接
 * GET  /api/config/history           → 版本历史列表
 * POST /api/config/rollback/:id      → 回滚到指定版本
 */

import { Router, Request, Response } from 'express'
import { deviceConfigService } from './device-config.service'
import { playoutController } from '../playout-controller'
import { tricasterDriver } from '../tricaster/tricaster-driver'
import { logger } from '../../../shared/logger'

export const deviceConfigRouter = Router()

// ── GET /api/device/config ────────────────────────────────────────────────────

deviceConfigRouter.get('/device/config', (_req: Request, res: Response) => {
    const config = deviceConfigService.getConfig()
    res.json(config)
})

// ── PUT /api/device/config ────────────────────────────────────────────────────

deviceConfigRouter.put('/device/config', (req: Request, res: Response) => {
    const next = req.body
    const note = req.query['note'] as string | undefined

    // 基础校验：确保结构完整
    if (!next || typeof next !== 'object' || !next.devices || !next.sources) {
        res.status(400).json({ error: 'Invalid config structure' })
        return
    }

    try {
        deviceConfigService.saveConfig(next, note)
        res.json({ ok: true })
    } catch (err: any) {
        logger.error(`[DeviceConfigRouter] PUT /device/config error: ${err.message}`)
        res.status(500).json({ error: err.message })
    }
})

// ── POST /api/device/active ───────────────────────────────────────────────────
// 切换某个角色（switcher / videoServer / vizEngine）使用哪个设备 ID

deviceConfigRouter.post('/device/active', (req: Request, res: Response) => {
    const { role, deviceId } = req.body as { role: string; deviceId: string }

    if (!role || !deviceId) {
        res.status(400).json({ error: 'role and deviceId required' })
        return
    }

    const config = deviceConfigService.getConfig()

    if (!config.devices[deviceId]) {
        res.status(404).json({ error: `Device "${deviceId}" not found in config` })
        return
    }

    const next = {
        ...config,
        activeDevices: { ...config.activeDevices, [role]: deviceId },
    }

    deviceConfigService.saveConfig(next, `switch-active-${role}-to-${deviceId}`)
    res.json({ ok: true, activeDevices: next.activeDevices })
})

// ── GET /api/device/status ────────────────────────────────────────────────────

deviceConfigRouter.get('/device/status', async (_req: Request, res: Response) => {
    try {
        const switcherStatus = await tricasterDriver.getStatus()
        res.json({
            switcher: { status: switcherStatus },
            videoServer: { status: 'disconnected' },  // P2 BitcentralDriver 完成后补充
            vizEngine: { status: 'disconnected' },  // P4 VizEngine 完成后补充
        })
    } catch (err: any) {
        res.status(500).json({ error: err.message })
    }
})

// ── POST /api/device/test-connection ─────────────────────────────────────────

deviceConfigRouter.post('/device/test-connection', async (req: Request, res: Response) => {
    const { deviceId } = req.body as { deviceId: string }
    const config = deviceConfigService.getConfig()
    const device = config.devices[deviceId]

    if (!device) {
        res.status(404).json({ error: `Device "${deviceId}" not found` })
        return
    }

    // 目前只支持测试 Tricaster，其他设备驱动 P2/P4 实现后扩展
    if (device.type === 'tricaster') {
        const status = await tricasterDriver.getStatus()
        res.json({ ok: status === 'connected', status })
        return
    }

    res.json({ ok: false, status: 'not-implemented', message: `Driver for "${device.type}" not yet available` })
})

// ── GET /api/config/history ───────────────────────────────────────────────────

deviceConfigRouter.get('/config/history', (_req: Request, res: Response) => {
    const history = deviceConfigService.getHistory()
    res.json(history)
})

// ── POST /api/config/rollback/:id ─────────────────────────────────────────────

deviceConfigRouter.post('/config/rollback/:id', (req: Request, res: Response) => {
    const id = req.params['id'] as string

    try {
        const config = deviceConfigService.rollback(id)
        res.json({ ok: true, config })
    } catch (err: any) {
        logger.error(`[DeviceConfigRouter] Rollback error: ${err.message}`)
        res.status(404).json({ error: err.message })
    }
})