import { MosConnection, MosDevice, getMosTypes } from './connector/MosConnection';
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
    IMOSString128,
    IMOSROFullStory,
    IMOSROAck,
    IMOSAck,
    IMOSAckStatus,
    IMOSRequestObjectList,
    IMOSObjectList,
    IMOSListSearchableSchema,
} from './connector/api';

const mosTypes = getMosTypes(true);

// ─── 通用 ACK 构造函数 ───────────────────────────────────────────────────────

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

// ─── MosConnector 类 ─────────────────────────────────────────────────────────

export class MosConnector {
    private mosConnection: MosConnection;

    constructor() {
        console.log('MosConnector: Initializing MOS Connection...');

        const config: IConnectionConfig = {
            mosID: 'rcas.mos',
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
            strict: true,  // ← 开启严格模式，启动时校验所有回调是否已注册
            debug: process.env.NODE_ENV !== 'production',
        };

        this.mosConnection = new MosConnection(config);

        this.mosConnection.on('error', (error: Error) => {
            console.error('MOS Error:', error.message, error.stack);
        });
        this.mosConnection.on('warning', (warning: string) => {
            console.warn('MOS Warning:', warning);
        });
        this.mosConnection.on('info', (info: string) => {
            console.log('MOS Info:', info);
        });

        // 当有 NCS 连接进来时，注册该设备的所有回调
        this.mosConnection.onConnection((mosDevice: MosDevice) => {
            console.log('MosConnector: NCS connected, device ID:', mosTypes.mosString128.stringify(mosDevice.ID));
            this._registerCallbacks(mosDevice);
        });
    }

    async init() {
        await this.mosConnection.init();
        console.log('MosConnector: MOS Connection initialized, listening for NCS connections.');
    }

    // ─── 注册所有 Profile 回调 ──────────────────────────────────────────────

    private _registerCallbacks(mosDevice: MosDevice): void {

        // ── Profile 0 ────────────────────────────────────────────────────────

        mosDevice.onRequestMachineInfo(async (): Promise<IMOSListMachInfo> => {
            console.log('[P0] onRequestMachineInfo');
            return {
                manufacturer: mosTypes.mosString128.create('RCAS'),
                model: mosTypes.mosString128.create('RCAS Backend'),
                hwRev: mosTypes.mosString128.create('1.0'),
                swRev: mosTypes.mosString128.create('1.0'),
                DOM: mosTypes.mosString128.create('2024-01-01'),
                SN: mosTypes.mosString128.create('SN-RCAS-001'),
                ID: mosTypes.mosString128.create('rcas.mos'),
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
            console.log('[P0] Connection status changed:', status);
        });

        // ── Profile 1（存根，不做实际业务处理）──────────────────────────────

        mosDevice.onRequestMOSObject(async (_objId: string) => {
            console.log('[P1] onRequestMOSObject (stub), objId:', _objId);
            return null;
        });

        mosDevice.onRequestAllMOSObjects(async () => {
            console.log('[P1] onRequestAllMOSObjects (stub)');
            return [];
        });

        mosDevice.onMOSObjects(async (_objs: IMOSObject[]) => {
            console.log('[P1] onMOSObjects (stub), count:', _objs.length);
            return makeMosAck(mosTypes.mosString128.create('0'));
        });

        // ── Profile 2（核心业务，在此接入你的业务逻辑）──────────────────────

        mosDevice.onCreateRunningOrder(async (ro: IMOSRunningOrder) => {
            console.log('[P2] onCreateRunningOrder:', mosTypes.mosString128.stringify(ro.ID));
            // TODO: 接入业务逻辑，例如存入数据库
            return makeRoAck(ro.ID);
        });

        mosDevice.onReplaceRunningOrder(async (ro: IMOSRunningOrder) => {
            console.log('[P2] onReplaceRunningOrder:', mosTypes.mosString128.stringify(ro.ID));
            // TODO: 接入业务逻辑
            return makeRoAck(ro.ID);
        });

        mosDevice.onDeleteRunningOrder(async (roId: IMOSString128) => {
            console.log('[P2] onDeleteRunningOrder:', mosTypes.mosString128.stringify(roId));
            // TODO: 接入业务逻辑
            return makeRoAck(roId);
        });

        mosDevice.onRequestRunningOrder(async (_roId: IMOSString128) => {
            console.log('[P2] onRequestRunningOrder:', mosTypes.mosString128.stringify(_roId));
            // TODO: 从存储中查询并返回 RO，暂时返回 null
            return null;
        });

        mosDevice.onMetadataReplace(async (metadata: IMOSRunningOrderBase) => {
            console.log('[P2] onMetadataReplace:', mosTypes.mosString128.stringify(metadata.ID));
            return makeRoAck(metadata.ID);
        });

        mosDevice.onRunningOrderStatus(async (status: IMOSRunningOrderStatus) => {
            console.log('[P2] onRunningOrderStatus:', mosTypes.mosString128.stringify(status.ID), status.Status);
            return makeRoAck(status.ID);
        });

        mosDevice.onStoryStatus(async (status: IMOSStoryStatus) => {
            console.log('[P2] onStoryStatus:', mosTypes.mosString128.stringify(status.ID), status.Status);
            return makeRoAck(status.RunningOrderId);
        });

        mosDevice.onItemStatus(async (status: IMOSItemStatus) => {
            console.log('[P2] onItemStatus:', mosTypes.mosString128.stringify(status.ID), status.Status);
            return makeRoAck(status.RunningOrderId);
        });

        mosDevice.onReadyToAir(async (action: IMOSROReadyToAir) => {
            console.log('[P2] onReadyToAir:', mosTypes.mosString128.stringify(action.ID), action.Status);
            return makeRoAck(action.ID);
        });

        mosDevice.onROInsertStories(async (action: IMOSStoryAction, _stories: IMOSROStory[]) => {
            console.log('[P2] onROInsertStories, RO:', mosTypes.mosString128.stringify(action.RunningOrderID));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROInsertItems(async (action: IMOSItemAction, _items: IMOSItem[]) => {
            console.log('[P2] onROInsertItems, RO:', mosTypes.mosString128.stringify(action.RunningOrderID));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROReplaceStories(async (action: IMOSStoryAction, _stories: IMOSROStory[]) => {
            console.log('[P2] onROReplaceStories, RO:', mosTypes.mosString128.stringify(action.RunningOrderID));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROReplaceItems(async (action: IMOSItemAction, _items: IMOSItem[]) => {
            console.log('[P2] onROReplaceItems, RO:', mosTypes.mosString128.stringify(action.RunningOrderID));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROMoveStories(async (action: IMOSStoryAction, _storyIds: IMOSString128[]) => {
            console.log('[P2] onROMoveStories, RO:', mosTypes.mosString128.stringify(action.RunningOrderID));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROMoveItems(async (action: IMOSItemAction, _itemIds: IMOSString128[]) => {
            console.log('[P2] onROMoveItems, RO:', mosTypes.mosString128.stringify(action.RunningOrderID));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onRODeleteStories(async (action: IMOSROAction, _storyIds: IMOSString128[]) => {
            console.log('[P2] onRODeleteStories, RO:', mosTypes.mosString128.stringify(action.RunningOrderID));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onRODeleteItems(async (action: IMOSStoryAction, _itemIds: IMOSString128[]) => {
            console.log('[P2] onRODeleteItems, RO:', mosTypes.mosString128.stringify(action.RunningOrderID));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROSwapStories(async (action: IMOSROAction, _storyId0: IMOSString128, _storyId1: IMOSString128) => {
            console.log('[P2] onROSwapStories, RO:', mosTypes.mosString128.stringify(action.RunningOrderID));
            return makeRoAck(action.RunningOrderID);
        });

        mosDevice.onROSwapItems(async (action: IMOSStoryAction, _itemId0: IMOSString128, _itemId1: IMOSString128) => {
            console.log('[P2] onROSwapItems, RO:', mosTypes.mosString128.stringify(action.RunningOrderID));
            return makeRoAck(action.RunningOrderID);
        });

        // ── Profile 3（存根，不做实际业务处理）──────────────────────────────

        mosDevice.onItemReplace(async (roId, _storyId, _item) => {
            console.log('[P3] onItemReplace (stub)');
            return makeRoAck(roId);
        });

        mosDevice.onObjectCreate(async (_obj) => {
            console.log('[P3] onObjectCreate (stub)');
            return makeMosAck(mosTypes.mosString128.create('0'));
        });

        mosDevice.onRequestObjectActionNew(async (_obj) => {
            console.log('[P3] onRequestObjectActionNew (stub)');
            return makeMosAck(mosTypes.mosString128.create('0'));
        });

        mosDevice.onRequestObjectActionUpdate(async (_objId, _obj) => {
            console.log('[P3] onRequestObjectActionUpdate (stub)');
            return makeMosAck(mosTypes.mosString128.create('0'));
        });

        mosDevice.onRequestObjectActionDelete(async (_objId) => {
            console.log('[P3] onRequestObjectActionDelete (stub)');
            return makeMosAck(mosTypes.mosString128.create('0'));
        });

        mosDevice.onRequestObjectList(async (req: IMOSRequestObjectList): Promise<IMOSObjectList> => {
            console.log('[P3] onRequestObjectList (stub)');
            return {
                username: req.username,
                queryID: '',
                listReturnStart: 0,
                listReturnEnd: 0,
                listReturnTotal: 0,
            };
        });

        mosDevice.onRequestSearchableSchema(async (username: string): Promise<IMOSListSearchableSchema> => {
            console.log('[P3] onRequestSearchableSchema (stub), username:', username);
            return { username, mosSchema: '' };
        });

        // ── Profile 4（核心业务）─────────────────────────────────────────────

        mosDevice.onRequestAllRunningOrders(async (): Promise<IMOSRunningOrder[]> => {
            console.log('[P4] onRequestAllRunningOrders');
            // TODO: 从存储中返回完整 RO 列表
            return [];
        });

        mosDevice.onRunningOrderStory(async (story: IMOSROFullStory): Promise<IMOSROAck> => {
            console.log('[P4] onRunningOrderStory:', mosTypes.mosString128.stringify(story.ID));
            // TODO: 处理 story 推送
            return makeRoAck(story.RunningOrderId);
        });

        // ── 校验所有回调已注册（strict 模式下的最终确认）───────────────────
        mosDevice.checkProfileValidness();
        console.log('MosConnector: All profile callbacks registered and validated for device:', mosTypes.mosString128.stringify(mosDevice.ID));
    }
}