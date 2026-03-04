/**
 * @fileoverview RundownStore — 节目单核心状态管理器
 *
 * 设计原则：
 * - 内存为主（毫秒级读写），磁盘为辅（异步持久化）
 * - 所有写操作通过本类方法进行，禁止外部直接修改
 * - 写操作同步完成（内存），持久化异步进行（不阻塞 MOS 回调）
 * - 每次变更通过 EventEmitter 通知订阅者（WebSocket 实时推送）
 * - 严格遵循 MOS 协议 3.6.12 roElementAction 语义
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
} from '../1_mos_connection/internals/model';
import { getMosTypes } from '../1_mos_connection/internals/mosTypes';
import { persistRO, deletePersistedRO, loadAllPersistedROs } from './json-persistence';
import { logger } from '../../shared/logger';

const mosTypes = getMosTypes(false);

// ─── 事件类型 ─────────────────────────────────────────────────────────────────

export interface RundownStoreEvents {
    roCreated:          (roID: string, ro: IMOSRunningOrder) => void;
    roReplaced:         (roID: string, ro: IMOSRunningOrder) => void;
    roDeleted:          (roID: string) => void;
    roMetadataUpdated:  (roID: string) => void;
    roStatusChanged:    (roID: string, status: string) => void;
    roReadyToAirChanged:(roID: string, airStatus: IMOSObjectAirStatus) => void;
    storyChanged:       (roID: string, changeType: string) => void;
    restored:           (count: number) => void;
}

// ─── RundownStore ─────────────────────────────────────────────────────────────

export class RundownStore extends EventEmitter<RundownStoreEvents> {

    private _rundowns: Map<string, IMOSRunningOrder> = new Map();

    // ── 初始化 ────────────────────────────────────────────────────────────────

    async restore(): Promise<void> {
        const persisted = loadAllPersistedROs();
        for (const ro of persisted) {
            const roID = mosTypes.mosString128.stringify(ro.ID!);
            this._rundowns.set(roID, ro);
        }
        logger.info(`[RundownStore] Restored ${persisted.length} RO(s) from disk.`);
        this.emit('restored', persisted.length);
    }

    // ── 只读查询 ──────────────────────────────────────────────────────────────

    getAllRundowns(): IMOSRunningOrder[] {
        return Array.from(this._rundowns.values()).map(ro =>
            JSON.parse(JSON.stringify(ro))
        );
    }

    getRundown(roID: string): IMOSRunningOrder | undefined {
        const ro = this._rundowns.get(roID);
        return ro ? JSON.parse(JSON.stringify(ro)) : undefined;
    }

    get count(): number { return this._rundowns.size; }

    getAllIDs(): string[] { return Array.from(this._rundowns.keys()); }

    getAllRunningOrdersForNCS(): IMOSRunningOrder[] { return this.getAllRundowns(); }

    // ── RO 级别操作 ───────────────────────────────────────────────────────────

    handleCreateRunningOrder(ro: IMOSRunningOrder): void {
        const roID = mosTypes.mosString128.stringify(ro.ID!);
        if (this._rundowns.has(roID)) {
            logger.warn(`[RundownStore] roCreate: "${roID}" already exists, overwriting.`);
        }
        this._rundowns.set(roID, ro);
        persistRO(ro);
        logger.info(`[RundownStore] Created RO: "${roID}" "${mosTypes.mosString128.stringify(ro.Slug)}", stories: ${ro.Stories.length}`);
        this.emit('roCreated', roID, ro);
    }

    handleReplaceRunningOrder(ro: IMOSRunningOrder): void {
        const roID = mosTypes.mosString128.stringify(ro.ID!);
        if (!this._rundowns.has(roID)) {
            logger.warn(`[RundownStore] roReplace: "${roID}" not found, creating.`);
        }
        this._rundowns.set(roID, ro);
        persistRO(ro);
        logger.info(`[RundownStore] Replaced RO: "${roID}", stories: ${ro.Stories.length}`);
        this.emit('roReplaced', roID, ro);
    }

    handleDeleteRunningOrder(roID: string): void {
        if (!this._rundowns.has(roID)) {
            logger.warn(`[RundownStore] roDelete: "${roID}" not found, ignoring.`);
            return;
        }
        this._rundowns.delete(roID);
        deletePersistedRO(roID);
        logger.info(`[RundownStore] Deleted RO: "${roID}"`);
        this.emit('roDeleted', roID);
    }

    handleMetadataReplace(roBase: IMOSRunningOrderBase): void {
        const roID = mosTypes.mosString128.stringify(roBase.ID);
        const existing = this._rundowns.get(roID);
        if (!existing) {
            logger.warn(`[RundownStore] roMetadataReplace: "${roID}" not found.`);
            return;
        }
        const updated: IMOSRunningOrder = {
            ...existing,
            Slug:               roBase.Slug,
            DefaultChannel:     roBase.DefaultChannel,
            EditorialStart:     roBase.EditorialStart,
            EditorialDuration:  roBase.EditorialDuration,
            Trigger:            roBase.Trigger,
            MacroIn:            roBase.MacroIn,
            MacroOut:           roBase.MacroOut,
            MosExternalMetaData: roBase.MosExternalMetaData,
        };
        this._rundowns.set(roID, updated);
        persistRO(updated);
        logger.info(`[RundownStore] Metadata updated: "${roID}"`);
        this.emit('roMetadataUpdated', roID);
    }

    handleRunningOrderStatus(status: IMOSRunningOrderStatus): void {
        const roID = mosTypes.mosString128.stringify(status.ID);
        logger.info(`[RundownStore] RO status: "${roID}" → ${status.Status}`);
        this.emit('roStatusChanged', roID, status.Status);
        // 播出状态为实时信息，不持久化，重启后由 NCS 重新推送
    }

    handleReadyToAir(data: IMOSROReadyToAir): void {
        const roID = mosTypes.mosString128.stringify(data.ID);
        logger.info(`[RundownStore] Ready-to-air: "${roID}" → ${data.Status}`);
        this.emit('roReadyToAirChanged', roID, data.Status);
    }

    handleStoryStatus(status: IMOSStoryStatus): void {
        const roID    = mosTypes.mosString128.stringify(status.RunningOrderId);
        const storyID = mosTypes.mosString128.stringify(status.ID);
        logger.debug(`[RundownStore] Story status: "${roID}"/"${storyID}" → ${status.Status}`);
        this.emit('storyChanged', roID, 'status');
    }

    handleItemStatus(status: IMOSItemStatus): void {
        const roID    = mosTypes.mosString128.stringify(status.RunningOrderId);
        const storyID = mosTypes.mosString128.stringify(status.StoryId);
        const itemID  = mosTypes.mosString128.stringify(status.ID);
        logger.debug(`[RundownStore] Item status: "${roID}"/"${storyID}"/"${itemID}" → ${status.Status}`);
    }

    // ── Story 级别操作（MOS 3.6.12 roElementAction）──────────────────────────
    //
    // INSERT：element_target.storyID = 插入到此 story 之前（找不到则追加末尾）
    // REPLACE：element_target.storyID = 被替换的 story
    // MOVE：element_target.storyID = 移动到此 story 之前（找不到则追加末尾）
    // DELETE：无 element_target，直接删除 source 里的 storyID
    // SWAP：无 element_target，交换 source 里的两个 storyID

    handleROInsertStories(action: IMOSStoryAction, stories: IMOSROStory[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro   = this._getRundownOrWarn(roID, 'roInsertStories');
        if (!ro) return;

        const insertBeforeID = mosTypes.mosString128.stringify(action.StoryID);
        const insertIdx = this._findInsertBeforeIdx(
            ro.Stories, s => mosTypes.mosString128.stringify(s.ID), insertBeforeID, roID, 'roInsertStories'
        );

        ro.Stories.splice(insertIdx, 0, ...stories);
        persistRO(ro);
        logger.info(`[RundownStore] Inserted ${stories.length} story(s) before "${insertBeforeID}" in "${roID}"`);
        this.emit('storyChanged', roID, 'insert');
    }

    handleROReplaceStories(action: IMOSStoryAction, stories: IMOSROStory[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro   = this._getRundownOrWarn(roID, 'roReplaceStories');
        if (!ro) return;

        const targetID = mosTypes.mosString128.stringify(action.StoryID);
        const idx = ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === targetID);
        if (idx === -1) {
            logger.warn(`[RundownStore] roReplaceStories: target story "${targetID}" not found in "${roID}"`);
            return;
        }

        ro.Stories.splice(idx, 1, ...stories);
        persistRO(ro);
        logger.info(`[RundownStore] Replaced story "${targetID}" with ${stories.length} story(s) in "${roID}"`);
        this.emit('storyChanged', roID, 'replace');
    }

    handleROMoveStories(action: IMOSStoryAction, storyIDs: string[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro   = this._getRundownOrWarn(roID, 'roMoveStories');
        if (!ro) return;

        const insertBeforeID = mosTypes.mosString128.stringify(action.StoryID);

        // 提取（保持相对顺序）→ 删除 → 重新插入
        const toMove = ro.Stories.filter(s => storyIDs.includes(mosTypes.mosString128.stringify(s.ID)));
        if (toMove.length !== storyIDs.length) {
            logger.warn(`[RundownStore] roMoveStories: ${storyIDs.length - toMove.length} story(s) not found in "${roID}"`);
        }
        ro.Stories = ro.Stories.filter(s => !storyIDs.includes(mosTypes.mosString128.stringify(s.ID)));

        const insertIdx = this._findInsertBeforeIdx(
            ro.Stories, s => mosTypes.mosString128.stringify(s.ID), insertBeforeID, roID, 'roMoveStories'
        );
        ro.Stories.splice(insertIdx, 0, ...toMove);
        persistRO(ro);
        logger.info(`[RundownStore] Moved ${toMove.length} story(s) before "${insertBeforeID}" in "${roID}"`);
        this.emit('storyChanged', roID, 'move');
    }

    handleRODeleteStories(action: IMOSROAction, storyIDs: string[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro   = this._getRundownOrWarn(roID, 'roDeleteStories');
        if (!ro) return;

        const before = ro.Stories.length;
        ro.Stories = ro.Stories.filter(s => !storyIDs.includes(mosTypes.mosString128.stringify(s.ID)));
        const deleted = before - ro.Stories.length;

        if (deleted !== storyIDs.length) {
            logger.warn(`[RundownStore] roDeleteStories: requested ${storyIDs.length}, deleted ${deleted} in "${roID}"`);
        }
        persistRO(ro);
        logger.info(`[RundownStore] Deleted ${deleted} story(s) from "${roID}"`);
        this.emit('storyChanged', roID, 'delete');
    }

    handleROSwapStories(action: IMOSROAction, storyID0: string, storyID1: string): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro   = this._getRundownOrWarn(roID, 'roSwapStories');
        if (!ro) return;

        const idx0 = ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === storyID0);
        const idx1 = ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === storyID1);

        if (idx0 === -1 || idx1 === -1) {
            logger.warn(`[RundownStore] roSwapStories: story not found in "${roID}" (${storyID0}, ${storyID1})`);
            return;
        }
        [ro.Stories[idx0], ro.Stories[idx1]] = [ro.Stories[idx1], ro.Stories[idx0]];
        persistRO(ro);
        logger.info(`[RundownStore] Swapped stories "${storyID0}" ↔ "${storyID1}" in "${roID}"`);
        this.emit('storyChanged', roID, 'swap');
    }

    // ── Item 级别操作（MOS 3.6.12 roElementAction）───────────────────────────
    //
    // INSERT：element_target.storyID + itemID = 所在 story 及插入到此 item 之前
    // REPLACE：element_target.storyID + itemID = 所在 story 及被替换的 item
    // MOVE：element_target.storyID + itemID = 所在 story 及移动到此 item 之前
    // DELETE：element_target.storyID = 包含这些 item 的 story（action 为 IMOSStoryAction）
    // SWAP：element_target.storyID = 包含这两个 item 的 story（action 为 IMOSStoryAction）

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
        persistRO(ro);
        logger.info(`[RundownStore] Inserted ${items.length} item(s) before "${insertBeforeID}" in story "${storyID}"`);
        this.emit('storyChanged', roID, 'itemInsert');
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
            logger.warn(`[RundownStore] roReplaceItems: target item "${targetID}" not found in story "${storyID}"`);
            return;
        }

        story.Items.splice(idx, 1, ...items);
        persistRO(ro);
        logger.info(`[RundownStore] Replaced item "${targetID}" with ${items.length} item(s) in story "${storyID}"`);
        this.emit('storyChanged', roID, 'itemReplace');
    }

    handleROMoveItems(action: IMOSItemAction, itemIDs: string[]): void {
        const roID    = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const story   = this._getStoryOrWarn(roID, storyID, 'roMoveItems');
        if (!story) return;

        const ro = this._rundowns.get(roID)!;
        const insertBeforeID = mosTypes.mosString128.stringify(action.ItemID);

        const toMove = story.Items.filter(i => itemIDs.includes(mosTypes.mosString128.stringify(i.ID)));
        if (toMove.length !== itemIDs.length) {
            logger.warn(`[RundownStore] roMoveItems: ${itemIDs.length - toMove.length} item(s) not found in story "${storyID}"`);
        }
        story.Items = story.Items.filter(i => !itemIDs.includes(mosTypes.mosString128.stringify(i.ID)));

        const insertIdx = this._findInsertBeforeIdx(
            story.Items, i => mosTypes.mosString128.stringify(i.ID), insertBeforeID, storyID, 'roMoveItems'
        );
        story.Items.splice(insertIdx, 0, ...toMove);
        persistRO(ro);
        logger.info(`[RundownStore] Moved ${toMove.length} item(s) before "${insertBeforeID}" in story "${storyID}"`);
        this.emit('storyChanged', roID, 'itemMove');
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

        if (deleted !== itemIDs.length) {
            logger.warn(`[RundownStore] roDeleteItems: requested ${itemIDs.length}, deleted ${deleted} in story "${storyID}"`);
        }
        persistRO(ro);
        logger.info(`[RundownStore] Deleted ${deleted} item(s) from story "${storyID}"`);
        this.emit('storyChanged', roID, 'itemDelete');
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
            logger.warn(`[RundownStore] roSwapItems: item not found in story "${storyID}" (${itemID0}, ${itemID1})`);
            return;
        }
        [story.Items[idx0], story.Items[idx1]] = [story.Items[idx1], story.Items[idx0]];
        persistRO(ro);
        logger.info(`[RundownStore] Swapped items "${itemID0}" ↔ "${itemID1}" in story "${storyID}"`);
        this.emit('storyChanged', roID, 'itemSwap');
    }

    // ── Profile 4 ─────────────────────────────────────────────────────────────

    handleRunningOrderStory(story: IMOSROFullStory): void {
        const roID    = mosTypes.mosString128.stringify(story.RunningOrderId);
        const storyID = mosTypes.mosString128.stringify(story.ID);
        logger.info(`[RundownStore] Full story received: "${roID}"/"${storyID}", body: ${story.Body.length} items`);
        this.emit('storyChanged', roID, 'fullStory');
    }

    // ── 私有工具方法 ──────────────────────────────────────────────────────────

    /**
     * 查找"插入到此元素之前"的索引。
     * MOS 协议语义：element_target 指定的是目标位置的元素，插入在其前面。
     * 如果找不到目标元素，追加到末尾并记录警告。
     */
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
            logger.warn(`[RundownStore] ${op}: target "${insertBeforeID}" not found in "${contextID}", appending to end.`);
            return arr.length;
        }
        return idx; // 插入到目标之前，即目标的当前位置
    }

    private _getRundownOrWarn(roID: string, op: string): IMOSRunningOrder | undefined {
        const ro = this._rundowns.get(roID);
        if (!ro) logger.warn(`[RundownStore] ${op}: RO "${roID}" not found.`);
        return ro;
    }

    private _getStoryOrWarn(roID: string, storyID: string, op: string): IMOSROStory | undefined {
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] ${op}: RO "${roID}" not found.`); return undefined; }
        const story = ro.Stories.find(s => mosTypes.mosString128.stringify(s.ID) === storyID);
        if (!story) logger.warn(`[RundownStore] ${op}: story "${storyID}" not found in RO "${roID}".`);
        return story;
    }
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const rundownStore = new RundownStore();