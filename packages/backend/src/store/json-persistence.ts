/**
 * @fileoverview JSON 文件持久化层
 *
 * 职责：
 * - 将 RunningOrder 数据异步写入 JSON 文件
 * - 启动时从磁盘恢复数据
 * - 支持手动导入单个 JSON 文件（即时加载）
 *
 * 文件结构：
 *   data/rundowns/
 *     ├── {roID}.json        每个 RO 单独一个文件
 *     └── _index.json        所有 RO 的 ID 索引
 */

import * as fs from 'fs';
import * as path from 'path';
import { IMOSRunningOrder } from '../modules/1_mos_connection/internals/model';
import { getMosTypes } from '../modules/1_mos_connection/internals/mosTypes';
import { logger } from './logger';

const mosTypes = getMosTypes(false); // 持久化层用非严格模式，容错优先

// ─── 常量 ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), 'data', 'rundowns');
const INDEX_FILE = path.join(DATA_DIR, '_index.json');

// 写入防抖：同一个 RO 在 500ms 内多次变更，只写一次磁盘
const WRITE_DEBOUNCE_MS = 500;

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 磁盘上存储的 RO 格式（IMOSString128 序列化为普通字符串） */
export type SerializedRunningOrder = {
    roID: string;
    roSlug: string;
    savedAt: string; // ISO 时间戳
    data: object;    // 原始 RO 数据（JSON 可序列化）
};

export type IndexFile = {
    version: number;
    updatedAt: string;
    roIDs: string[];
};

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.info(`[Persistence] Created data directory: ${DATA_DIR}`);
    }
}

function roFilePath(roID: string): string {
    // 文件名中替换非法字符，保留可读性
    const safeName = roID.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return path.join(DATA_DIR, `${safeName}.json`);
}

function serializeRO(ro: IMOSRunningOrder): SerializedRunningOrder {
    const roID = mosTypes.mosString128.stringify(ro.ID!);
    const roSlug = mosTypes.mosString128.stringify(ro.Slug);
    return {
        roID,
        roSlug,
        savedAt: new Date().toISOString(),
        data: ro as unknown as object,
    };
}

// ─── 写入防抖 Map ─────────────────────────────────────────────────────────────

const _writeTimers: Map<string, NodeJS.Timeout> = new Map();

// ─── 公开 API ─────────────────────────────────────────────────────────────────

/**
 * 异步写入单个 RO 到磁盘（带防抖）
 * 在高频更新场景下（如 roReplaceStory 连续推送），
 * 防止每次小变更都触发磁盘 IO。
 */
export function persistRO(ro: IMOSRunningOrder): void {
    const roID = mosTypes.mosString128.stringify(ro.ID!);

    // 清除上一个待写入的定时器
    const existing = _writeTimers.get(roID);
    if (existing) clearTimeout(existing);

    // 深拷贝，避免定时器触发时数据已被修改
    const snapshot = JSON.parse(JSON.stringify(ro)) as IMOSRunningOrder;

    const timer = setTimeout(() => {
        _writeTimers.delete(roID);
        _writeROToDisk(roID, snapshot);
    }, WRITE_DEBOUNCE_MS);

    _writeTimers.set(roID, timer);
}

/**
 * 立即删除某个 RO 的持久化文件
 */
export function deletePersistedRO(roID: string): void {
    const filePath = roFilePath(roID);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info(`[Persistence] Deleted RO file: ${roID}`);
        }
        _updateIndex();
    } catch (err) {
        logger.error(`[Persistence] Failed to delete RO file ${roID}:`, err);
    }
}

/**
 * 从磁盘恢复所有已持久化的 RO
 * 启动时调用，返回所有成功加载的 RO 列表
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
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw) as SerializedRunningOrder;
            const ro = parsed.data as IMOSRunningOrder;
            results.push(ro);
            logger.info(`[Persistence] Loaded RO: ${parsed.roID} (${parsed.roSlug}), saved at ${parsed.savedAt}`);
        } catch (err) {
            logger.warn(`[Persistence] Failed to load RO from ${file}, skipping:`, err);
        }
    }

    logger.info(`[Persistence] Restored ${results.length} RO(s) from disk.`);
    return results;
}

/**
 * 即时加载单个 JSON 文件（手动导入场景）
 * 运维人员将 RO 的 JSON 文件放入 data/rundowns/ 后，
 * 可通过此方法立即加载，无需重启。
 */
export function loadSingleROFromFile(filePath: string): IMOSRunningOrder | null {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);

        // 兼容两种格式：SerializedRunningOrder 或直接的 IMOSRunningOrder
        const ro: IMOSRunningOrder = parsed.data ?? parsed;

        if (!ro.ID || !ro.Slug) {
            logger.warn(`[Persistence] File ${filePath} is missing required fields (ID, Slug), skipping.`);
            return null;
        }

        const roID = mosTypes.mosString128.stringify(ro.ID);
        logger.info(`[Persistence] Manually loaded RO: ${roID} from ${filePath}`);
        return ro;
    } catch (err) {
        logger.error(`[Persistence] Failed to load file ${filePath}:`, err);
        return null;
    }
}

// ─── 内部实现 ─────────────────────────────────────────────────────────────────

function _writeROToDisk(roID: string, ro: IMOSRunningOrder): void {
    ensureDataDir();
    const filePath = roFilePath(roID);

    try {
        const serialized = serializeRO(ro);
        fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2), 'utf8');
        logger.debug(`[Persistence] Written RO to disk: ${roID}`);
        _updateIndex();
    } catch (err) {
        logger.error(`[Persistence] Failed to write RO ${roID} to disk:`, err);
    }
}

function _updateIndex(): void {
    try {
        const files = fs.readdirSync(DATA_DIR)
            .filter(f => f.endsWith('.json') && !f.startsWith('_'));

        const roIDs = files.map(f => path.basename(f, '.json'));
        const index: IndexFile = {
            version: 1,
            updatedAt: new Date().toISOString(),
            roIDs,
        };
        fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
    } catch (err) {
        logger.warn('[Persistence] Failed to update index file:', err);
    }
}