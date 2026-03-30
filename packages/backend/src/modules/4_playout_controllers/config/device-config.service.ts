/**
 * @fileoverview DeviceConfigService — device-config.json 的读写服务
 *
 * 职责：
 * - 启动时从磁盘加载配置
 * - 提供 getConfig() 给 PlayoutController 使用
 * - 提供 saveConfig() 给 REST API 使用
 * - 配置变更后通知 PlayoutController 热更新
 * - 维护配置历史快照（最近10个手动版本，自动版本保留7天）
 */

import fs from 'fs'
import path from 'path'
import { logger } from '../../../shared/logger'
import type { DeviceConfigFile } from '../interfaces/device-config'

// 配置文件路径：放在 backend 包根目录，和 runtime-snapshot.json 同级
const CONFIG_PATH = path.resolve(__dirname, '../../../../device-config.json')
const HISTORY_DIR = path.resolve(__dirname, '../../../../config-history')

// 变更监听器类型
type ConfigChangeListener = (config: DeviceConfigFile) => void

export class DeviceConfigService {

    private _config: DeviceConfigFile | null = null
    private _listeners: ConfigChangeListener[] = []

    // ── 初始化：从磁盘加载 ────────────────────────────────────────────────────

    load(): DeviceConfigFile {
        try {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
            this._config = JSON.parse(raw) as DeviceConfigFile
            logger.info(`[DeviceConfigService] Loaded from ${CONFIG_PATH}`)
            return this._config
        } catch (err: any) {
            logger.error(`[DeviceConfigService] Failed to load config: ${err.message}`)
            logger.warn('[DeviceConfigService] Using empty fallback config')
            this._config = this._emptyConfig()
            return this._config
        }
    }

    // ── 读取 ──────────────────────────────────────────────────────────────────

    getConfig(): DeviceConfigFile {
        if (!this._config) return this.load()
        return this._config
    }

    // ── 写入 ──────────────────────────────────────────────────────────────────

    saveConfig(next: DeviceConfigFile, note?: string): void {
        // 1. 保存历史快照（写入前先备份当前版本）
        if (this._config) {
            this._saveHistory(this._config, note ?? 'auto')
        }

        // 2. 写入磁盘
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8')
            this._config = next
            logger.info('[DeviceConfigService] Config saved.')
        } catch (err: any) {
            logger.error(`[DeviceConfigService] Failed to save config: ${err.message}`)
            throw err
        }

        // 3. 通知所有监听者（PlayoutController 热更新）
        for (const listener of this._listeners) {
            try { listener(next) } catch { /* 单个监听者失败不影响其他 */ }
        }
    }

    // ── 热更新订阅 ───────────────────────────────────────────────────────────

    onChange(listener: ConfigChangeListener): void {
        this._listeners.push(listener)
    }

    // ── 历史版本 ─────────────────────────────────────────────────────────────

    getHistory(): HistoryEntry[] {
        this._ensureHistoryDir()
        try {
            const files = fs.readdirSync(HISTORY_DIR)
                .filter(f => f.endsWith('.json'))
                .sort()
                .reverse()  // 最新的排前面

            return files.map(f => {
                const filePath = path.join(HISTORY_DIR, f)
                const stat = fs.statSync(filePath)
                // 文件名格式：2026-03-23T14-30-00-auto.json
                const [timestamp, ...noteParts] = f.replace('.json', '').split('_')
                return {
                    id: f.replace('.json', ''),
                    timestamp: stat.mtimeMs,
                    note: noteParts.join('_') || 'auto',
                    filename: f,
                }
            })
        } catch {
            return []
        }
    }

    rollback(historyId: string): DeviceConfigFile {
        const filePath = path.join(HISTORY_DIR, `${historyId}.json`)
        if (!fs.existsSync(filePath)) {
            throw new Error(`History entry "${historyId}" not found`)
        }
        const raw = fs.readFileSync(filePath, 'utf-8')
        const config = JSON.parse(raw) as DeviceConfigFile
        this.saveConfig(config, `rollback-from-${historyId}`)
        return config
    }

    // ── 私有工具 ─────────────────────────────────────────────────────────────

    private _saveHistory(config: DeviceConfigFile, note: string): void {
        this._ensureHistoryDir()
        this._pruneHistory()  // 清理旧版本

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `${timestamp}_${note}.json`
        const filePath = path.join(HISTORY_DIR, filename)

        try {
            fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
            logger.info(`[DeviceConfigService] History saved: ${filename}`)
        } catch (err: any) {
            logger.warn(`[DeviceConfigService] Failed to save history: ${err.message}`)
        }
    }

    private _pruneHistory(): void {
        try {
            const files = fs.readdirSync(HISTORY_DIR)
                .filter(f => f.endsWith('.json'))
                .sort()

            const now = Date.now()
            const sevenDays = 7 * 24 * 60 * 60 * 1000

            // 手动版本（note 不是 'auto'）：保留最近10个
            const manualFiles = files.filter(f => !f.includes('_auto'))
            if (manualFiles.length > 10) {
                manualFiles.slice(0, manualFiles.length - 10).forEach(f => {
                    fs.unlinkSync(path.join(HISTORY_DIR, f))
                })
            }

            // 自动版本：保留7天
            files.filter(f => f.includes('_auto')).forEach(f => {
                const stat = fs.statSync(path.join(HISTORY_DIR, f))
                if (now - stat.mtimeMs > sevenDays) {
                    fs.unlinkSync(path.join(HISTORY_DIR, f))
                }
            })
        } catch (err: any) {
            logger.warn(`[DeviceConfigService] Prune history error: ${err.message}`)
        }
    }

    private _ensureHistoryDir(): void {
        if (!fs.existsSync(HISTORY_DIR)) {
            fs.mkdirSync(HISTORY_DIR, { recursive: true })
        }
    }

    private _emptyConfig(): DeviceConfigFile {
        return {
            activeDevices: {},
            devices: {},
            sources: {},
            defaultSources: {},
            dskMapping: {},
            l3rd: { delayIn: 500, duration: 8000 },
            presets: {},
        }
    }
}

export interface HistoryEntry {
    id: string
    timestamp: number
    note: string
    filename: string
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const deviceConfigService = new DeviceConfigService()