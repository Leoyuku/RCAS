/**
 * @fileoverview MosCache — MOS 协议状态缓冲
 *
 * 职责（仅此而已）：
 * - 维护来自 NCS 的 IMOSRunningOrder 原始数据
 * - 执行所有 MOS 协议语义操作（insert/replace/move/delete/swap）
 * - 每次变更通过 EventEmitter 向下游发出事件
 *
 * 不负责：
 * - 对外暴露数据查询（外部不应直接读取 MOS 原始对象）
 * - 持久化（持久化由下游 RundownStore 负责）
 * - Socket.io 推送（推送由下游 RundownStore 负责）
 *
 * 下游：2_ingest/mos-to-rundown.ts 监听本类事件，转换为 IRundown
 */

import { EventEmitter } from 'eventemitter3';
import {
    IMOSRunningOrder,
    IMOSRunningOrderBase,
    IMOSRunningOrderStatus,
    IMOSStoryStatus,
    IMOSItemStatus,
    IMOSROReadyToAir,
    IMOSStoryAction,
    IMOSROStory,
    IMOSItemAction,
    IMOSItem,
    IMOSROAction,
    IMOSROFullStory,
    IMOSObjectAirStatus,
} from '../../1_mos_connection/internals/model';
import { getMosTypes } from '../../1_mos_connection/internals/mosTypes';
import { logger } from '../../../shared/logger';
import { AnyXMLValue } from '../../1_mos_connection/internals/xmlParse';

const mosTypes = getMosTypes(false);

// ─── 事件类型 ─────────────────────────────────────────────────────────────────

export interface MosCacheEvents {
    roCreated:           (roID: string, ro: IMOSRunningOrder) => void;
    roReplaced:          (roID: string, ro: IMOSRunningOrder) => void;
    roDeleted:           (roID: string) => void;
    roMetadataUpdated:   (roID: string, ro: IMOSRunningOrder) => void;
    roStatusChanged:     (roID: string, status: string) => void;
    roReadyToAirChanged: (roID: string, airStatus: IMOSObjectAirStatus) => void;
    storyChanged:        (roID: string, changeType: string, ro: IMOSRunningOrder) => void;
    restored:            (count: number) => void;
}

// ─── MosCache ─────────────────────────────────────────────────────────────────

export class MosCache extends EventEmitter<MosCacheEvents> {

    private _rundowns: Map<string, IMOSRunningOrder> = new Map();

    // ── 内部查询（仅供本类使用） ──────────────────────────────────────────────

    /** 供 mos-connection 在 roReq 回调时查询 */
    getRundown(roID: string): IMOSRunningOrder | undefined {
        const ro = this._rundowns.get(roID);
        return ro ? JSON.parse(JSON.stringify(ro)) : undefined;
    }

    getAllRundowns(): IMOSRunningOrder[] {
        return Array.from(this._rundowns.values()).map(ro =>
            JSON.parse(JSON.stringify(ro))
        );
    }

    get count(): number { return this._rundowns.size; }

    getAllIDs(): string[] { return Array.from(this._rundowns.keys()); }

    // ── 启动恢复 ──────────────────────────────────────────────────────────────

    restore(ros: IMOSRunningOrder[]): void {
        for (const ro of ros) {
            const roID = mosTypes.mosString128.stringify(ro.ID!);
            this._rundowns.set(roID, ro);
        }
        logger.info(`[MosCache] Restored ${ros.length} RO(s).`);
        this.emit('restored', ros.length);
    }

    // ── RO 级别操作 ───────────────────────────────────────────────────────────

    handleCreateRunningOrder(ro: IMOSRunningOrder): void {
        const roID = mosTypes.mosString128.stringify(ro.ID!);
        if (this._rundowns.has(roID)) {
            logger.warn(`[MosCache] roCreate: "${roID}" already exists, overwriting.`);
        }
        this._rundowns.set(roID, ro);
        logger.info(`[MosCache] Created RO: "${roID}" "${mosTypes.mosString128.stringify(ro.Slug)}", stories: ${ro.Stories.length}`);
        this.emit('roCreated', roID, JSON.parse(JSON.stringify(ro)));
    }

    handleReplaceRunningOrder(ro: IMOSRunningOrder): void {
        const roID = mosTypes.mosString128.stringify(ro.ID!);
        if (!this._rundowns.has(roID)) {
            logger.warn(`[MosCache] roReplace: "${roID}" not found, creating instead.`);
        }
        this._rundowns.set(roID, ro);
        logger.info(`[MosCache] Replaced RO: "${roID}", stories: ${ro.Stories.length}`);
        this.emit('roReplaced', roID, JSON.parse(JSON.stringify(ro)));
    }

    handleDeleteRunningOrder(roID: string): void {
        if (!this._rundowns.has(roID)) {
            logger.warn(`[MosCache] roDelete: "${roID}" not found.`);
            return;
        }
        this._rundowns.delete(roID);
        logger.info(`[MosCache] Deleted RO: "${roID}"`);
        this.emit('roDeleted', roID);
    }

    handleMetadataReplace(metadata: IMOSRunningOrderBase): void {
        const roID = mosTypes.mosString128.stringify(metadata.ID);
        const ro   = this._getRundownOrWarn(roID, 'roMetadataReplace');
        if (!ro) return;

        ro.Slug                = metadata.Slug;
        ro.EditorialStart      = metadata.EditorialStart;
        ro.EditorialDuration   = metadata.EditorialDuration;
        ro.DefaultChannel      = metadata.DefaultChannel;
        ro.Trigger             = metadata.Trigger;
        ro.MacroIn             = metadata.MacroIn;
        ro.MacroOut            = metadata.MacroOut;
        ro.MosExternalMetaData = metadata.MosExternalMetaData;

        logger.info(`[MosCache] Metadata replaced for RO: "${roID}"`);
        this.emit('roMetadataUpdated', roID, JSON.parse(JSON.stringify(ro)));
    }

    handleRunningOrderStatus(status: IMOSRunningOrderStatus): void {
        const roID = mosTypes.mosString128.stringify(status.ID);
        logger.debug(`[MosCache] RO status: "${roID}" → ${status.Status}`);
        this.emit('roStatusChanged', roID, String(status.Status));
    }

    handleReadyToAir(data: IMOSROReadyToAir): void {
        const roID = mosTypes.mosString128.stringify(data.ID);
        logger.info(`[MosCache] Ready-to-air: "${roID}" → ${data.Status}`);
        this.emit('roReadyToAirChanged', roID, data.Status);
    }

    handleStoryStatus(status: IMOSStoryStatus): void {
        const roID    = mosTypes.mosString128.stringify(status.RunningOrderId);
        const storyID = mosTypes.mosString128.stringify(status.ID);
        logger.debug(`[MosCache] Story status: "${roID}"/"${storyID}" → ${status.Status}`);
        const ro = this._rundowns.get(roID);
        if (ro) this.emit('storyChanged', roID, 'status', JSON.parse(JSON.stringify(ro)));
    }

    handleItemStatus(status: IMOSItemStatus): void {
        const roID    = mosTypes.mosString128.stringify(status.RunningOrderId);
        const storyID = mosTypes.mosString128.stringify(status.StoryId);
        const itemID  = mosTypes.mosString128.stringify(status.ID);
        logger.debug(`[MosCache] Item status: "${roID}"/"${storyID}"/"${itemID}" → ${status.Status}`);
    }

    // ── Story 级别操作 ────────────────────────────────────────────────────────

    handleROInsertStories(action: IMOSStoryAction, stories: IMOSROStory[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro   = this._getRundownOrWarn(roID, 'roInsertStories');
        if (!ro) return;

        const insertBeforeID = mosTypes.mosString128.stringify(action.StoryID);
        const insertIdx = this._findInsertBeforeIdx(
            ro.Stories, s => mosTypes.mosString128.stringify(s.ID), insertBeforeID, roID, 'roInsertStories'
        );
        ro.Stories.splice(insertIdx, 0, ...stories);
        logger.info(`[MosCache] Inserted ${stories.length} story(s) before "${insertBeforeID}" in "${roID}"`);
        this.emit('storyChanged', roID, 'insert', JSON.parse(JSON.stringify(ro)));
    }

    handleROReplaceStories(action: IMOSStoryAction, stories: IMOSROStory[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro   = this._getRundownOrWarn(roID, 'roReplaceStories');
        if (!ro) return;

        const targetID = mosTypes.mosString128.stringify(action.StoryID);
        const idx = ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === targetID);
        if (idx === -1) {
            logger.warn(`[MosCache] roReplaceStories: story "${targetID}" not found in "${roID}"`);
            return;
        }
        ro.Stories.splice(idx, 1, ...stories);
        logger.info(`[MosCache] Replaced story "${targetID}" in "${roID}"`);
        this.emit('storyChanged', roID, 'replace', JSON.parse(JSON.stringify(ro)));
    }

    handleROMoveStories(action: IMOSStoryAction, storyIDs: string[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro   = this._getRundownOrWarn(roID, 'roMoveStories');
        if (!ro) return;

        const moving = ro.Stories.filter(s => storyIDs.includes(mosTypes.mosString128.stringify(s.ID)));
        ro.Stories = ro.Stories.filter(s => !storyIDs.includes(mosTypes.mosString128.stringify(s.ID)));
        const insertBeforeID = mosTypes.mosString128.stringify(action.StoryID);
        const insertIdx = this._findInsertBeforeIdx(
            ro.Stories, s => mosTypes.mosString128.stringify(s.ID), insertBeforeID, roID, 'roMoveStories'
        );
        ro.Stories.splice(insertIdx, 0, ...moving);
        logger.info(`[MosCache] Moved ${storyIDs.length} story(s) before "${insertBeforeID}" in "${roID}"`);
        this.emit('storyChanged', roID, 'move', JSON.parse(JSON.stringify(ro)));
    }

    handleRODeleteStories(action: IMOSROAction, storyIDs: string[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro   = this._getRundownOrWarn(roID, 'roDeleteStories');
        if (!ro) return;

        const before = ro.Stories.length;
        ro.Stories = ro.Stories.filter(s => !storyIDs.includes(mosTypes.mosString128.stringify(s.ID)));
        const deleted = before - ro.Stories.length;
        logger.info(`[MosCache] Deleted ${deleted} story(s) from "${roID}"`);
        this.emit('storyChanged', roID, 'delete', JSON.parse(JSON.stringify(ro)));
    }

    handleROSwapStories(action: IMOSROAction, storyID0: string, storyID1: string): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro   = this._getRundownOrWarn(roID, 'roSwapStories');
        if (!ro) return;

        const idx0 = ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === storyID0);
        const idx1 = ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === storyID1);
        if (idx0 === -1 || idx1 === -1) {
            logger.warn(`[MosCache] roSwapStories: story not found (${storyID0}, ${storyID1})`);
            return;
        }
        [ro.Stories[idx0], ro.Stories[idx1]] = [ro.Stories[idx1], ro.Stories[idx0]];
        logger.info(`[MosCache] Swapped stories "${storyID0}" ↔ "${storyID1}" in "${roID}"`);
        this.emit('storyChanged', roID, 'swap', JSON.parse(JSON.stringify(ro)));
    }

    // ── Item 级别操作 ─────────────────────────────────────────────────────────

    handleROInsertItems(action: IMOSItemAction, items: IMOSItem[]): void {
        const roID    = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const story   = this._getStoryOrWarn(roID, storyID, 'roInsertItems');
        if (!story) return;

        const ro = this._rundowns.get(roID)!;
        const insertBeforeID = mosTypes.mosString128.stringify(action.ItemID);
        const insertIdx = this._findInsertBeforeIdx(
            story.Items, i => mosTypes.mosString128.stringify(i.ID), insertBeforeID, storyID, 'roInsertItems'
        );
        story.Items.splice(insertIdx, 0, ...items);
        logger.info(`[MosCache] Inserted ${items.length} item(s) in story "${storyID}"`);
        this.emit('storyChanged', roID, 'itemInsert', JSON.parse(JSON.stringify(ro)));
    }

    handleROReplaceItems(action: IMOSItemAction, items: IMOSItem[]): void {
        const roID    = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const story   = this._getStoryOrWarn(roID, storyID, 'roReplaceItems');
        if (!story) return;

        const ro = this._rundowns.get(roID)!;
        const targetID = mosTypes.mosString128.stringify(action.ItemID);
        const idx = story.Items.findIndex(i => mosTypes.mosString128.stringify(i.ID) === targetID);
        if (idx === -1) {
            logger.warn(`[MosCache] roReplaceItems: item "${targetID}" not found in story "${storyID}"`);
            return;
        }
        story.Items.splice(idx, 1, ...items);
        logger.info(`[MosCache] Replaced item "${targetID}" in story "${storyID}"`);
        this.emit('storyChanged', roID, 'itemReplace', JSON.parse(JSON.stringify(ro)));
    }

    handleROMoveItems(action: IMOSItemAction, itemIDs: string[]): void {
        const roID    = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const story   = this._getStoryOrWarn(roID, storyID, 'roMoveItems');
        if (!story) return;

        const ro = this._rundowns.get(roID)!;
        const moving = story.Items.filter(i => itemIDs.includes(mosTypes.mosString128.stringify(i.ID)));
        story.Items = story.Items.filter(i => !itemIDs.includes(mosTypes.mosString128.stringify(i.ID)));
        const insertBeforeID = mosTypes.mosString128.stringify(action.ItemID);
        const insertIdx = this._findInsertBeforeIdx(
            story.Items, i => mosTypes.mosString128.stringify(i.ID), insertBeforeID, storyID, 'roMoveItems'
        );
        story.Items.splice(insertIdx, 0, ...moving);
        logger.info(`[MosCache] Moved ${itemIDs.length} item(s) in story "${storyID}"`);
        this.emit('storyChanged', roID, 'itemMove', JSON.parse(JSON.stringify(ro)));
    }

    handleRODeleteItems(action: IMOSStoryAction, itemIDs: string[]): void {
        const roID    = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const story   = this._getStoryOrWarn(roID, storyID, 'roDeleteItems');
        if (!story) return;

        const ro = this._rundowns.get(roID)!;
        const before = story.Items.length;
        story.Items = story.Items.filter(i => !itemIDs.includes(mosTypes.mosString128.stringify(i.ID)));
        const deleted = before - story.Items.length;
        logger.info(`[MosCache] Deleted ${deleted} item(s) from story "${storyID}"`);
        this.emit('storyChanged', roID, 'itemDelete', JSON.parse(JSON.stringify(ro)));
    }

    handleROSwapItems(action: IMOSStoryAction, itemID0: string, itemID1: string): void {
        const roID    = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const story   = this._getStoryOrWarn(roID, storyID, 'roSwapItems');
        if (!story) return;

        const ro = this._rundowns.get(roID)!;
        const idx0 = story.Items.findIndex(i => mosTypes.mosString128.stringify(i.ID) === itemID0);
        const idx1 = story.Items.findIndex(i => mosTypes.mosString128.stringify(i.ID) === itemID1);
        if (idx0 === -1 || idx1 === -1) {
            logger.warn(`[MosCache] roSwapItems: item not found (${itemID0}, ${itemID1})`);
            return;
        }
        [story.Items[idx0], story.Items[idx1]] = [story.Items[idx1], story.Items[idx0]];
        logger.info(`[MosCache] Swapped items "${itemID0}" ↔ "${itemID1}" in story "${storyID}"`);
        this.emit('storyChanged', roID, 'itemSwap', JSON.parse(JSON.stringify(ro)));
    }

    // ── Profile 4 ─────────────────────────────────────────────────────────────

    handleRunningOrderStory(story: IMOSROFullStory): void {
        const roID    = mosTypes.mosString128.stringify(story.RunningOrderId);
        const storyID = mosTypes.mosString128.stringify(story.ID);
    
        logger.info(`[MosCache] roStorySend: "${roID}"/"${storyID}", body items: ${story.Body.length}`);
    
        const ro = this._rundowns.get(roID);
        if (!ro) {
            logger.warn(`[MosCache] roStorySend: RO "${roID}" not found in cache`);
            return;
        }
    
        const cachedStory = ro.Stories.find(
            s => mosTypes.mosString128.stringify(s.ID) === storyID
        );
        if (!cachedStory) {
            logger.warn(`[MosCache] roStorySend: story "${storyID}" not found in RO "${roID}"`);
            return;
        }
    
        let mergedCount = 0
        let lastStudioItem: IMOSItem | null = null
    
        for (const bodyItem of story.Body) {
            if (bodyItem.itemType === 'storyItem') {
                const fullItem   = bodyItem.Content
                const fullItemID = mosTypes.mosString128.stringify(fullItem.ID)
    
                const cachedItem = cachedStory.Items.find(
                    i => mosTypes.mosString128.stringify(i.ID) === fullItemID
                )
    
                if (!cachedItem) {
                    logger.debug(`[MosCache] roStorySend: item "${fullItemID}" not in cache, appending`)
                    cachedStory.Items.push(fullItem)
                    mergedCount++
                    lastStudioItem = (fullItem.octext_elemType === 'studio') ? fullItem : null
                    continue
                }
    
                // 合并完整数据
                if (fullItem.MosObjects && fullItem.MosObjects.length > 0) {
                    cachedItem.MosObjects = fullItem.MosObjects
                }
                if (fullItem.Paths && fullItem.Paths.length > 0) {
                    cachedItem.Paths = fullItem.Paths
                }
                if (fullItem.EditorialDuration !== undefined) {
                    cachedItem.EditorialDuration = fullItem.EditorialDuration
                }
                if (fullItem.UserTimingDuration !== undefined) {
                    cachedItem.UserTimingDuration = fullItem.UserTimingDuration
                }
                if (fullItem.MosExternalMetaData && fullItem.MosExternalMetaData.length > 0) {
                    cachedItem.MosExternalMetaData = fullItem.MosExternalMetaData
                }
                mergedCount++
    
                // 追踪最近的 studio item，等待后续 <pi> CAM 标注
                lastStudioItem = (cachedItem.octext_elemType === 'studio') ? cachedItem : null
    
            } else {
                // itemType === 'other'：检查 <p><pi>CAM X</pi></p>
                if (bodyItem.Type === 'p' && lastStudioItem) {
                    const camSourceId = extractCamSourceId(bodyItem.Content)
                    if (camSourceId) {
                        lastStudioItem.camSourceId = camSourceId
                        lastStudioItem = null  // 找到后重置，避免重复写入
                    }
                }
            }
        }
    
        logger.info(`[MosCache] roStorySend merged ${mergedCount} item(s) into story "${storyID}"`)
        this.emit('storyChanged', roID, 'fullStory', JSON.parse(JSON.stringify(ro)))
    }

    // ── 私有工具方法 ──────────────────────────────────────────────────────────

    private _findInsertBeforeIdx<T>(
        arr: T[],
        getID: (item: T) => string,
        insertBeforeID: string,
        contextID: string,
        op: string
    ): number {
        if (!insertBeforeID) return arr.length;
        const idx = arr.findIndex(item => getID(item) === insertBeforeID);
        if (idx === -1) {
            logger.warn(`[MosCache] ${op}: target "${insertBeforeID}" not found in "${contextID}", appending to end.`);
            return arr.length;
        }
        return idx;
    }

    private _getRundownOrWarn(roID: string, op: string): IMOSRunningOrder | undefined {
        const ro = this._rundowns.get(roID);
        if (!ro) logger.warn(`[MosCache] ${op}: RO "${roID}" not found.`);
        return ro;
    }

    private _getStoryOrWarn(roID: string, storyID: string, op: string): IMOSROStory | undefined {
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[MosCache] ${op}: RO "${roID}" not found.`); return undefined; }
        const story = ro.Stories.find(s => mosTypes.mosString128.stringify(s.ID) === storyID);
        if (!story) logger.warn(`[MosCache] ${op}: story "${storyID}" not found in RO "${roID}".`);
        return story;
    }
}

// ─── CAM 标注提取 ─────────────────────────────────────────────────────────────

/**
 * 从 <p> 节点的 Content 里提取 <pi>CAM X</pi> 标注。
 * xml2js 解析后结构：{ pi: ['CAM 1'], _: '...' } 或 { pi: 'CAM 1' }
 * 返回标准化的 sourceId，如 'CAM1'、'CAM2'，找不到返回 null。
 */
function extractCamSourceId(content: AnyXMLValue): string | null {
    if (!content) return null

    // ── 情况1：纯字符串（QuickMOS 测试数据，或简单 <p> 文本节点）──
    // 直接从字符串开头匹配 CAM X
    if (typeof content === 'string') {
        const match = content.trim().match(/^CAM\s*(\d+)/i)
        return match ? `CAM${match[1]}` : null
    }

    if (typeof content !== 'object' || Array.isArray(content)) return null
    const obj = content as Record<string, AnyXMLValue>

    // ── 情况2：Sofie 库解析后的文本节点 { $name, $type, text } ──
    // QuickMOS 序列化后的结构，text 字段可能是字符串或对象
    if (obj['text'] !== undefined) {
        const text = obj['text']
        if (typeof text === 'string') {
            const match = text.trim().match(/^CAM\s*(\d+)/i)
            return match ? `CAM${match[1]}` : null
        }
        // text 本身是对象（嵌套的 pi 节点）→ 递归处理
        return extractCamSourceId(text)
    }

    // ── 情况3：xml2js 解析的原始对象 { pi: ['CAM 1'], _: '...' } ──
    // 真实 Octopus TCP 推送解析后可能的结构
    const piRaw = obj['pi']
    if (piRaw) {
        const piStr = Array.isArray(piRaw)
            ? String(piRaw[0] ?? '')
            : String(piRaw)
        const match = piStr.trim().match(/^CAM\s*(\d+)$/i)
        return match ? `CAM${match[1]}` : null
    }

    // ── 情况4：{ $name: 'p', children: [...] } 或其他嵌套结构 ──
    // 遍历所有值，递归查找
    for (const val of Object.values(obj)) {
        if (!val) continue
        const result = extractCamSourceId(val)
        if (result) return result
    }

    return null
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const mosCache = new MosCache();