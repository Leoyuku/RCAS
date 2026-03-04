/**
 * @fileoverview MOS 连接模块 — 对外公开接口
 *
 * 职责：
 * - 管理与 NCS 的 MOS 协议连接（基于 sofie mos-connection 库）
 * - 注册所有 Profile 0-4 的回调，将 MOS 消息转发给 RundownStore
 * - 管理多 NCS 设备的连接生命周期
 * - 支持优雅关闭
 */

import { MosConnection } from './connector/MosConnection';
import { MosDevice } from './connector/MosDevice';
import { getMosTypes, IMOSString128 } from './internals/mosTypes';
import { IConnectionConfig } from './connector/api';
import {
    IMOSListMachInfo,
    IMOSObject,
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
    IMOSROAck,
    IMOSAck,
    IMOSAckStatus,
    IMOSRequestObjectList,
    IMOSObjectList,
    IMOSListSearchableSchema,
} from './internals/model';
import { rundownStore } from '../../store/rundown-store';
import { logger } from '../../store/logger';

const mosTypes = getMosTypes(true);

// ─── 通用 ACK 构造函数 ────────────────────────────────────────────────────────

function makeRoAck(roId: IMOSString128): IMOSROAck {
    return {
        ID: roId,
        Status: mosTypes.mosString128.create('OK'),
        Stories: [],
    };
}

function makeMosAck(id: IMOSString128): IMOSAck {
    return {
        ID: id,
        Revision: 0,
        Status: IMOSAckStatus.ACK,
        Description: mosTypes.mosString128.create(''),
    };
}

// ─── MosConnector 类 ──────────────────────────────────────────────────────────

export class MosConnector {
    private mosConnection: MosConnection;

    /** 已连接的设备：deviceID → MosDevice */
    private _connectedDevices: Map<string, MosDevice> = new Map();

    constructor() {
        logger.info('[MosConnector] Initializing MOS Connection...');

        const config: IConnectionConfig = {
            mosID: process.env.MOS_ID || 'rcas.mos',
            acceptsConnections: true,
            profiles: {
                '0': true,
                '1': true,
                '2': true,
                '3': true,
                '4': true,
                '5': false,
                '6': false,
                '7': false,
            },
            strict: true,
            debug: process.env.NODE_ENV !== 'production',
        };

        this.mosConnection = new MosConnection(config);

        // ── 连接级别事件 ──────────────────────────────────────────────────────
        this.mosConnection.on('error', (error: Error) => {
            logger.error('[MOS] Error:', { message: error.message, stack: error.stack });
        });
        this.mosConnection.on('warning', (warning: string) => {
            logger.warn('[MOS] Warning:', { warning });
        });
        this.mosConnection.on('info', (info: string) => {
            logger.debug('[MOS] Info:', { info });
        });

        // ── 设备连接事件 ──────────────────────────────────────────────────────
        this.mosConnection.onConnection((mosDevice: MosDevice) => {
            const deviceID = mosTypes.mosString128.stringify(mosDevice.ID);

            // 处理重连：同一设备已存在则先清理旧回调
            if (this._connectedDevices.has(deviceID)) {
                logger.warn(`[MosConnector] Device ${deviceID} reconnected, re-registering callbacks.`);
            }

            this._connectedDevices.set(deviceID, mosDevice);
            logger.info(`[MosConnector] NCS connected: ${deviceID} (total: ${this._connectedDevices.size})`);

            this._registerCallbacks(mosDevice);
        });
    }

    // ── 初始化 ────────────────────────────────────────────────────────────────

    async init(): Promise<void> {
        // 先从磁盘恢复数据，再启动 MOS 监听
        // 确保 NCS 连接时数据层已就绪
        await rundownStore.restore();

        await this.mosConnection.init();
        logger.info('[MosConnector] Listening on MOS ports 10540/10541/10542.');

        // 联调模式：环境变量指定时主动连接
        if (process.env.MOS_CONNECT_HOST) {
            const host = process.env.MOS_CONNECT_HOST;
            const mosId = process.env.MOS_CONNECT_ID || 'quick.mos';
            const lowerPort = parseInt(process.env.MOS_CONNECT_PORT_LOWER || '11540');
            const upperPort = parseInt(process.env.MOS_CONNECT_PORT_UPPER || '11541');
            const queryPort = parseInt(process.env.MOS_CONNECT_PORT_QUERY || '11542');

            logger.info(`[MosConnector] Connecting to ${mosId} @ ${host}:${lowerPort}/${upperPort}/${queryPort}`);
            await this.mosConnection.connect({
                primary: {
                    id: mosId,
                    host,
                    ports: { lower: lowerPort, upper: upperPort, query: queryPort },
                },
            });
        }

        logger.info(`[MosConnector] Initialized. ${rundownStore.count} RO(s) ready.`);
    }

    // ── 优雅关闭 ──────────────────────────────────────────────────────────────

    async dispose(): Promise<void> {
        logger.info('[MosConnector] Disposing MOS connections...');
        await this.mosConnection.dispose();
        this._connectedDevices.clear();
        logger.info('[MosConnector] Disposed.');
    }

    // ── 对外查询接口（供 REST API 使用） ──────────────────────────────────────

    getConnectedDevices(): Array<{ id: string }> {
        return Array.from(this._connectedDevices.keys()).map(id => ({ id }));
    }

    // ── 注册所有 Profile 回调 ─────────────────────────────────────────────────

    private _registerCallbacks(mosDevice: MosDevice): void {
        const deviceID = mosTypes.mosString128.stringify(mosDevice.ID);

        // ── Profile 0 ─────────────────────────────────────────────────────────

        mosDevice.onRequestMachineInfo(async (): Promise<IMOSListMachInfo> => {
            logger.debug(`[P0] reqMachInfo from ${deviceID}`);
            return {
                manufacturer: mosTypes.mosString128.create('RCAS'),
                model: mosTypes.mosString128.create('RCAS Backend'),
                hwRev: mosTypes.mosString128.create('1.0'),
                swRev: mosTypes.mosString128.create(process.env.npm_package_version || '1.0.0'),
                DOM: mosTypes.mosString128.create('2024-01-01'),
                SN: mosTypes.mosString128.create(process.env.MOS_SERIAL || 'SN-RCAS-001'),
                ID: mosTypes.mosString128.create(process.env.MOS_ID || 'rcas.mos'),
                time: mosTypes.mosTime.create(Date.now()),
                mosRev: mosTypes.mosString128.create('2.8.4'),
                supportedProfiles: {
                    deviceType: 'MOS',
                    profile0: true,
                    profile1: true,
                    profile2: true,
                    profile3: true,
                    profile4: true,
                },
            };
        });

        mosDevice.onConnectionChange((status) => {
            logger.info(`[P0] Connection status from ${deviceID}:`, status);
            if (!status.PrimaryConnected) {
                logger.warn(`[MosConnector] Device ${deviceID} primary connection lost.`);
            }
        });

        // ── Profile 1 ─────────────────────────────────────────────────────────

        mosDevice.onRequestMOSObject(async (objId: string) => {
            logger.debug(`[P1] reqMosObj: ${objId}`);
            // RCAS 不是媒体资产管理系统，不维护 MOS Object 库
            return null;
        });

        mosDevice.onRequestAllMOSObjects(async () => {
            logger.debug(`[P1] reqMosObjAll`);
            return [];
        });

        mosDevice.onMOSObjects(async (objs: IMOSObject[]) => {
            logger.debug(`[P1] mosObjects received: ${objs.length} objects`);
            return makeMosAck(mosTypes.mosString128.create('0'));
        });

        // ── Profile 2：核心节目单管理 ─────────────────────────────────────────

        mosDevice.onCreateRunningOrder(async (ro: IMOSRunningOrder): Promise<IMOSROAck> => {
            rundownStore.handleCreateRunningOrder(ro);
            return makeRoAck(ro.ID!);
        });

        mosDevice.onReplaceRunningOrder(async (ro: IMOSRunningOrder): Promise<IMOSROAck> => {
            rundownStore.handleReplaceRunningOrder(ro);
            return makeRoAck(ro.ID!);
        });

        mosDevice.onDeleteRunningOrder(async (roId: IMOSString128): Promise<IMOSROAck> => {
            const roID = mosTypes.mosString128.stringify(roId);
            rundownStore.handleDeleteRunningOrder(roID);
            return makeRoAck(roId);
        });

        mosDevice.onRequestRunningOrder(async (roId: IMOSString128): Promise<IMOSRunningOrder | null> => {
            const roID = mosTypes.mosString128.stringify(roId);
            const ro = rundownStore.getRundown(roID);
            logger.debug(`[P2] reqRunningOrder: ${roID} → ${ro ? 'found' : 'not found'}`);
            return ro ?? null;
        });

        mosDevice.onMetadataReplace(async (roBase: IMOSRunningOrderBase): Promise<IMOSROAck> => {
            rundownStore.handleMetadataReplace(roBase);
            return makeRoAck(roBase.ID);
        });

        mosDevice.onRunningOrderStatus(async (status: IMOSRunningOrderStatus): Promise<IMOSROAck> => {
            rundownStore.handleRunningOrderStatus(status);
            return makeRoAck(status.ID);
        });

        mosDevice.onStoryStatus(async (status: IMOSStoryStatus): Promise<IMOSROAck> => {
            rundownStore.handleStoryStatus(status);
            return makeRoAck(status.RunningOrderId);
        });

        mosDevice.onItemStatus(async (status: IMOSItemStatus): Promise<IMOSROAck> => {
            rundownStore.handleItemStatus(status);
            return makeRoAck(status.RunningOrderId);
        });

        mosDevice.onReadyToAir(async (data: IMOSROReadyToAir): Promise<IMOSROAck> => {
            rundownStore.handleReadyToAir(data);
            return makeRoAck(data.ID);
        });

        // Story 操作
        mosDevice.onROInsertStories(async (action: IMOSStoryAction, stories: IMOSROStory[]): Promise<IMOSROAck> => {
            rundownStore.handleROInsertStories(action, stories);
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROReplaceStories(async (action: IMOSStoryAction, stories: IMOSROStory[]): Promise<IMOSROAck> => {
            rundownStore.handleROReplaceStories(action, stories);
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROMoveStories(async (action: IMOSStoryAction, storyIDs: IMOSString128[]): Promise<IMOSROAck> => {
            rundownStore.handleROMoveStories(action, storyIDs.map(id => mosTypes.mosString128.stringify(id)));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onRODeleteStories(async (action: IMOSROAction, storyIDs: IMOSString128[]): Promise<IMOSROAck> => {
            rundownStore.handleRODeleteStories(action, storyIDs.map(id => mosTypes.mosString128.stringify(id)));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROSwapStories(async (action: IMOSROAction, storyID0: IMOSString128, storyID1: IMOSString128): Promise<IMOSROAck> => {
            rundownStore.handleROSwapStories(
                action,
                mosTypes.mosString128.stringify(storyID0),
                mosTypes.mosString128.stringify(storyID1)
            );
            return makeRoAck(action.RunningOrderID);
        });

        // Item 操作
        mosDevice.onROInsertItems(async (action: IMOSItemAction, items: IMOSItem[]): Promise<IMOSROAck> => {
            rundownStore.handleROInsertItems(action, items);
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROReplaceItems(async (action: IMOSItemAction, items: IMOSItem[]): Promise<IMOSROAck> => {
            rundownStore.handleROReplaceItems(action, items);
            return makeRoAck(action.RunningOrderID);
        });

        // onRODeleteItems：action 是 IMOSStoryAction（只有 storyID）
        mosDevice.onRODeleteItems(async (action: IMOSStoryAction, itemIDs: IMOSString128[]): Promise<IMOSROAck> => {
            rundownStore.handleRODeleteItems(action, itemIDs.map(id => mosTypes.mosString128.stringify(id)));
            return makeRoAck(action.RunningOrderID);
        });

        // onROMoveItems：action 实际是 IMOSItemAction（含 storyID + itemID）
        mosDevice.onROMoveItems(async (action: any, itemIDs: IMOSString128[]): Promise<IMOSROAck> => {
            rundownStore.handleROMoveItems(action as IMOSItemAction, itemIDs.map(id => mosTypes.mosString128.stringify(id)));
            return makeRoAck((action as IMOSItemAction).RunningOrderID);
        });

        mosDevice.onROMoveItems(async (action: IMOSStoryAction, itemIDs: IMOSString128[]): Promise<IMOSROAck> => {
            rundownStore.handleROMoveItems(action as IMOSItemAction, itemIDs.map(id => mosTypes.mosString128.stringify(id)));
            return makeRoAck(action.RunningOrderID);
        });

        // onROSwapItems：action 是 IMOSStoryAction（只有 storyID）
        mosDevice.onROSwapItems(async (action: IMOSStoryAction, itemID0: IMOSString128, itemID1: IMOSString128): Promise<IMOSROAck> => {
            rundownStore.handleROSwapItems(
                action,
                mosTypes.mosString128.stringify(itemID0),
                mosTypes.mosString128.stringify(itemID1)
            );
            return makeRoAck(action.RunningOrderID);
        });

        // ── Profile 3：媒体对象操作（存根，RCAS 不做媒体资产管理）────────────

        mosDevice.onObjectCreate(async (obj: IMOSObject): Promise<IMOSAck> => {
            logger.debug(`[P3] onObjectCreate: ${mosTypes.mosString128.stringify(obj.Slug)}`);
            return makeMosAck(obj.ID ?? mosTypes.mosString128.create('0'));
        });

        mosDevice.onItemReplace(async (roID: IMOSString128, storyID: IMOSString128, item: IMOSItem): Promise<IMOSROAck> => {
            logger.debug(`[P3] onItemReplace: story ${mosTypes.mosString128.stringify(storyID)}`);
            return makeRoAck(roID);
        });

        mosDevice.onRequestObjectActionNew(async (obj: IMOSObject): Promise<IMOSAck> => {
            logger.debug(`[P3] onRequestObjectActionNew`);
            return makeMosAck(obj.ID ?? mosTypes.mosString128.create('0'));
        });

        mosDevice.onRequestObjectActionUpdate(async (_objId: IMOSString128, _obj: IMOSObject): Promise<IMOSAck> => {
            logger.debug(`[P3] onRequestObjectActionUpdate`);
            return makeMosAck(_objId);
        });

        mosDevice.onRequestObjectActionDelete(async (objId: IMOSString128): Promise<IMOSAck> => {
            logger.debug(`[P3] onRequestObjectActionDelete`);
            return makeMosAck(objId);
        });

        mosDevice.onRequestObjectList(async (req: IMOSRequestObjectList): Promise<IMOSObjectList> => {
            logger.debug(`[P3] onRequestObjectList`);
            return {
                username: req.username,
                queryID: mosTypes.mosString128.stringify(req.queryID),
                listReturnStart: 0,
                listReturnEnd: 0,
                listReturnTotal: 0,
                list: [],
            };
        });

        mosDevice.onRequestSearchableSchema(async (username: string): Promise<IMOSListSearchableSchema> => {
            logger.debug(`[P3] onRequestSearchableSchema, username: ${username}`);
            return { username, mosSchema: '' };
        });

        // ── Profile 4：全量节目单同步 ─────────────────────────────────────────

        mosDevice.onRequestAllRunningOrders(async (): Promise<IMOSRunningOrder[]> => {
            const all = rundownStore.getAllRunningOrdersForNCS();
            logger.info(`[P4] reqAllRO → returning ${all.length} RO(s)`);
            return all;
        });

        mosDevice.onRunningOrderStory(async (story: IMOSROFullStory): Promise<IMOSROAck> => {
            rundownStore.handleRunningOrderStory(story);
            return makeRoAck(story.RunningOrderId);
        });

        // ── 最终校验 ──────────────────────────────────────────────────────────
        mosDevice.checkProfileValidness();
        logger.info(`[MosConnector] All callbacks registered and validated for device: ${deviceID}`);
    }
}