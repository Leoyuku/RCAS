/**
 * @fileoverview RuntimePersistence — 播出运行时快照持久化
 *
 * 职责：
 * - 将 RundownRuntime + PartInstances 序列化到磁盘
 * - 服务重启时自动恢复，不需要导播手动重建直播状态
 *
 * 对应规范 1.3 可重建性原则：
 *   "在任何时刻，删除所有运行时状态，仅保留 Rundown 数据和 CurrentTime，
 *    重启系统后必须能毫秒级精确恢复到正确的播出状态。"
 *
 * 文件路径：data/runtime/runtime-snapshot.json
 */

import * as fs   from 'fs'
import * as path from 'path'
import { logger } from '../../../shared/logger'
import type { RundownRuntime } from '../../../../../core-lib/src/socket/socket-contracts'
import type { IPartInstance }  from '../../../../../core-lib/src/models/part-instance-model'

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const RUNTIME_DIR      = path.resolve(process.cwd(), 'data', 'runtime')
const SNAPSHOT_FILE    = path.join(RUNTIME_DIR, 'runtime-snapshot.json')
const WRITE_DEBOUNCE_MS = 300

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface RuntimeSnapshot {
    version:        number
    savedAt:        string
    runtime:        RundownRuntime
    partInstances:  SerializedPartInstance[]
}

interface SerializedPartInstance {
    instanceId:  string
    rundownId:   string
    partId:      string      // 只存 partId，恢复时从 RundownStore 重新查找 Part 对象
    startTime:   number
    endTime?:    number
    ended:       boolean
    isPreview?:  boolean
}

// ─── 内部状态 ─────────────────────────────────────────────────────────────────

let _writeTimer: NodeJS.Timeout | null = null

// ─── 公开 API ─────────────────────────────────────────────────────────────────

/**
 * 保存运行时快照（防抖 300ms）
 */
export function saveRuntimeSnapshot(
    runtime:       RundownRuntime,
    partInstances: IPartInstance[]
): void {
    if (_writeTimer) clearTimeout(_writeTimer)

    // 深拷贝防止数据在定时器触发前被修改
    const runtimeSnap    = JSON.parse(JSON.stringify(runtime))   as RundownRuntime
    const instancesSnap  = partInstances.map(serializeInstance)

    _writeTimer = setTimeout(() => {
        _writeTimer = null
        _writeSnapshotToDisk(runtimeSnap, instancesSnap)
    }, WRITE_DEBOUNCE_MS)
}

/**
 * 清除运行时快照（Rundown 结束/删除时调用）
 */
export function clearRuntimeSnapshot(): void {
    if (_writeTimer) {
        clearTimeout(_writeTimer)
        _writeTimer = null
    }
    try {
        if (fs.existsSync(SNAPSHOT_FILE)) {
            fs.unlinkSync(SNAPSHOT_FILE)
            logger.info('[RuntimePersistence] Snapshot cleared.')
        }
    } catch (err: any) {
        logger.warn(`[RuntimePersistence] Failed to clear snapshot: ${err.message}`)
    }
}

/**
 * 启动时加载快照
 * 返回 null 表示没有快照或快照无效
 */
export function loadRuntimeSnapshot(): RuntimeSnapshot | null {
    if (!fs.existsSync(SNAPSHOT_FILE)) return null

    try {
        const raw      = fs.readFileSync(SNAPSHOT_FILE, 'utf8')
        const snapshot = JSON.parse(raw) as RuntimeSnapshot

        if (snapshot.version !== 1) {
            logger.warn(`[RuntimePersistence] Snapshot version mismatch, ignoring.`)
            return null
        }

        logger.info(`[RuntimePersistence] Snapshot found: rundown "${snapshot.runtime.rundownId}", saved ${snapshot.savedAt}`)
        return snapshot
    } catch (err: any) {
        logger.warn(`[RuntimePersistence] Failed to load snapshot: ${err.message}`)
        return null
    }
}

// ─── 内部实现 ─────────────────────────────────────────────────────────────────

function serializeInstance(i: IPartInstance): SerializedPartInstance {
    return {
        instanceId: i.instanceId,
        rundownId:  i.rundownId,
        partId:     i.part._id as string,
        startTime:  i.startTime,
        endTime:    i.endTime,
        ended:      i.ended,
        isPreview:  (i as any).isPreview,
    }
}

function _writeSnapshotToDisk(
    runtime:      RundownRuntime,
    instances:    SerializedPartInstance[]
): void {
    try {
        if (!fs.existsSync(RUNTIME_DIR)) {
            fs.mkdirSync(RUNTIME_DIR, { recursive: true })
        }
        const snapshot: RuntimeSnapshot = {
            version:       1,
            savedAt:       new Date().toISOString(),
            runtime,
            partInstances: instances,
        }
        fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf8')
        logger.debug(`[RuntimePersistence] Snapshot saved: engine=${runtime.engineState}`)
    } catch (err: any) {
        logger.error(`[RuntimePersistence] Failed to write snapshot: ${err.message}`)
    }
}