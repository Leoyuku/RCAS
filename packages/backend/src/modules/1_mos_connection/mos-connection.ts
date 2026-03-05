/**
 * @fileoverview MOS 连接模块
 *
 * 职责：
 * - 管理与 NCS 的 MOS 协议连接
 * - 注册所有 Profile 0-4 回调，转发给 RundownStore
 * - 管理多 NCS 设备连接生命周期
 * - 所有回调均有异常捕获，保证任何情况下都能回 ACK，防止消息风暴
 * - 支持优雅关闭
 */

import { MosConnection } from './connector/MosConnection';
import { MosDevice } from './connector/MosDevice';
import { IMOSString128,getMosTypes } from './internals/mosTypes';
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
import { rundownStore } from '../3_domain_engine/store/rundown-store';
import { logger } from '../../shared/logger';
import { config } from '../../shared/config';

const mosTypes = getMosTypes(true);

// ─── ACK 构造函数 ──────────────────────────────────────────────────────────────

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

// ─── 安全回调包装器 ────────────────────────────────────────────────────────────
//
// 广电播出核心原则：MOS 回调无论如何都必须返回 ACK。
// 如果回调内部抛异常而不返回 ACK，NCS 会认为消息未送达，
// 持续重试直到超时，形成消息风暴，严重时导致播出中断。

async function safeRoAck(
    deviceID: string,
    callbackName: string,
    fallbackId: IMOSString128,
    fn: () => Promise<IMOSROAck>
): Promise<IMOSROAck> {
    try {
        return await fn();
    } catch (err) {
        logger.error(`[MOS][${deviceID}] Callback "${callbackName}" threw:`, {
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
        });
        return {
            ID: fallbackId,
            Status: mosTypes.mosString128.create('FAILED'),
            Stories: [],
        };
    }
}

async function safeMosAck(
    deviceID: string,
    callbackName: string,
    fallbackId: IMOSString128,
    fn: () => Promise<IMOSAck>
): Promise<IMOSAck> {
    try {
        return await fn();
    } catch (err) {
        logger.error(`[MOS][${deviceID}] Callback "${callbackName}" threw:`, {
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
        });
        return {
            ID: fallbackId,
            Revision: 0,
            Status: IMOSAckStatus.NACK,
            Description: mosTypes.mosString128.create('Internal error'),
        };
    }
}

// ─── MosConnector 类 ───────────────────────────────────────────────────────────

export class MosConnector {
    private mosConnection: MosConnection;
    private _connectedDevices: Map<string, MosDevice> = new Map();

    constructor() {
        logger.info('[MosConnector] Initializing...');

        const connectionConfig: IConnectionConfig = {
            mosID: config.mosID,
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
            debug: !config.isProduction,
        };

        this.mosConnection = new MosConnection(connectionConfig);

        this.mosConnection.on('error', (error: Error) => {
            logger.error('[MOS] Connection error:', {
                message: error.message,
                stack: error.stack,
            });
        });
        this.mosConnection.on('warning', (warning: string) => {
            logger.warn('[MOS] Warning:', { warning });
        });
        this.mosConnection.on('info', (info: string) => {
            logger.debug('[MOS] Info:', { info });
        });

        this.mosConnection.onConnection((mosDevice: MosDevice) => {
            const deviceID = mosTypes.mosString128.stringify(mosDevice.ID);

            // NCS 白名单校验：配置了白名单时，拒绝不在名单内的连接
            if (config.mosAllowedNcsIDs.length > 0 &&
                !config.mosAllowedNcsIDs.includes(deviceID)) {
                logger.warn(`[MosConnector] Rejected connection from "${deviceID}" — not in MOS_ALLOWED_NCS_IDS whitelist`);
                return;
            }

            const isReconnect = this._connectedDevices.has(deviceID);
            this._connectedDevices.set(deviceID, mosDevice);
            logger.info(
                `[MosConnector] NCS ${isReconnect ? 're' : ''}connected: "${deviceID}"` +
                ` (total: ${this._connectedDevices.size})`
            );
            this._registerCallbacks(mosDevice);
        });
    }

    // ── 初始化 ────────────────────────────────────────────────────────────────

    async init(): Promise<void> {
        await rundownStore.restore();
        await this.mosConnection.init();

        logger.info(`[MosConnector] Listening on MOS ports ${config.mosPortLower}/${config.mosPortUpper}/${config.mosPortQuery}`);

        if (config.mosConnectHost) {
            logger.info(`[MosConnector] Dev mode: connecting to "${config.mosConnectID}" @ ${config.mosConnectHost}:${config.mosConnectPortLower}/${config.mosConnectPortUpper}/${config.mosConnectPortQuery}`);
            await this.mosConnection.connect({
                primary: {
                    id:    config.mosConnectID,
                    host:  config.mosConnectHost,
                    ports: {
                        lower: config.mosConnectPortLower,
                        upper: config.mosConnectPortUpper,
                        query: config.mosConnectPortQuery,
                    },
                },
            });
        }

        logger.info(`[MosConnector] Ready. ${rundownStore.count} RO(s) loaded from disk.`);
    }

    // ── 优雅关闭 ──────────────────────────────────────────────────────────────

    async dispose(): Promise<void> {
        logger.info('[MosConnector] Closing all MOS connections...');
        try {
            await this.mosConnection.dispose();
        } catch (err) {
            logger.error('[MosConnector] Error during dispose:', err);
        }
        this._connectedDevices.clear();
        logger.info('[MosConnector] All MOS connections closed.');
    }

    // ── 对外查询 ──────────────────────────────────────────────────────────────

    getConnectedDevices(): Array<{ id: string }> {
        return Array.from(this._connectedDevices.keys()).map(id => ({ id }));
    }

    isAnyDeviceConnected(): boolean {
        return this._connectedDevices.size > 0;
    }

    // ── 回调注册 ──────────────────────────────────────────────────────────────

    private _registerCallbacks(mosDevice: MosDevice): void {
        const deviceID = mosTypes.mosString128.stringify(mosDevice.ID);

        // ── Profile 0 ─────────────────────────────────────────────────────────

        mosDevice.onRequestMachineInfo(async (): Promise<IMOSListMachInfo> => {
            logger.debug(`[P0][${deviceID}] reqMachInfo`);
            return {
                manufacturer: mosTypes.mosString128.create('RCAS'),
                model:        mosTypes.mosString128.create('RCAS Backend'),
                hwRev:        mosTypes.mosString128.create('1.0'),
                swRev:        mosTypes.mosString128.create(config.version),
                DOM:          mosTypes.mosString128.create('2024-01-01'),
                SN:           mosTypes.mosString128.create(config.mosSerial),
                ID:           mosTypes.mosString128.create(config.mosID),
                time:         mosTypes.mosTime.create(Date.now()),
                mosRev:       mosTypes.mosString128.create('2.8.4'),
                supportedProfiles: {
                    deviceType: 'MOS',
                    profile0: true, profile1: true, profile2: true,
                    profile3: true, profile4: true,
                },
            };
        });

        mosDevice.onConnectionChange((status) => {
            logger.info(`[P0][${deviceID}] Connection status:`, status);
            if (!status.PrimaryConnected) {
                logger.warn(`[MosConnector] "${deviceID}" primary connection lost.`);
            }
        });

        // ── Profile 1：媒体对象（存根）────────────────────────────────────────

        mosDevice.onRequestMOSObject(async (objId: string) => {
            logger.debug(`[P1][${deviceID}] reqMosObject: ${objId}`);
            return null;
        });

        mosDevice.onRequestAllMOSObjects(async () => {
            logger.debug(`[P1][${deviceID}] reqAllMosObjects`);
            return [];
        });

        mosDevice.onMOSObjects(async (objs: IMOSObject[]) => {
            logger.debug(`[P1][${deviceID}] mosObjects: ${objs.length}`);
            return makeMosAck(mosTypes.mosString128.create('0'));
        });

        // ── Profile 2：节目单管理 ──────────────────────────────────────────────

        mosDevice.onCreateRunningOrder(async (ro: IMOSRunningOrder) =>
            safeRoAck(deviceID, 'onCreateRunningOrder', ro.ID!, async () => {
                rundownStore.handleCreateRunningOrder(ro);
                return makeRoAck(ro.ID!);
            })
        );

        mosDevice.onReplaceRunningOrder(async (ro: IMOSRunningOrder) =>
            safeRoAck(deviceID, 'onReplaceRunningOrder', ro.ID!, async () => {
                rundownStore.handleReplaceRunningOrder(ro);
                return makeRoAck(ro.ID!);
            })
        );

        mosDevice.onDeleteRunningOrder(async (roId: IMOSString128) =>
            safeRoAck(deviceID, 'onDeleteRunningOrder', roId, async () => {
                rundownStore.handleDeleteRunningOrder(mosTypes.mosString128.stringify(roId));
                return makeRoAck(roId);
            })
        );

        mosDevice.onRequestRunningOrder(async (roId: IMOSString128) => {
            const roIDStr = mosTypes.mosString128.stringify(roId);
            const ro = rundownStore.getRundown(roIDStr);
            logger.debug(`[P2][${deviceID}] reqRunningOrder: ${roIDStr} → ${ro ? 'found' : 'not found'}`);
            return ro ?? null;
        });

        mosDevice.onMetadataReplace(async (roBase: IMOSRunningOrderBase) =>
            safeRoAck(deviceID, 'onMetadataReplace', roBase.ID, async () => {
                rundownStore.handleMetadataReplace(roBase);
                return makeRoAck(roBase.ID);
            })
        );

        mosDevice.onRunningOrderStatus(async (status: IMOSRunningOrderStatus) =>
            safeRoAck(deviceID, 'onRunningOrderStatus', status.ID, async () => {
                rundownStore.handleRunningOrderStatus(status);
                return makeRoAck(status.ID);
            })
        );

        mosDevice.onStoryStatus(async (status: IMOSStoryStatus) =>
            safeRoAck(deviceID, 'onStoryStatus', status.RunningOrderId, async () => {
                rundownStore.handleStoryStatus(status);
                return makeRoAck(status.RunningOrderId);
            })
        );

        mosDevice.onItemStatus(async (status: IMOSItemStatus) =>
            safeRoAck(deviceID, 'onItemStatus', status.RunningOrderId, async () => {
                rundownStore.handleItemStatus(status);
                return makeRoAck(status.RunningOrderId);
            })
        );

        mosDevice.onReadyToAir(async (data: IMOSROReadyToAir) =>
            safeRoAck(deviceID, 'onReadyToAir', data.ID, async () => {
                rundownStore.handleReadyToAir(data);
                return makeRoAck(data.ID);
            })
        );

        // Story 级别操作
        // INSERT/MOVE：element_target.storyID = 插入/移动到此 story 之前
        // REPLACE：element_target.storyID = 被替换的 story
        // DELETE：无 element_target，直接按 source storyID 删除
        // SWAP：无 element_target，source 里恰好两个 storyID

        mosDevice.onROInsertStories(async (action: IMOSStoryAction, stories: IMOSROStory[]) =>
            safeRoAck(deviceID, 'onROInsertStories', action.RunningOrderID, async () => {
                rundownStore.handleROInsertStories(action, stories);
                return makeRoAck(action.RunningOrderID);
            })
        );

        mosDevice.onROReplaceStories(async (action: IMOSStoryAction, stories: IMOSROStory[]) =>
            safeRoAck(deviceID, 'onROReplaceStories', action.RunningOrderID, async () => {
                rundownStore.handleROReplaceStories(action, stories);
                return makeRoAck(action.RunningOrderID);
            })
        );

        mosDevice.onROMoveStories(async (action: IMOSStoryAction, storyIDs: IMOSString128[]) =>
            safeRoAck(deviceID, 'onROMoveStories', action.RunningOrderID, async () => {
                rundownStore.handleROMoveStories(action, storyIDs.map(id => mosTypes.mosString128.stringify(id)));
                return makeRoAck(action.RunningOrderID);
            })
        );

        mosDevice.onRODeleteStories(async (action: IMOSROAction, storyIDs: IMOSString128[]) =>
            safeRoAck(deviceID, 'onRODeleteStories', action.RunningOrderID, async () => {
                rundownStore.handleRODeleteStories(action, storyIDs.map(id => mosTypes.mosString128.stringify(id)));
                return makeRoAck(action.RunningOrderID);
            })
        );

        mosDevice.onROSwapStories(async (action: IMOSROAction, storyID0: IMOSString128, storyID1: IMOSString128) =>
            safeRoAck(deviceID, 'onROSwapStories', action.RunningOrderID, async () => {
                rundownStore.handleROSwapStories(
                    action,
                    mosTypes.mosString128.stringify(storyID0),
                    mosTypes.mosString128.stringify(storyID1)
                );
                return makeRoAck(action.RunningOrderID);
            })
        );

        // Item 级别操作
        // INSERT/MOVE：element_target.storyID + itemID = 所在 story 及插入/移动到此 item 之前
        // REPLACE：element_target.storyID + itemID = 所在 story 及被替换的 item
        // DELETE：element_target.storyID = 包含这些 item 的 story（无 itemID）
        // SWAP：element_target.storyID = 包含这两个 item 的 story（无 itemID）

        mosDevice.onROInsertItems(async (action: IMOSItemAction, items: IMOSItem[]) =>
            safeRoAck(deviceID, 'onROInsertItems', action.RunningOrderID, async () => {
                rundownStore.handleROInsertItems(action, items);
                return makeRoAck(action.RunningOrderID);
            })
        );

        mosDevice.onROReplaceItems(async (action: IMOSItemAction, items: IMOSItem[]) =>
            safeRoAck(deviceID, 'onROReplaceItems', action.RunningOrderID, async () => {
                rundownStore.handleROReplaceItems(action, items);
                return makeRoAck(action.RunningOrderID);
            })
        );

        // sofie 库类型声明 bug：onROMoveItems 签名写的是 IMOSStoryAction，
        // 但协议要求且实现实际传入的是 IMOSItemAction（含 StoryID + ItemID）
        // 用 any 绕过库的错误签名，内部强转为正确类型
        mosDevice.onROMoveItems(async (action: any, itemIDs: IMOSString128[]) => {
            const typedAction = action as IMOSItemAction;
            return safeRoAck(deviceID, 'onROMoveItems', typedAction.RunningOrderID, async () => {
                rundownStore.handleROMoveItems(typedAction, itemIDs.map(id => mosTypes.mosString128.stringify(id)));
                return makeRoAck(typedAction.RunningOrderID);
            });
        });

        mosDevice.onRODeleteItems(async (action: IMOSStoryAction, itemIDs: IMOSString128[]) =>
            safeRoAck(deviceID, 'onRODeleteItems', action.RunningOrderID, async () => {
                rundownStore.handleRODeleteItems(action, itemIDs.map(id => mosTypes.mosString128.stringify(id)));
                return makeRoAck(action.RunningOrderID);
            })
        );

        mosDevice.onROSwapItems(async (action: IMOSStoryAction, itemID0: IMOSString128, itemID1: IMOSString128) =>
            safeRoAck(deviceID, 'onROSwapItems', action.RunningOrderID, async () => {
                rundownStore.handleROSwapItems(
                    action,
                    mosTypes.mosString128.stringify(itemID0),
                    mosTypes.mosString128.stringify(itemID1)
                );
                return makeRoAck(action.RunningOrderID);
            })
        );

        // ── Profile 3：媒体对象高级操作（存根）───────────────────────────────

        mosDevice.onObjectCreate(async (obj: IMOSObject) =>
            safeMosAck(deviceID, 'onObjectCreate', obj.ID ?? mosTypes.mosString128.create('0'), async () =>
                makeMosAck(obj.ID ?? mosTypes.mosString128.create('0'))
            )
        );

        mosDevice.onItemReplace(async (roID: IMOSString128, _storyID: IMOSString128, _item: IMOSItem) =>
            safeRoAck(deviceID, 'onItemReplace', roID, async () => makeRoAck(roID))
        );

        mosDevice.onRequestObjectActionNew(async (obj: IMOSObject) =>
            safeMosAck(deviceID, 'onRequestObjectActionNew', obj.ID ?? mosTypes.mosString128.create('0'), async () =>
                makeMosAck(obj.ID ?? mosTypes.mosString128.create('0'))
            )
        );

        mosDevice.onRequestObjectActionUpdate(async (objId: IMOSString128, _obj: IMOSObject) =>
            safeMosAck(deviceID, 'onRequestObjectActionUpdate', objId, async () => makeMosAck(objId))
        );

        mosDevice.onRequestObjectActionDelete(async (objId: IMOSString128) =>
            safeMosAck(deviceID, 'onRequestObjectActionDelete', objId, async () => makeMosAck(objId))
        );

        mosDevice.onRequestObjectList(async (req: IMOSRequestObjectList): Promise<IMOSObjectList> => ({
            username: req.username,
            queryID: mosTypes.mosString128.stringify(req.queryID),
            listReturnStart: 0,
            listReturnEnd: 0,
            listReturnTotal: 0,
            list: [],
        }));

        mosDevice.onRequestSearchableSchema(async (username: string): Promise<IMOSListSearchableSchema> => ({
            username,
            mosSchema: '',
        }));

        // ── Profile 4：全量节目单同步 ─────────────────────────────────────────

        mosDevice.onRequestAllRunningOrders(async (): Promise<IMOSRunningOrder[]> => {
            const all = rundownStore.getAllRunningOrdersForNCS();
            logger.info(`[P4][${deviceID}] reqAllRunningOrders → ${all.length} RO(s)`);
            return all;
        });

        mosDevice.onRunningOrderStory(async (story: IMOSROFullStory) =>
            safeRoAck(deviceID, 'onRunningOrderStory', story.RunningOrderId, async () => {
                rundownStore.handleRunningOrderStory(story);
                return makeRoAck(story.RunningOrderId);
            })
        );

        // ── 最终校验 ──────────────────────────────────────────────────────────
        mosDevice.checkProfileValidness();
        logger.info(`[MosConnector] All callbacks validated for: "${deviceID}"`);
    }
}