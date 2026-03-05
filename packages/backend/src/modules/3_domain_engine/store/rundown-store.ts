/**
 * @fileoverview RundownStore — 业务状态中心
 *
 * 职责：
 * - 监听 MosCache 的事件，调用 2_ingest 转换为 IRundown
 * - 维护 IRundown 的内存状态（系统唯一真相来源）
 * - 持久化 IRundown 到磁盘
 * - 通过 EventEmitter 向下游（Socket.io）推送变更
 *
 * 这是系统对外暴露的唯一业务状态接口。
 * 前端、REST API、domain engine 都只与本类交互。
 */

import { EventEmitter } from 'eventemitter3';
import { mosCache }     from './mos-cache';
import { mosRunningOrderToRundown } from '../../2_ingest/mos-to-rundown';
import { loadAllPersistedROs, persistRO, deletePersistedRO } from './json-persistence';
import { logger }       from '../../../shared/logger';
import { IRundown }     from '../../../../../core-lib/src/models/rundown-model';
import { getMosTypes }  from '../../1_mos_connection/internals/mosTypes';

const mosTypes = getMosTypes(false);

// ─── 事件类型 ─────────────────────────────────────────────────────────────────

export interface RundownStoreEvents {
    rundownCreated:  (id: string, rundown: IRundown) => void;
    rundownUpdated:  (id: string, rundown: IRundown) => void;
    rundownDeleted:  (id: string) => void;
    restored:        (count: number) => void;
}

// ─── RundownStore ─────────────────────────────────────────────────────────────

export class RundownStore extends EventEmitter<RundownStoreEvents> {

    private _rundowns: Map<string, IRundown> = new Map();

    // ── 初始化：订阅 MosCache 事件 ────────────────────────────────────────────

    init(): void {
        mosCache.on('roCreated', (_roID, ro) => {
            try {
                const rundown = mosRunningOrderToRundown(ro);
                this._rundowns.set(rundown.externalId, rundown);
                persistRO(ro);
                logger.info(`[RundownStore] Created: "${rundown.externalId}" "${rundown.name}"`);
                this.emit('rundownCreated', rundown.externalId, rundown);
            } catch (err) {
                logger.error('[RundownStore] Failed to convert roCreated:', err);
            }
        });

        mosCache.on('roReplaced', (_roID, ro) => {
            try {
                const rundown = mosRunningOrderToRundown(ro);
                this._rundowns.set(rundown.externalId, rundown);
                persistRO(ro);
                logger.info(`[RundownStore] Replaced: "${rundown.externalId}"`);
                this.emit('rundownUpdated', rundown.externalId, rundown);
            } catch (err) {
                logger.error('[RundownStore] Failed to convert roReplaced:', err);
            }
        });

        mosCache.on('roDeleted', (roID) => {
            this._rundowns.delete(roID);
            deletePersistedRO(roID);
            logger.info(`[RundownStore] Deleted: "${roID}"`);
            this.emit('rundownDeleted', roID);
        });

        mosCache.on('roMetadataUpdated', (_roID, ro) => {
            try {
                const rundown = mosRunningOrderToRundown(ro);
                this._rundowns.set(rundown.externalId, rundown);
                persistRO(ro);
                logger.info(`[RundownStore] Metadata updated: "${rundown.externalId}"`);
                this.emit('rundownUpdated', rundown.externalId, rundown);
            } catch (err) {
                logger.error('[RundownStore] Failed to convert roMetadataUpdated:', err);
            }
        });

        mosCache.on('storyChanged', (_roID, _changeType, ro) => {
            try {
                const rundown = mosRunningOrderToRundown(ro);
                this._rundowns.set(rundown.externalId, rundown);
                persistRO(ro);
                logger.debug(`[RundownStore] Story changed: "${rundown.externalId}" (${_changeType})`);
                this.emit('rundownUpdated', rundown.externalId, rundown);
            } catch (err) {
                logger.error('[RundownStore] Failed to convert storyChanged:', err);
            }
        });

        logger.info('[RundownStore] Subscribed to MosCache events.');
    }

    // ── 启动恢复 ──────────────────────────────────────────────────────────────

    async restore(): Promise<void> {
        const ros = loadAllPersistedROs();
        // 先恢复 MosCache（原始协议对象）
        mosCache.restore(ros);
        // 再转换为 IRundown
        for (const ro of ros) {
            try {
                const rundown = mosRunningOrderToRundown(ro);
                this._rundowns.set(rundown.externalId, rundown);
            } catch (err) {
                const roID = mosTypes.mosString128.stringify(ro.ID!);
                logger.error(`[RundownStore] Failed to restore RO "${roID}":`, err);
            }
        }
        logger.info(`[RundownStore] Restored ${this._rundowns.size} rundown(s).`);
        this.emit('restored', this._rundowns.size);
    }

    // ── 只读查询 ──────────────────────────────────────────────────────────────

    getAllRundowns(): IRundown[] {
        return Array.from(this._rundowns.values()).map(r =>
            JSON.parse(JSON.stringify(r))
        );
    }

    getRundown(id: string): IRundown | undefined {
        const r = this._rundowns.get(id);
        return r ? JSON.parse(JSON.stringify(r)) : undefined;
    }

    get count(): number { return this._rundowns.size; }

    getAllIDs(): string[] { return Array.from(this._rundowns.keys()); }
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const rundownStore = new RundownStore();