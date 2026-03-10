/**
 * @fileoverview RundownStore — 业务状态中心
 *
 * 职责：
 * - 监听 MosCache 的事件，调用 2_ingest 转换为 IRundown
 * - 维护 IRundown 的内存状态（系统唯一真相来源）
 * - 维护每个 Rundown 的生命周期状态（独立于 PlaylistStatus）
 * - 持久化 IRundown 到磁盘
 * - 通过 EventEmitter 向下游（Socket.io）推送变更
 *
 * 生命周期状态（LifecycleStatus）：
 *   persisted  仅存在于磁盘，未加载进内存
 *   standby    已加载进内存，但当前有其他 Rundown 处于 active/on-air
 *   active     当前导播正在使用，同时只能有一个
 *   on-air     active 状态下已执行第一个 Take，最需要保护
 *
 * 注意：PlaylistStatus 是来自 NCS 的播出状态，与 LifecycleStatus 职责不同，
 * 两者独立维护，互不干扰。
 *
 * 自动激活规则：
 *   - NCS 推送新 Rundown 时：
 *     - 若当前无 active/on-air Rundown → 直接激活
 *     - 若当前有 on-air Rundown → 进入 standby，前端显示提示
 *
 * 启动恢复行为：
 *   - 只加载持久化索引，建立已知列表
 *   - 不自动激活任何 Rundown
 *   - 导播在前端选择器里按需激活
 */

import { EventEmitter } from 'eventemitter3';
import { mosCache }     from './mos-cache';
import { mosRunningOrderToRundown } from '../../2_ingest/mos-to-rundown';
import { loadAllPersistedROs, persistRO, deletePersistedRO } from './json-persistence';
import { logger }       from '../../../shared/logger';
import { IRundown }     from '../../../../../core-lib/src/models/rundown-model';
import { LifecycleStatus, RundownSummary } from '../../../../../core-lib/src/socket/socket-contracts';
import { getMosTypes }  from '../../1_mos_connection/internals/mosTypes';

const mosTypes = getMosTypes(false);

// ─── 生命周期状态 ──────────────────────────────────────────────────────────────

//export type LifecycleStatus = 'persisted' | 'standby' | 'active' | 'on-air';

/* export interface RundownSummary {
    id:              string;
    name:            string;
    lifecycle:       LifecycleStatus;
    segmentCount:    number;
} */

// ─── 事件类型 ─────────────────────────────────────────────────────────────────

export interface RundownStoreEvents {
    rundownCreated:         (id: string, rundown: IRundown) => void;
    rundownUpdated:         (id: string, rundown: IRundown) => void;
    rundownDeleted:         (id: string) => void;
    rundownActivated:       (id: string, rundown: IRundown) => void;
    rundownStandby:         (id: string) => void;
    lifecycleChanged:       (id: string, lifecycle: LifecycleStatus) => void;
    restored:               (summaries: RundownSummary[]) => void;
}

// ─── RundownStore ─────────────────────────────────────────────────────────────

export class RundownStore extends EventEmitter<RundownStoreEvents> {

    /** 内存中的完整 Rundown 数据（active / standby / on-air） */
    private _rundowns:   Map<string, IRundown>         = new Map();

    /** 所有已知 Rundown 的生命周期状态（含 persisted） */
    private _lifecycles: Map<string, LifecycleStatus>  = new Map();

    /** persisted 状态的 Rundown 摘要（只有 id + name，不加载完整数据） */
    private _persistedSummaries: Map<string, { id: string; name: string }> = new Map();

    // ── 初始化：订阅 MosCache 事件 ────────────────────────────────────────────

    init(): void {
        mosCache.on('roCreated', (_roID, ro) => {
            try {
                const rundown  = mosRunningOrderToRundown(ro);
                const id       = rundown.externalId;
                const hasOnAir = this._hasOnAir();

                this._rundowns.set(id, rundown);
                persistRO(ro);

                if (hasOnAir) {
                    // 当前有节目在播，进入待命
                    this._setLifecycle(id, 'standby');
                    logger.info(`[RundownStore] Created (standby): "${id}" "${rundown.name}"`);
                    this.emit('rundownCreated', id, rundown);
                    this.emit('rundownStandby', id);
                } else {
                    // 空闲，直接激活
                    this._activateExclusive(id);
                    logger.info(`[RundownStore] Created (auto-activated): "${id}" "${rundown.name}"`);
                    this.emit('rundownCreated', id, rundown);
                    this.emit('rundownActivated', id, rundown);
                }
            } catch (err) {
                logger.error('[RundownStore] Failed to convert roCreated:', err);
            }
        });

        mosCache.on('roReplaced', (_roID, ro) => {
            try {
                const rundown = mosRunningOrderToRundown(ro);
                const id      = rundown.externalId;
                this._rundowns.set(id, rundown);
                persistRO(ro);
                // 保持原有生命周期状态不变
                if (!this._lifecycles.has(id)) {
                    this._setLifecycle(id, 'standby');
                }
                logger.info(`[RundownStore] Replaced: "${id}"`);
                this.emit('rundownUpdated', id, rundown);
            } catch (err) {
                logger.error('[RundownStore] Failed to convert roReplaced:', err);
            }
        });

        mosCache.on('roDeleted', (roID) => {
            this._rundowns.delete(roID);
            this._lifecycles.delete(roID);
            this._persistedSummaries.delete(roID);
            deletePersistedRO(roID);
            logger.info(`[RundownStore] Deleted: "${roID}"`);
            this.emit('rundownDeleted', roID);
        });

        mosCache.on('roMetadataUpdated', (_roID, ro) => {
            try {
                const rundown = mosRunningOrderToRundown(ro);
                const id      = rundown.externalId;
                this._rundowns.set(id, rundown);
                persistRO(ro);
                if (!this._lifecycles.has(id)) {
                    this._setLifecycle(id, 'standby');
                }
                logger.info(`[RundownStore] Metadata updated: "${id}"`);
                this.emit('rundownUpdated', id, rundown);
            } catch (err) {
                logger.error('[RundownStore] Failed to convert roMetadataUpdated:', err);
            }
        });

        mosCache.on('storyChanged', (_roID, _changeType, ro) => {
            try {
                const rundown = mosRunningOrderToRundown(ro);
                const id      = rundown.externalId;
                this._rundowns.set(id, rundown);
                persistRO(ro);
                if (!this._lifecycles.has(id)) {
                    this._setLifecycle(id, 'standby');
                }
                logger.debug(`[RundownStore] Story changed: "${id}" (${_changeType})`);
                this.emit('rundownUpdated', id, rundown);
            } catch (err) {
                logger.error('[RundownStore] Failed to convert storyChanged:', err);
            }
        });

        logger.info('[RundownStore] Subscribed to MosCache events.');
    }

    // ── 启动恢复（只加载索引，不自动激活） ───────────────────────────────────

    async restore(): Promise<void> {
        const ros = loadAllPersistedROs();

        // 恢复 MosCache（供 roReq 回调使用）
        mosCache.restore(ros);

        // 只建立摘要索引，不加载进 _rundowns
        const summaries: RundownSummary[] = [];
        for (const ro of ros) {
            try {
                const id   = mosTypes.mosString128.stringify(ro.ID!);
                const name = mosTypes.mosString128.stringify(ro.Slug);
                this._persistedSummaries.set(id, { id, name });
                this._lifecycles.set(id, 'persisted');
                summaries.push({ id, name, lifecycle: 'persisted', segmentCount: ro.Stories?.length ?? 0 });
                logger.debug(`[RundownStore] Indexed persisted RO: "${id}" "${name}"`);
            } catch (err) {
                logger.error('[RundownStore] Failed to index persisted RO:', err);
            }
        }

        logger.info(`[RundownStore] Restored index: ${summaries.length} persisted rundown(s). None auto-activated.`);
        this.emit('restored', summaries);
    }

    // ── 手动激活（导播从选择器里选择） ───────────────────────────────────────

    activate(id: string): boolean {
        // 如果是 persisted 状态，需要先从磁盘加载完整数据
        if (this._lifecycles.get(id) === 'persisted') {
            const ros = loadAllPersistedROs();
            const ro  = ros.find(r => mosTypes.mosString128.stringify(r.ID!) === id);
            if (!ro) {
                logger.warn(`[RundownStore] activate: persisted RO "${id}" not found on disk.`);
                return false;
            }
            try {
                const rundown = mosRunningOrderToRundown(ro);
                this._rundowns.set(id, rundown);
                this._persistedSummaries.delete(id);
            } catch (err) {
                logger.error(`[RundownStore] activate: failed to load "${id}":`, err);
                return false;
            }
        }

        if (!this._rundowns.has(id)) {
            logger.warn(`[RundownStore] activate: "${id}" not found.`);
            return false;
        }

        this._activateExclusive(id);
        const rundown = this._rundowns.get(id)!;
        logger.info(`[RundownStore] Manually activated: "${id}"`);
        this.emit('rundownActivated', id, JSON.parse(JSON.stringify(rundown)));
        return true;
    }

    // ── 设置 on-air 状态（第一个 Take 时由 engine 调用） ─────────────────────

    setOnAir(id: string): boolean {
        if (this._lifecycles.get(id) !== 'active' && this._lifecycles.get(id) !== 'on-air') {
            logger.warn(`[RundownStore] setOnAir: "${id}" is not active.`);
            return false;
        }
        this._setLifecycle(id, 'on-air');
        logger.info(`[RundownStore] On-air: "${id}"`);
        return true;
    }

    // ── 只读查询 ──────────────────────────────────────────────────────────────

    /** 获取所有已知 Rundown 的摘要（含 persisted） */
    getAllSummaries(): RundownSummary[] {
        const result: RundownSummary[] = [];

        // persisted（只有摘要）
        for (const [id, summary] of this._persistedSummaries) {
            result.push({
                id,
                name:         summary.name,
                lifecycle:    'persisted',
                segmentCount: 0,
            });
        }

        // 内存中的（standby / active / on-air）
        for (const [id, rundown] of this._rundowns) {
            result.push({
                id,
                name:         rundown.name,
                lifecycle:    this._lifecycles.get(id) ?? 'standby',
                segmentCount: rundown.segments?.length ?? 0,
            });
        }

        return result;
    }

    /** 获取单个 Rundown 完整数据（仅内存中的） */
    getRundown(id: string): IRundown | undefined {
        const r = this._rundowns.get(id);
        return r ? JSON.parse(JSON.stringify(r)) : undefined;
    }

    getLifecycle(id: string): LifecycleStatus | undefined {
        return this._lifecycles.get(id);
    }

    getActiveRundown(): IRundown | undefined {
        for (const [id, lifecycle] of this._lifecycles) {
            if (lifecycle === 'active' || lifecycle === 'on-air') {
                return this.getRundown(id);
            }
        }
        return undefined;
    }

    get count(): number { return this._lifecycles.size; }

    getAllIDs(): string[] { return Array.from(this._lifecycles.keys()); }

    // ── 兼容旧接口（供 index.ts REST API 使用，后续前端完成后可移除） ─────────

    getAllRundowns(): IRundown[] {
        return Array.from(this._rundowns.values()).map(r =>
            JSON.parse(JSON.stringify(r))
        );
    }

    // ── 私有工具方法 ──────────────────────────────────────────────────────────

    private _hasOnAir(): boolean {
        for (const lifecycle of this._lifecycles.values()) {
            if (lifecycle === 'on-air') return true;
        }
        return false;
    }

    private _activateExclusive(id: string): void {
        // 将其他 active 降级为 standby
        for (const [otherId, lifecycle] of this._lifecycles) {
            if (otherId !== id && (lifecycle === 'active' || lifecycle === 'on-air')) {
                this._setLifecycle(otherId, 'standby');
                logger.info(`[RundownStore] Demoted to standby: "${otherId}"`);
            }
        }
        this._setLifecycle(id, 'active');
    }

    private _setLifecycle(id: string, status: LifecycleStatus): void {
        this._lifecycles.set(id, status);
        this.emit('lifecycleChanged', id, status);
    }
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const rundownStore = new RundownStore();