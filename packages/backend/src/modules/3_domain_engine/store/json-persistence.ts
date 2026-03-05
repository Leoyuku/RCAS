/**
 * @fileoverview JSON 文件持久化层
 *
 * 功能：
 * - 将 RunningOrder 异步写入 JSON 文件（带防抖，防止高频 IO）
 * - 启动时从磁盘恢复全部 RO
 * - 支持即时加载单个 JSON 文件（运维手动导入场景）
 * - 维护 _index.json 索引文件，方便快速查看当前有哪些 RO
 *
 * 文件结构：
 *   data/rundowns/
 *     ├── {safe_roID}.json    每个 RO 单独一个文件
 *     └── _index.json         RO ID 索引（自动维护）
 *
 * JSON 文件格式（SerializedRunningOrder）：
 *   {
 *     "roID":    "string",
 *     "roSlug":  "string",
 *     "savedAt": "ISO 时间戳",
 *     "data":    { ...IMOSRunningOrder 原始数据 }
 *   }
 *
 * 兼容格式：loadSingleROFromFile 同时支持上述格式和裸 IMOSRunningOrder 格式，
 * 方便运维人员手动制作导入文件。
 */

import * as fs   from 'fs';
import * as path from 'path';
import { IMOSRunningOrder } from '../../1_mos_connection/internals/model';
import { getMosTypes }      from '../../1_mos_connection/internals/mosTypes';
import { logger }           from '../../../shared/logger';

const mosTypes = getMosTypes(false);

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const DATA_DIR    = path.resolve(process.cwd(), 'data', 'rundowns');
const INDEX_FILE  = path.join(DATA_DIR, '_index.json');
const WRITE_DEBOUNCE_MS = 500; // 500ms 防抖，合并高频小变更

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type SerializedRunningOrder = {
    roID:    string;
    roSlug:  string;
    savedAt: string;
    data:    object;
};

type IndexFile = {
    version:   number;
    updatedAt: string;
    roIDs:     string[];
};

// ─── 内部状态 ─────────────────────────────────────────────────────────────────

const _writeTimers: Map<string, NodeJS.Timeout> = new Map();

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.info(`[Persistence] Created data directory: ${DATA_DIR}`);
    }
}

function roFilePath(roID: string): string {
    const safeName = roID.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return path.join(DATA_DIR, `${safeName}.json`);
}

// ─── 公开 API ──────────────────────────────────────────────────────────────────

/**
 * 异步持久化单个 RO（防抖）
 * 同一个 RO 在 500ms 内多次变更，只触发一次磁盘写入。
 * 适用于 NCS 高频推送 roReplaceStory 等场景。
 */
export function persistRO(ro: IMOSRunningOrder): void {
    const roID = mosTypes.mosString128.stringify(ro.ID!);

    const existing = _writeTimers.get(roID);
    if (existing) clearTimeout(existing);

    // 深拷贝快照，防止定时器触发时数据已被修改
    const snapshot = JSON.parse(JSON.stringify(ro)) as IMOSRunningOrder;

    const timer = setTimeout(() => {
        _writeTimers.delete(roID);
        _writeROToDisk(roID, snapshot);
    }, WRITE_DEBOUNCE_MS);

    _writeTimers.set(roID, timer);
}

/**
 * 立即删除 RO 的持久化文件
 */
export function deletePersistedRO(roID: string): void {
    // 取消还未触发的写入定时器
    const existing = _writeTimers.get(roID);
    if (existing) {
        clearTimeout(existing);
        _writeTimers.delete(roID);
    }

    const filePath = roFilePath(roID);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info(`[Persistence] Deleted RO file: ${roID}`);
        }
        _updateIndex();
    } catch (err) {
        logger.error(`[Persistence] Failed to delete RO file "${roID}":`, err);
    }
}

/**
 * 启动时从磁盘恢复所有 RO
 */
export function loadAllPersistedROs(): IMOSRunningOrder[] {
    ensureDataDir();
    const results: IMOSRunningOrder[] = [];

    let files: string[];
    try {
        files = fs.readdirSync(DATA_DIR)
            .filter(f => f.endsWith('.json') && !f.startsWith('_'));
    } catch (err) {
        logger.error('[Persistence] Failed to read data directory:', err);
        return results;
    }

    for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        try {
            const raw    = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw) as SerializedRunningOrder;
            const ro     = parsed.data as IMOSRunningOrder;
            results.push(ro);
            logger.info(`[Persistence] Loaded: "${parsed.roID}" ("${parsed.roSlug}"), saved ${parsed.savedAt}`);
        } catch (err) {
            logger.warn(`[Persistence] Failed to load "${file}", skipping:`, err);
        }
    }

    logger.info(`[Persistence] Restored ${results.length} RO(s) from disk.`);
    return results;
}

/**
 * 即时加载单个 JSON 文件（运维手动导入）
 * 支持两种格式：
 *   1. SerializedRunningOrder（系统自动保存的格式）
 *   2. 裸 IMOSRunningOrder（运维手动编写的格式）
 */
export function loadSingleROFromFile(filePath: string): IMOSRunningOrder | null {
    try {
        const raw    = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);

        // 兼容两种格式
        const ro: IMOSRunningOrder = parsed.data ?? parsed;

        if (!ro.ID || !ro.Slug) {
            logger.warn(`[Persistence] File "${filePath}" missing required fields (ID, Slug).`);
            return null;
        }

        const roID = mosTypes.mosString128.stringify(ro.ID);
        logger.info(`[Persistence] Manually loaded RO: "${roID}" from "${filePath}"`);
        return ro;
    } catch (err) {
        logger.error(`[Persistence] Failed to load file "${filePath}":`, err);
        return null;
    }
}

// ─── 内部实现 ─────────────────────────────────────────────────────────────────

function _writeROToDisk(roID: string, ro: IMOSRunningOrder): void {
    ensureDataDir();
    const filePath = roFilePath(roID);
    try {
        const serialized: SerializedRunningOrder = {
            roID,
            roSlug:  mosTypes.mosString128.stringify(ro.Slug),
            savedAt: new Date().toISOString(),
            data:    ro as unknown as object,
        };
        fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2), 'utf8');
        logger.debug(`[Persistence] Written: "${roID}"`);
        _updateIndex();
    } catch (err) {
        logger.error(`[Persistence] Failed to write "${roID}":`, err);
    }
}

function _updateIndex(): void {
    try {
        const files = fs.readdirSync(DATA_DIR)
            .filter(f => f.endsWith('.json') && !f.startsWith('_'));
        const index: IndexFile = {
            version:   1,
            updatedAt: new Date().toISOString(),
            roIDs:     files.map(f => path.basename(f, '.json')),
        };
        fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
    } catch (err) {
        logger.warn('[Persistence] Failed to update index:', err);
    }
}