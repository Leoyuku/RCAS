/**
 * @fileoverview RundownStore — 核心状态管理器
 *
 * 职责：
 * - 内存中维护所有 Running Order 的完整状态
 * - 处理来自 NCS 的所有 MOS Profile 2 消息（增删改）
 * - 每次状态变更后异步持久化到 JSON 文件
 * - 启动时从持久化文件恢复状态
 * - 对外提供只读查询接口（供 REST API、WebSocket 使用）
 *
 * 设计原则：
 * - 所有写操作必须通过本类方法进行，禁止外部直接修改内存数据
 * - 写操作同步完成（内存），持久化异步进行（磁盘），不阻塞 MOS 回调
 * - 每个写操作都通过 EventEmitter 通知外部订阅者（如 WebSocket 推送）
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
} from '../modules/1_mos_connection/internals/model';
import { getMosTypes } from '../modules/1_mos_connection/internals/mosTypes';
import {
    persistRO,
    deletePersistedRO,
    loadAllPersistedROs,
} from './json-persistence';
import { logger } from './logger';

const mosTypes = getMosTypes(false);

// ─── 事件类型定义 ────────────────────────────────────────────────────────────

export interface RundownStoreEvents {
    /** RO 被创建 */
    roCreated: (roID: string, ro: IMOSRunningOrder) => void;
    /** RO 被替换（完整更新） */
    roReplaced: (roID: string, ro: IMOSRunningOrder) => void;
    /** RO 被删除 */
    roDeleted: (roID: string) => void;
    /** RO 元数据更新 */
    roMetadataUpdated: (roID: string) => void;
    /** RO 播出状态变更 */
    roStatusChanged: (roID: string, status: string) => void;
    /** RO 上播状态变更 */
    roReadyToAirChanged: (roID: string, airStatus: IMOSObjectAirStatus) => void;
    /** Story 层面变更 */
    storyChanged: (roID: string, changeType: string) => void;
    /** 从磁盘恢复完成 */
    restored: (count: number) => void;
}

// ─── RundownStore 类 ──────────────────────────────────────────────────────────

export class RundownStore extends EventEmitter<RundownStoreEvents> {

    /** 主存储：roID → IMOSRunningOrder */
    private _rundowns: Map<string, IMOSRunningOrder> = new Map();

    // ── 初始化 ────────────────────────────────────────────────────────────────

    /**
     * 从磁盘恢复持久化数据
     * 在 MOS 连接建立之前调用，确保 NCS 推送时数据层已就绪
     */
    async restore(): Promise<void> {
        const persisted = loadAllPersistedROs();
        for (const ro of persisted) {
            const roID = mosTypes.mosString128.stringify(ro.ID!);
            this._rundowns.set(roID, ro);
        }
        logger.info(`[RundownStore] Restored ${persisted.length} RO(s) from disk.`);
        this.emit('restored', persisted.length);
    }

    // ── 查询接口（只读） ──────────────────────────────────────────────────────

    /** 获取所有 RO（返回副本，防止外部修改） */
    getAllRundowns(): IMOSRunningOrder[] {
        return Array.from(this._rundowns.values()).map(ro =>
            JSON.parse(JSON.stringify(ro))
        );
    }

    /** 获取单个 RO */
    getRundown(roID: string): IMOSRunningOrder | undefined {
        const ro = this._rundowns.get(roID);
        return ro ? JSON.parse(JSON.stringify(ro)) : undefined;
    }

    /** 获取当前 RO 数量 */
    get count(): number {
        return this._rundowns.size;
    }

    /** 获取所有 RO 的 ID 列表 */
    getAllIDs(): string[] {
        return Array.from(this._rundowns.keys());
    }

    // ── Profile 2 写操作 ──────────────────────────────────────────────────────

    /** roCreate：NCS 创建新节目单 */
    handleCreateRunningOrder(ro: IMOSRunningOrder): void {
        const roID = mosTypes.mosString128.stringify(ro.ID!);

        if (this._rundowns.has(roID)) {
            logger.warn(`[RundownStore] roCreate: RO ${roID} already exists, overwriting.`);
        }

        this._rundowns.set(roID, ro);
        persistRO(ro);
        logger.info(`[RundownStore] Created RO: ${roID} "${mosTypes.mosString128.stringify(ro.Slug)}", stories: ${ro.Stories.length}`);
        this.emit('roCreated', roID, ro);
    }

    /** roReplace：NCS 完整替换节目单 */
    handleReplaceRunningOrder(ro: IMOSRunningOrder): void {
        const roID = mosTypes.mosString128.stringify(ro.ID!);

        if (!this._rundowns.has(roID)) {
            logger.warn(`[RundownStore] roReplace: RO ${roID} not found, creating instead.`);
        }

        this._rundowns.set(roID, ro);
        persistRO(ro);
        logger.info(`[RundownStore] Replaced RO: ${roID}, stories: ${ro.Stories.length}`);
        this.emit('roReplaced', roID, ro);
    }

    /** roDelete：NCS 删除节目单 */
    handleDeleteRunningOrder(roID: string): void {
        if (!this._rundowns.has(roID)) {
            logger.warn(`[RundownStore] roDelete: RO ${roID} not found, ignoring.`);
            return;
        }

        this._rundowns.delete(roID);
        deletePersistedRO(roID);
        logger.info(`[RundownStore] Deleted RO: ${roID}`);
        this.emit('roDeleted', roID);
    }

    /** roMetadataReplace：更新 RO 元数据（不含 Stories） */
    handleMetadataReplace(roBase: IMOSRunningOrderBase): void {
        const roID = mosTypes.mosString128.stringify(roBase.ID);
        const existing = this._rundowns.get(roID);

        if (!existing) {
            logger.warn(`[RundownStore] roMetadataReplace: RO ${roID} not found, ignoring.`);
            return;
        }

        // 只更新元数据字段，保留 Stories
        const updated: IMOSRunningOrder = {
            ...existing,
            Slug: roBase.Slug,
            DefaultChannel: roBase.DefaultChannel,
            EditorialStart: roBase.EditorialStart,
            EditorialDuration: roBase.EditorialDuration,
            Trigger: roBase.Trigger,
            MacroIn: roBase.MacroIn,
            MacroOut: roBase.MacroOut,
            MosExternalMetaData: roBase.MosExternalMetaData,
        };

        this._rundowns.set(roID, updated);
        persistRO(updated);
        logger.info(`[RundownStore] Updated metadata for RO: ${roID}`);
        this.emit('roMetadataUpdated', roID);
    }

    /** roStatus：RO 播出状态更新 */
    handleRunningOrderStatus(status: IMOSRunningOrderStatus): void {
        const roID = mosTypes.mosString128.stringify(status.ID);
        logger.info(`[RundownStore] RO status: ${roID} → ${status.Status}`);
        this.emit('roStatusChanged', roID, status.Status);
        // 状态是实时信息，不持久化（重启后由 NCS 重新推送）
    }

    /** roReadyToAir：RO 上播状态 */
    handleReadyToAir(data: IMOSROReadyToAir): void {
        const roID = mosTypes.mosString128.stringify(data.ID);
        logger.info(`[RundownStore] RO ready-to-air: ${roID} → ${data.Status}`);
        this.emit('roReadyToAirChanged', roID, data.Status);
    }

    /** storyStatus：Story 播出状态 */
    handleStoryStatus(status: IMOSStoryStatus): void {
        const roID = mosTypes.mosString128.stringify(status.RunningOrderId);
        const storyID = mosTypes.mosString128.stringify(status.ID);
        logger.debug(`[RundownStore] Story status: ${roID}/${storyID} → ${status.Status}`);
        this.emit('storyChanged', roID, 'status');
    }

    /** itemStatus：Item 播出状态 */
    handleItemStatus(status: IMOSItemStatus): void {
        const roID = mosTypes.mosString128.stringify(status.RunningOrderId);
        const storyID = mosTypes.mosString128.stringify(status.StoryId);
        const itemID = mosTypes.mosString128.stringify(status.ID);
        logger.debug(`[RundownStore] Item status: ${roID}/${storyID}/${itemID} → ${status.Status}`);
    }

    // ── Story 级别操作 ────────────────────────────────────────────────────────

    /** roInsertStories：插入到 target story 之前 */
    handleROInsertStories(action: IMOSStoryAction, stories: IMOSROStory[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] roInsertStories: RO ${roID} not found`); return; }
    
        const insertBeforeID = mosTypes.mosString128.stringify(action.StoryID);
        const insertIdx = insertBeforeID
            ? ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === insertBeforeID)
            : ro.Stories.length; // 找不到目标则追加到末尾
        
        const finalIdx = insertIdx === -1 ? ro.Stories.length : insertIdx;
        ro.Stories.splice(finalIdx, 0, ...stories);
        persistRO(ro);
        logger.info(`[RundownStore] Inserted ${stories.length} story(s) into RO: ${roID} before position ${finalIdx}`);
        this.emit('storyChanged', roID, 'insert');
    }
    
    /** roReplaceStories：替换 target storyID 指定的 story */
    handleROReplaceStories(action: IMOSStoryAction, stories: IMOSROStory[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] roReplaceStories: RO ${roID} not found`); return; }
    
        const targetID = mosTypes.mosString128.stringify(action.StoryID);
        const idx = ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === targetID);
        if (idx === -1) {
            logger.warn(`[RundownStore] roReplaceStories: Target story ${targetID} not found in RO ${roID}`);
            return;
        }
        // 用新的 stories 替换目标位置（协议允许一对多替换）
        ro.Stories.splice(idx, 1, ...stories);
        persistRO(ro);
        logger.info(`[RundownStore] Replaced story ${targetID} with ${stories.length} story(s) in RO: ${roID}`);
        this.emit('storyChanged', roID, 'replace');
    }
    
    /** roMoveStories：移动到 target story 之前 */
    handleROMoveStories(action: IMOSStoryAction, storyIDs: string[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] roMoveStories: RO ${roID} not found`); return; }
    
        const insertBeforeID = mosTypes.mosString128.stringify(action.StoryID);
    
        // 先提取要移动的 stories（保持相对顺序）
        const toMove = ro.Stories.filter(s =>
            storyIDs.includes(mosTypes.mosString128.stringify(s.ID))
        );
        // 从原位置删除
        ro.Stories = ro.Stories.filter(s =>
            !storyIDs.includes(mosTypes.mosString128.stringify(s.ID))
        );
        // 找目标位置（删除后重新找）
        const insertIdx = insertBeforeID
            ? ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === insertBeforeID)
            : ro.Stories.length;
        const finalIdx = insertIdx === -1 ? ro.Stories.length : insertIdx;
        ro.Stories.splice(finalIdx, 0, ...toMove);
    
        persistRO(ro);
        logger.info(`[RundownStore] Moved ${storyIDs.length} story(s) before ${insertBeforeID} in RO: ${roID}`);
        this.emit('storyChanged', roID, 'move');
    }

    /** roDeleteStories：删除指定 Stories */
    handleRODeleteStories(action: IMOSROAction, storyIDs: string[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] roDeleteStories: RO ${roID} not found`); return; }

        const before = ro.Stories.length;
        ro.Stories = ro.Stories.filter(s =>
            !storyIDs.includes(mosTypes.mosString128.stringify(s.ID))
        );
        const deleted = before - ro.Stories.length;

        persistRO(ro);
        logger.info(`[RundownStore] Deleted ${deleted} story(s) from RO: ${roID}`);
        this.emit('storyChanged', roID, 'delete');
    }

    /** roSwapStories：交换两个 Story 的位置 */
    handleROSwapStories(action: IMOSROAction, storyID0: string, storyID1: string): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] roSwapStories: RO ${roID} not found`); return; }

        const idx0 = ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === storyID0);
        const idx1 = ro.Stories.findIndex(s => mosTypes.mosString128.stringify(s.ID) === storyID1);

        if (idx0 === -1 || idx1 === -1) {
            logger.warn(`[RundownStore] roSwapStories: Story not found in RO ${roID}`);
            return;
        }

        [ro.Stories[idx0], ro.Stories[idx1]] = [ro.Stories[idx1], ro.Stories[idx0]];
        persistRO(ro);
        logger.info(`[RundownStore] Swapped stories ${storyID0} ↔ ${storyID1} in RO: ${roID}`);
        this.emit('storyChanged', roID, 'swap');
    }

    // ── Item 级别操作 ─────────────────────────────────────────────────────────

    /** roInsertItems：插入到 target item 之前 */
    handleROInsertItems(action: IMOSItemAction, items: IMOSItem[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] roInsertItems: RO ${roID} not found`); return; }

        const story = ro.Stories.find(s => mosTypes.mosString128.stringify(s.ID) === storyID);
        if (!story) { logger.warn(`[RundownStore] roInsertItems: Story ${storyID} not found`); return; }

        const insertBeforeID = mosTypes.mosString128.stringify(action.ItemID);
        const insertIdx = insertBeforeID
            ? story.Items.findIndex(i => mosTypes.mosString128.stringify(i.ID) === insertBeforeID)
            : story.Items.length;
        const finalIdx = insertIdx === -1 ? story.Items.length : insertIdx;

        story.Items.splice(finalIdx, 0, ...items);
        persistRO(ro);
        logger.info(`[RundownStore] Inserted ${items.length} item(s) before ${insertBeforeID} in story ${storyID}`);
        this.emit('storyChanged', roID, 'itemInsert');
    }

    /** roReplaceItems：替换 target itemID 指定的 item */
    handleROReplaceItems(action: IMOSItemAction, items: IMOSItem[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] roReplaceItems: RO ${roID} not found`); return; }

        const story = ro.Stories.find(s => mosTypes.mosString128.stringify(s.ID) === storyID);
        if (!story) { logger.warn(`[RundownStore] roReplaceItems: Story ${storyID} not found`); return; }

        const targetID = mosTypes.mosString128.stringify(action.ItemID);
        const idx = story.Items.findIndex(i => mosTypes.mosString128.stringify(i.ID) === targetID);
        if (idx === -1) {
            logger.warn(`[RundownStore] roReplaceItems: Target item ${targetID} not found`);
            return;
        }
        story.Items.splice(idx, 1, ...items);
        persistRO(ro);
        logger.info(`[RundownStore] Replaced item ${targetID} with ${items.length} item(s) in story ${storyID}`);
        this.emit('storyChanged', roID, 'itemReplace');
    }

    /** roMoveItems：移动到 target item 之前，在 target story 内 */
    handleROMoveItems(action: IMOSItemAction, itemIDs: string[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] roMoveItems: RO ${roID} not found`); return; }

        const story = ro.Stories.find(s => mosTypes.mosString128.stringify(s.ID) === storyID);
        if (!story) { logger.warn(`[RundownStore] roMoveItems: Story ${storyID} not found`); return; }

        const insertBeforeID = mosTypes.mosString128.stringify(action.ItemID);
        const toMove = story.Items.filter(i => itemIDs.includes(mosTypes.mosString128.stringify(i.ID)));
        story.Items = story.Items.filter(i => !itemIDs.includes(mosTypes.mosString128.stringify(i.ID)));

        const insertIdx = insertBeforeID
            ? story.Items.findIndex(i => mosTypes.mosString128.stringify(i.ID) === insertBeforeID)
            : story.Items.length;
        const finalIdx = insertIdx === -1 ? story.Items.length : insertIdx;
        story.Items.splice(finalIdx, 0, ...toMove);

        persistRO(ro);
        logger.info(`[RundownStore] Moved ${itemIDs.length} item(s) before ${insertBeforeID} in story ${storyID}`);
        this.emit('storyChanged', roID, 'itemMove');
    }

    /** roDeleteItems：删除 target story 内的指定 items */
    handleRODeleteItems(action: IMOSStoryAction, itemIDs: string[]): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] roDeleteItems: RO ${roID} not found`); return; }

        const story = ro.Stories.find(s => mosTypes.mosString128.stringify(s.ID) === storyID);
        if (!story) { logger.warn(`[RundownStore] roDeleteItems: Story ${storyID} not found`); return; }

        story.Items = story.Items.filter(i => !itemIDs.includes(mosTypes.mosString128.stringify(i.ID)));
        persistRO(ro);
        logger.info(`[RundownStore] Deleted ${itemIDs.length} item(s) from story ${storyID}`);
        this.emit('storyChanged', roID, 'itemDelete');
    }

    /** roSwapItems：交换 target story 内的两个 items */
    // action 类型是 IMOSStoryAction（只含 storyID，协议里 element_target 只有 storyID）
    handleROSwapItems(action: IMOSStoryAction, itemID0: string, itemID1: string): void {
        const roID = mosTypes.mosString128.stringify(action.RunningOrderID);
        const storyID = mosTypes.mosString128.stringify(action.StoryID);
        const ro = this._rundowns.get(roID);
        if (!ro) { logger.warn(`[RundownStore] roSwapItems: RO ${roID} not found`); return; }

        const story = ro.Stories.find(s => mosTypes.mosString128.stringify(s.ID) === storyID);
        if (!story) { logger.warn(`[RundownStore] roSwapItems: Story ${storyID} not found`); return; }

        const idx0 = story.Items.findIndex(i => mosTypes.mosString128.stringify(i.ID) === itemID0);
        const idx1 = story.Items.findIndex(i => mosTypes.mosString128.stringify(i.ID) === itemID1);
        if (idx0 === -1 || idx1 === -1) {
            logger.warn(`[RundownStore] roSwapItems: Item not found in story ${storyID}`);
            return;
        }
        [story.Items[idx0], story.Items[idx1]] = [story.Items[idx1], story.Items[idx0]];
        persistRO(ro);
        logger.info(`[RundownStore] Swapped items ${itemID0} ↔ ${itemID1} in story ${storyID}`);
        this.emit('storyChanged', roID, 'itemSwap');
    }

    // ── Profile 4 ─────────────────────────────────────────────────────────────

    /** roReqAll 回应：返回当前所有 RO */
    getAllRunningOrdersForNCS(): IMOSRunningOrder[] {
        return this.getAllRundowns();
    }

    /** roStory：接收完整 story 内容推送 */
    handleRunningOrderStory(story: IMOSROFullStory): void {
        const roID = mosTypes.mosString128.stringify(story.RunningOrderId);
        const storyID = mosTypes.mosString128.stringify(story.ID);
        logger.info(`[RundownStore] Received full story: ${roID}/${storyID}, body items: ${story.Body.length}`);
        // Profile 4 的 roStory 是增量推送完整 story 内容
        // 此处记录日志，业务层可按需扩展
        this.emit('storyChanged', roID, 'fullStory');
    }
}

// ─── 单例导出 ─────────────────────────────────────────────────────────────────

/** 全局单例，整个应用共享同一个 RundownStore */
export const rundownStore = new RundownStore();