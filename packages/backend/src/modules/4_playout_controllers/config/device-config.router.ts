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
import fs from 'fs'
import path from 'path'
import { config } from '../../../shared/config'
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
        const switcherStatus = tricasterDriver.connectionStatus
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
        const status = tricasterDriver.connectionStatus
        res.json({ ok: status === 'CONNECTED', status })
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

// ── GET /api/device/inputs ────────────────────────────────────────────────────
// 返回 Tricaster 所有已知输入槽位，标注哪些已在 sources 中配置
deviceConfigRouter.get('/device/inputs', (_req: Request, res: Response) => {
    try {
        const slots = tricasterDriver.getSwitcherSlots()
        const config = deviceConfigService.getConfig()

        const result = [...slots.entries()].map(([id, slot]) => ({
            id,
            switcherName:  slot.switcherName,
            previewSrc:    slot.previewSrc,
            physicalInput: slot.physicalInput,
            configured:    id in config.sources,
        }))

        res.json({ slots: result })
    } catch (err: any) {
        logger.error(`[DeviceConfigRouter] GET /device/inputs error: ${err.message}`)
        res.status(500).json({ error: err.message })
    }
})

// ── GET /api/files/browse ─────────────────────────────────────────────────────
// 浏览目录内容，path 参数为目录路径
deviceConfigRouter.get('/files/browse', (req: Request, res: Response) => {
    const dirPath = req.query['path'] as string

    // 没有传 path，返回系统根目录列表
    // Windows: 各磁盘根目录；其他系统: /
    if (!dirPath) {
        if (process.platform === 'win32') {
            // 返回所有盘符
            const drives = ['C:\\', 'D:\\', 'E:\\', 'F:\\', 'G:\\', 'Z:\\']
                .filter(d => { try { fs.accessSync(d); return true } catch { return false } })
                .map(d => ({ name: d, fullPath: d, isDirectory: true }))
            res.json({ entries: drives, current: '' })
        } else {
            res.json({ entries: [{ name: '/', fullPath: '/', isDirectory: true }], current: '' })
        }
        return
    }

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
            .map(entry => ({
                name: entry.name,
                fullPath: path.join(dirPath, entry.name),
                isDirectory: entry.isDirectory(),
            }))
            .sort((a, b) => {
                // 目录排前面，同类按名称排序
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
                return a.name.localeCompare(b.name)
            })

        const parent = path.dirname(dirPath)
        res.json({
            entries,
            current: dirPath,
            parent: parent !== dirPath ? parent : null, // 到根目录时 parent 为 null
        })
    } catch (err: any) {
        res.status(400).json({ error: err.message })
    }
})

// ── POST /api/ddr/load ────────────────────────────────────────────────────────
// 把文件推送到指定 DDR 通道
deviceConfigRouter.post('/ddr/load', async (req: Request, res: Response) => {
    const { channel, filePath } = req.body as { channel: string; filePath: string }

    if (!channel || !filePath) {
        res.status(400).json({ error: 'channel and filePath required' })
        return
    }

    // channel 格式：'ddr1' | 'ddr2' | 'ddr3' | 'ddr4'
    const shortcutName = `${channel}_add_clips`
    const tricasterHost = config.tricasterHost

    try {
        const url = `http://${tricasterHost}/v1/shortcut?name=${shortcutName}&value=${encodeURIComponent(filePath)}`
        const res2 = await fetch(url)
        if (!res2.ok) {
            res.status(502).json({ error: `Tricaster responded ${res2.status}` })
            return
        }
        logger.info(`[DDR] Loaded "${filePath}" into ${channel}`)
        res.json({ ok: true })
    } catch (err: any) {
        logger.error(`[DDR] Failed to load clip: ${err.message}`)
        res.status(500).json({ error: err.message })
    }
})