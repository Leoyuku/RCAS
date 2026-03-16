/**
 * @fileoverview RundownEngine — 播出状态机
 *
 * 职责：
 * - 维护 RundownRuntime（onAirPartId / previewPartId / nextPartId / engineState）
 * - 响应前端 intent:take / intent:setNext / intent:sendToPreview
 * - 通过 EventEmitter 向 socket-server 推送 runtime:state 变更
 *
 * 本轮范围（第二轮）：
 *   ✅ 状态机逻辑（STOPPED → READY → RUNNING）
 *   ✅ Part 指针移动（onAirPartId / previewPartId / nextPartId）
 *   ❌ Timeline Builder / Resolver / 设备命令（第三轮实现）
 *
 * 数据流：
 *   前端 intent:* → SocketServer → RundownEngine → emit runtimeChanged → SocketServer → 前端 runtime:state
 */

import { buildTimeline }          from './timeline-builder'
import { resolve, diff }          from './resolver'
import type { IPartInstance } from '../../../../../core-lib/src/models/part-instance-model'
import type { DesiredState }      from './resolver'
import { EventEmitter }  from 'eventemitter3';
import { rundownStore }  from '../store/rundown-store';
import { saveRuntimeSnapshot, loadRuntimeSnapshot, clearRuntimeSnapshot } from './runtime-persistence'
import { logger }        from '../../../shared/logger';
import type { EngineState, RundownRuntime } from '../../../../../core-lib/src/socket/socket-contracts';
import type { IPart }    from '../../../../../core-lib/src/models/part-model';

// ─── 事件类型 ─────────────────────────────────────────────────────────────────

export interface RundownEngineEvents {
    runtimeChanged: (runtime: RundownRuntime) => void;
    commandsReady: (commands: import('./resolver').DeviceCommand[]) => void
}

// ─── RundownEngine ────────────────────────────────────────────────────────────

export class RundownEngine extends EventEmitter<RundownEngineEvents> {

    private _runtime: RundownRuntime | null = null;
    private _partInstances: IPartInstance[]  = []
    private _lastSentState: DesiredState     = new Map()
    private _stateLoopTimer: NodeJS.Timeout | null = null

    // ── 初始化：监听 RundownStore 激活事件 ───────────────────────────────────

    init(): void {
        // Rundown 被激活时，初始化 runtime
        rundownStore.on('rundownActivated', (id, rundown) => {
            const parts = this._getAllParts(id);
            if (parts.length === 0) {
                logger.warn(`[RundownEngine] Activated rundown "${id}" has no parts.`);
                this._setRuntime({
                    rundownId:     id,
                    engineState:   'STOPPED',
                    onAirPartId:   null,
                    previewPartId: null,
                    nextPartId:    null,
                });
                return;
            }

            // 激活时：nextPartId 指向第一个 Part，等待导播 TAKE
            this._setRuntime({
                rundownId:     id,
                engineState:   'READY',
                onAirPartId:   null,
                previewPartId: null,
                nextPartId:    parts[0]._id,
            });

            logger.info(`[RundownEngine] Ready: "${id}", first part: "${parts[0]._id}"`);
        });

        // Rundown 被删除时，清空 runtime
        rundownStore.on('rundownDeleted', (id) => {
            if (this._runtime?.rundownId === id) {
                this._runtime = null;
                this._stopStateLoop()
                this._partInstances = []
                this._lastSentState = new Map()
                logger.info(`[RundownEngine] Runtime cleared: rundown "${id}" deleted.`);
            }
        });

        logger.info('[RundownEngine] Initialized.');
    }

    // ── Intent 处理 ───────────────────────────────────────────────────────────

    /**
     * TAKE：将 previewPartId（或 nextPartId）切换为 onAir
     */
    intentTake(): { ok: boolean; error?: string } {
        if (!this._runtime) {
            return { ok: false, error: 'No active rundown' };
        }

        const { engineState, previewPartId, nextPartId, rundownId } = this._runtime;

        if (engineState === 'STOPPED' || engineState === 'ERROR') {
            return { ok: false, error: `Cannot TAKE in state: ${engineState}` };
        }

        // TAKE 的目标：优先用 preview，否则用 next
        const takePartId = previewPartId ?? nextPartId;
        if (!takePartId) {
            return { ok: false, error: 'Nothing to TAKE' };
        }

        // 计算新的 next（当前 onAir 之后的下一个）
        const parts        = this._getAllParts(rundownId);
        const takeIndex    = parts.findIndex(p => p._id === takePartId);
        const newPreviewId = parts[takeIndex + 1]?._id ?? null;
        const newNextId    = parts[takeIndex + 2]?._id ?? null;

        this._setRuntime({
            ...this._runtime,
            engineState:   'RUNNING',
            onAirPartId:   takePartId,
            previewPartId: newPreviewId,
            nextPartId:    newNextId,
        });

        // 同步更新 RundownStore 的 currentPartId / nextPartId
        const rundown = rundownStore.getRundown(rundownId);
        if (rundown) {
            rundown.currentPartId = takePartId as any;
            rundown.nextPartId    = newNextId as any;
        }

        // 第一次 TAKE 时将 Rundown 升级为 on-air
        rundownStore.setOnAir(rundownId);
        // 创建新的 PartInstance
        const newInstance: IPartInstance = {
            instanceId: `${takePartId}_${Date.now()}`,
            rundownId,
            part:       parts.find(p => p._id === takePartId)!,
            startTime:  Date.now(),
            ended:      false,
            pieces:     [],
        }

        // 清理已结束的旧实例，加入新实例
        this._partInstances = this._partInstances.filter(i => !i.ended && !(i as any).isPreview)
        this._partInstances.push(newInstance)

        // 触发 State Loop
        this._startStateLoop()
        logger.info(`[RundownEngine] TAKE → onAir: "${takePartId}", next: "${newNextId}"`);
        return { ok: true };
    }

    /**
     * SET NEXT：手动指定下一个要播的 Part
     */
    intentSetNext(partId: string): { ok: boolean; error?: string } {
        if (!this._runtime) {
            return { ok: false, error: 'No active rundown' };
        }

        const parts = this._getAllParts(this._runtime.rundownId);
        const part  = parts.find(p => p._id === partId);
        if (!part) {
            return { ok: false, error: `Part "${partId}" not found` };
        }

        this._setRuntime({
            ...this._runtime,
            nextPartId: partId,
        });

        logger.info(`[RundownEngine] SET NEXT → "${partId}"`);
        return { ok: true };
    }

    /**
     * SEND TO PREVIEW：将 next 推入 preview
     */
    intentSendToPreview(): { ok: boolean; error?: string } {
        if (!this._runtime) {
            return { ok: false, error: 'No active rundown' };
        }

        const { nextPartId } = this._runtime;
        if (!nextPartId) {
            return { ok: false, error: 'No next part to preview' };
        }

        this._setRuntime({
            ...this._runtime,
            previewPartId: nextPartId,
            nextPartId:    null,
        });

        // SEND TO PREVIEW 时提前设置 Preview 源
        // 创建一个 PreviewInstance，让 Timeline Builder 生成 preview 相关的 TimelineObject
        const parts      = this._getAllParts(this._runtime.rundownId)
        const previewPart = parts.find(p => p._id === nextPartId)
        if (previewPart) {
            const previewInstance: IPartInstance = {
                instanceId: `${nextPartId}_preview_${Date.now()}`,
                rundownId:  this._runtime.rundownId,
                part:       previewPart,
                startTime:  Date.now(),
                ended:      false,
                pieces:     [],
                isPreview:  true,
            }
            this._partInstances = this._partInstances.filter(i => !(i as any).isPreview)
            this._partInstances.push(previewInstance)
            this._lastSentState.delete('video.preview')
            this._startStateLoop()
            this._tickStateLoop() // 立即触发一次，不等心跳
        }

        logger.info(`[RundownEngine] SEND TO PREVIEW → "${nextPartId}"`);
        return { ok: true };
    }

    // ── 只读查询 ──────────────────────────────────────────────────────────────

    getRuntime(): RundownRuntime | null {
        return this._runtime;
    }

    // ── 私有工具 ──────────────────────────────────────────────────────────────

    private _setRuntime(runtime: RundownRuntime): void {
        this._runtime = runtime;
        this.emit('runtimeChanged', runtime);
        // 每次 runtime 变化时保存快照
        if (runtime.engineState !== 'STOPPED') {
            saveRuntimeSnapshot(runtime, this._partInstances)
        }
    }

    /**
     * 从 RundownStore 取出指定 Rundown 的所有 Parts（按 rank 排序）
     */
    private _getAllParts(rundownId: string): IPart[] {
        const rundown = rundownStore.getRundown(rundownId);
        if (!rundown?.segments) return [];

        return rundown.segments
            .sort((a, b) => a.rank - b.rank)
            .flatMap(seg => (seg.parts ?? []).sort((a, b) => a.rank - b.rank));
    }

    // ── State Loop ────────────────────────────────────────────────────────────

    /**
     * 启动持续心跳（每100ms执行一次）
     * 让系统真正"时间驱动"：duration到期、AdLib触发等都由心跳自动处理
     */
    private _startStateLoop(): void {
        if (this._stateLoopTimer) return // 已在运行
        logger.info('[RundownEngine] State loop started.')
        this._stateLoopTimer = setInterval(() => {
            this._tickStateLoop()
        }, 100)
    }

    private _stopStateLoop(): void {
        if (this._stateLoopTimer) {
            clearInterval(this._stateLoopTimer)
            this._stateLoopTimer = null
            logger.info('[RundownEngine] State loop stopped.')
            clearRuntimeSnapshot()
        }
    }

    private _tickStateLoop(): void {
        if (this._partInstances.length === 0) return

        // 清理已结束超过10秒的旧实例
        const now = Date.now()
        this._partInstances = this._partInstances.filter(i => {
            if (i.ended && i.endTime && now - i.endTime > 10_000) {
                logger.debug(`[RundownEngine] PartInstance "${i.instanceId}" expired, removing.`)
                return false
            }
            return true
        })

        const timelineObjects = buildTimeline(this._partInstances)
        const desiredState    = resolve(timelineObjects, now)
        const commands        = diff(desiredState, this._lastSentState)

        if (commands.length > 0) {
            logger.info(`[RundownEngine] State loop tick: ${commands.length} command(s)`)
            this.emit('commandsReady', commands)
            this._lastSentState = desiredState
        }
    }

    // ── 崩溃恢复 ──────────────────────────────────────────────────────────────

    public restoreFromSnapshot(): void {
        const snapshot = loadRuntimeSnapshot()
        if (!snapshot) return

        const { runtime, partInstances } = snapshot

        // 如果 Rundown 还在 persisted 状态，先激活加载进内存
        const lifecycle = rundownStore.getLifecycle(runtime.rundownId)
        if (lifecycle === 'persisted') {
            logger.info(`[RundownEngine] Snapshot: activating persisted rundown "${runtime.rundownId}"`)
            rundownStore.activate(runtime.rundownId)
        }

        // 验证对应的 Rundown 是否还存在
        const rundown = rundownStore.getRundown(runtime.rundownId)
        if (!rundown) {
            logger.warn(`[RundownEngine] Snapshot rundown "${runtime.rundownId}" not in store, skipping restore.`)
            clearRuntimeSnapshot()
            return
        }

        // 恢复 PartInstances（从 RundownStore 重新查找 Part 对象）
        const allParts = this._getAllParts(runtime.rundownId)
        const restored: IPartInstance[] = []

        for (const si of partInstances) {
            const part = allParts.find(p => p._id === si.partId)
            if (!part) {
                logger.warn(`[RundownEngine] Snapshot part "${si.partId}" not found, skipping.`)
                continue
            }
            restored.push({
                instanceId: si.instanceId,
                rundownId:  si.rundownId,
                part,
                startTime:  si.startTime,
                endTime:    si.endTime,
                ended:      si.ended,
                pieces:     [],
                ...(si.isPreview ? { isPreview: true } : {}),
            } as IPartInstance)
        }

        this._partInstances = restored
        this._runtime       = runtime

        logger.info(`[RundownEngine] Restored from snapshot: engine=${runtime.engineState}, instances=${restored.length}`)

        // 如果之前在播出中，恢复 State Loop
        if (runtime.engineState === 'RUNNING' || runtime.engineState === 'READY') {
            this._startStateLoop()
        }

        // 推送恢复后的 runtime 给前端
        this.emit('runtimeChanged', runtime)
    }
}

// ─── 全局单例 ─────────────────────────────────────────────────────────────────

export const rundownEngine = new RundownEngine();