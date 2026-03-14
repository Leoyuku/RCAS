# RCAS 项目 HANDOFF 文档
# 新对话读到这里，立刻可以无缝衔接

---

## 你是谁，你在做什么

你是 RCAS（播出控制自动化系统）的总体架构师，是行业的资深领军人物。
RCAS 是一套新闻演播室播出控制系统，把 octopus/iNEWS（NCS）的节目单翻译成
Tricaster / VIZ Engine / LAWO 三台设备的控制指令。
导播通过 RCAS 完成 SET NEXT → SEND TO PREVIEW → TAKE 三步播出工作流。

---

## 当前进度（2026-03-10）

### 已完成
- ✅ 系统架构设计规范 v2.5（见 Project Knowledge：RCAS_Frontend_Spec_v2.5.docx）
- ✅ 后端核心模块（Node.js + TypeScript + Socket.io，端口 3000）
  - MOS 协议解析（Profile 0/2/4，9/9 验证通过）
  - RundownStore：内存状态 + 生命周期管理（persisted → standby → active → on-air）
  - JSON 持久化（防抖500ms，data/rundowns/）
  - Socket.io 事件体系（snapshot + intent 双向）
- ✅ domain engine 完整实现
  - 播出状态机（STOPPED → READY → RUNNING）
  - PartInstance 生命周期（创建 → 播出 → 结束 → 10秒清理）
  - State Loop 心跳（100ms，时间驱动）
  - Timeline Builder（纯函数：PartInstances → TimelineObjects）
  - Resolver + Diff Engine（纯函数：最小命令集）
  - 崩溃恢复（runtime-persistence.ts，服务重启自动恢复 engine 状态）
- ✅ Tricaster 设备驱动
  - TricasterClient：双通道 WebSocket（控制 + 通知），指数退避重连
  - TricasterDriver：监听 commandsReady → sendShortcut
  - Tricaster IP：192.168.17.159（局域网，云端环境无法访问）
- ✅ 前端 Step2 完成
  - 三栏布局（Rundown列表 / ON AIR + PREVIEW + NEXT / 操作区）
  - TAKE / SEND TO PREVIEW 按钮接通 engine
  - Zustand store（runtime 状态 + 三个 intent 方法）

### 端到端验证结论
- SEND TO PREVIEW → `main_preview_source = Input1` ✅
- TAKE → `main_background_take` ✅
- 崩溃重启 → 自动恢复 engine=RUNNING + PartInstances ✅
- Tricaster 命令发送：云端 ETIMEDOUT 为预期（局域网换环境后验证）

### 尚未完成（按优先级）
- ❌ Actual State 回路（change_notifications 接入，需要 Tricaster 在线）
- ❌ TAKING / TRANSITION 状态机（TAKE 六步骤完整实现）
- ❌ 前端完整节目单树（Segment/Part 层级 + Part 类型颜色）
- ❌ 设备状态指示灯（前端显示 Tricaster/VIZ/LAWO 连接状态）
- ❌ Blueprint 完善（等真实 Octopus 字段数据）
- ❌ AdLib 面板
- ❌ VIZ Engine / LAWO Driver

---

## 项目结构
```
/home/user/rcas/   （monorepo 根目录，npm start 启动后端）
├── packages/
│   ├── backend/src/
│   │   ├── shared/
│   │   │   ├── config.ts              PORT=3000, tricasterHost, tricasterEnabled
│   │   │   ├── logger.ts
│   │   │   └── startup-check.ts
│   │   ├── modules/
│   │   │   ├── 1_mos_connection/      MOS 协议接入（Sofie 移植，勿动）
│   │   │   ├── 2_ingest/
│   │   │   │   └── mos-to-rundown.ts  纯函数转换，Blueprint 临时规则
│   │   │   ├── 3_domain_engine/
│   │   │   │   ├── store/
│   │   │   │   │   ├── rundown-store.ts
│   │   │   │   │   ├── socket-server.ts
│   │   │   │   │   ├── json-persistence.ts
│   │   │   │   │   └── mos-cache.ts
│   │   │   │   └── engine/
│   │   │   │       ├── rundown-engine.ts       状态机 + PartInstance + State Loop
│   │   │   │       ├── timeline-builder.ts     纯函数
│   │   │   │       ├── resolver.ts             纯函数（resolve + diff）
│   │   │   │       └── runtime-persistence.ts  崩溃恢复
│   │   │   └── 4_playout_controllers/
│   │   │       └── tricaster/
│   │   │           ├── tricaster-client.ts     双通道 WebSocket
│   │   │           └── tricaster-driver.ts     commandsReady → sendShortcut
│   │   └── index.ts
│   ├── frontend/src/
│   │   ├── App.tsx                    三栏布局（Step2 完成）
│   │   └── store/useRCASStore.ts      Zustand store
│   └── core-lib/src/
│       ├── models/
│       │   ├── rundown-model.ts       IRundown / ISegment / IPart / IPiece
│       │   └── part-instance-model.ts IPartInstance / PlayConfig / isPreview
│       └── socket/
│           └── socket-contracts.ts    全部事件契约
├── data/
│   ├── rundowns/                      Rundown JSON 持久化
│   └── runtime/                       运行时快照（崩溃恢复）
└── .idx/dev.nix                       Firebase Studio web preview 配置
```

---

## Socket.io 事件体系（实际实现）

### 服务端 → 客户端
```typescript
'snapshot'              // 连接时全量推送 { summaries, activeRundown, runtime }
'rundown:created'       // { id, rundown }
'rundown:updated'       // { id, rundown }
'rundown:deleted'       // { id }
'rundown:activated'     // { id, rundown }
'rundown:standby'       // { id }
'rundown:lifecycle'     // { id, lifecycle: LifecycleStatus }
'runtime:state'         // RundownRuntime { rundownId, engineState, onAirPartId, previewPartId, nextPartId }
```

### 客户端 → 服务端
```typescript
'activate'              // { rundownId }
'intent:take'           // 无参数
'intent:sendToPreview'  // 无参数
'intent:setNext'        // { partId }
```

---

## 核心 TypeScript 类型
```typescript
// core-lib/src/socket/socket-contracts.ts
type LifecycleStatus = 'persisted' | 'standby' | 'active' | 'on-air'
type EngineState = 'STOPPED' | 'READY' | 'RUNNING' | 'ERROR'

interface RundownRuntime {
    rundownId:     string
    engineState:   EngineState
    onAirPartId:   string | null
    previewPartId: string | null
    nextPartId:    string | null
}

// core-lib/src/models/part-instance-model.ts
interface IPartInstance {
    instanceId: string
    rundownId:  string
    part:       IPart
    startTime:  number
    endTime?:   number
    ended:      boolean
    pieces:     IPiece[]
    isPreview?: boolean
}
```

---

## 状态驱动完整链路
```
导播 TAKE / SEND TO PREVIEW
  → SocketServer（intent 事件）
  → RundownEngine（状态机）
  → 创建 / 更新 PartInstance
  → State Loop 心跳（100ms）
  → buildTimeline(partInstances) → ITimelineObject[]   【纯函数】
  → resolve(objects, now)        → DesiredState        【纯函数】
  → diff(desired, lastSentState) → DeviceCommand[]     【纯函数】
  → emit commandsReady
  → TricasterDriver → tricasterClient.sendShortcut()
  → Tricaster 设备
```

---

## 重要注意事项

- **Zustand v5** 从 `zustand/react` 导入 `create`，不是从 `zustand`
- **verbatimModuleSyntax**：类型 import 必须用 `import type`
- **Blueprint 临时规则**：搜索 `// TODO: [BLUEPRINT]` 找到所有待补全位置
- **Tricaster**：云端环境连接会 ETIMEDOUT，这是预期行为，换局域网环境后验证
- **data/ 和 logs/** 已加入 .gitignore
- **Firebase Studio**：前端由 dev.nix 自动启动，后端在项目根目录 `npm start`

---

## 下一步工作方向

**最关键里程碑：换到有 Tricaster 的局域网环境**

接通后立即实现：
1. **Actual State 回路** — `change_notifications` → 更新 ActualState → Diff② 分叉检测
2. **TAKING / TRANSITION 状态机** — TAKE 六步骤完整实现，含3秒收敛超时
3. **前端状态分叉提示** — 橙色警告 + "重新接管"按钮

不需要 Tricaster 也可以继续的：
- 前端完整节目单树（Segment/Part 层级）
- 设备状态指示灯
- 键盘快捷键（Space=TAKE，Enter=PREVIEW，↑↓=SET NEXT）

---

## 第一件事

读完本文档后，请告诉用户：
"我已了解 RCAS 当前状态。后端状态驱动链路已完整实现并验证，前端 Step2 完成。请告诉我当前想继续哪个方向：前端节目单树、设备状态指示灯、还是等待 Tricaster 联网后接入 Actual State 回路？"