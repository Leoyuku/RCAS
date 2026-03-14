# RCAS - 自动化播出核心系统 | 架构设计与开发纲领 (v2.3)

**文档目的:** 本文档是 RCAS 项目的最高指导原则。它定义了系统的核心哲学、逻辑架构、物理结构以及关键技术决策。任何代码实现都必须服从于本文档定义的原则。

**文档版本：v2.3 | 最后更新：2026-03-10**

---

## 第一章：核心哲学 (System Constitution)

*我们将构建一个"状态驱动"的系统，而非"命令驱动"的脚本。这是系统高可靠性的基石。*

### 1.1 唯一真理源 (Single Source of Truth)
系统的唯一权威是 **Target Timeline State**（目标时间线状态）。
*   **公式：** `TargetState(t) = Resolver(RundownModel, t)`
*   **原则：** 设备状态、UI 显示、数据库字段都只是这个真理的投影。核心引擎永远是唯一的"大脑"。

### 1.2 时间主权 (Time Sovereignty)
系统的一切行为由 **模型** 和 **当前时间** 共同决定。
*   **原则：** 绝不允许依赖"历史命令"或"上一帧状态"。系统必须能回答："在 T 时间点，系统应该是什么样？"
*   **推论：** 系统必须具备"预测未来"的能力（例如：预加载下一段视频）。

### 1.3 可重建性 (Reconstructability)
这是系统的**核心验收标准**。
*   **定义：** 在任何时刻，如果我们删除所有运行时状态（缓存、设备连接状态、临时变量），仅保留 `Rundown` 数据和 `CurrentTime`，重启系统后，它必须能**毫秒级精确恢复**到正确的播出状态。
*   **已验证（2026-03-10）：** 服务崩溃重启后，`runtime-persistence.ts` 自动恢复 `engine=RUNNING` + `PartInstances`，无需导播手动重建。

### 1.4 设备从属原则 (Device Subordination)
设备是单纯的执行者。
*   **原则：** 它们只报告 `ActualState`（真实状态），绝不能修改 `TargetState`。
*   **职责：** 设备驱动负责将"意图"翻译为物理指令，但决不能反向影响业务逻辑。

### 1.5 单向数据流 (Unidirectional Flow)
数据流向必须严格遵守：
```
Editorial (业务) → Temporal (时间) → State (状态) → Diff (差异) → Device (设备)
```
禁止反向依赖。

---

## 第二章：领域模型 (Domain Modeling)

为了保证系统的纯粹性，我们将系统划分为三个严格隔离的领域：

### 2.1 业务域 (Editorial Domain)
*   **关注点：** 节目、新闻、文稿。
*   **核心对象：** `Rundown`, `Segment`, `Part`, `Piece`。
*   **职责：** 描述"意图"（Intent）。例如："这里需要播一段视频"，而不是"VTR 播放命令"。
*   **特点：** 不包含任何设备控制逻辑，不关心时间冲突。

### 2.2 时间域 (Temporal Domain)
*   **关注点：** 时间线、优先级、层级冲突、逻辑运算。
*   **核心对象：** `Timeline`, `TimelineObject`。
*   **职责：** 将业务域的"意图"翻译成数学上的"时间线对象"。解决逻辑冲突（如：两个图文重叠时谁优先）。
*   **核心算法：** `Resolver(Timeline, Time) → DesiredState`。

### 2.3 物理域 (Physical Domain)
*   **关注点：** I/O、TCP连接、设备协议、命令执行。
*   **核心对象：** `Device`, `Mapping`, `Command`。
*   **职责：** 通过 **State Diff** 算法，将 `DesiredState` 与 `lastSentState` 进行比对，计算出最小指令集（Commands）并执行。实现幂等性（Idempotency）。

---

## 第三章：MOS 协议策略

我们必须明确 RCAS 在广播生态中的定位。

*   **定位：** RCAS 是一个**智能的 MOS Device**，而非 NCS。
*   **核心逻辑：** 我们订阅 NCS 的数据更新，将其转化为内部 Rundown，然后自主驱动播出。

### 支持的 Profiles
| Profile | 功能 | 策略 | 原因 |
| :--- | :--- | :--- | :--- |
| **Profile 0** | 基础通信 | **MUST** ✅ | 系统的"心跳"，必须 100% 兼容。 |
| **Profile 2** | 基础 Rundown | **MUST** ✅ | 接收 `roCreate`, `roDelete` 等指令，构建业务数据。9/9 验证通过。 |
| **Profile 4** | 高级 Rundown | **MUST** ✅ | 支持 `roStorySend`，获取更详细的 Story 信息。 |

### 拒绝的 Profiles
*   **Profile 1, 3 (Object Push):** 我们不是媒体资产库，不负责管理文件元数据。
*   **Profile 5, 6, 7 (Control/Edit):** 我们不接受外部的"播放/停止"命令控制（与状态驱动冲突），也不允许外部修改已锁定的 Rundown 结构。

---

## 第四章：物理架构 (Physical Architecture)

### 4.1 目录结构
```
RCAS/
├── packages/
│   ├── backend/          # 【后端核心】自动化核心服务
│   ├── frontend/         # 【前端界面】状态可视化与人工干预
│   └── core-lib/         # 【共享契约】系统通用语言（Models + Socket契约）
├── .env.example
├── .env                  # 不提交 git
└── package.json
```

### 4.2 后端流水线 (`packages/backend`)

后端内部被设计为一条**单向流动**的流水线，编号代表数据流层级：
```
packages/backend/src/
│
├── index.ts                              # 🚀 启动入口（含优雅关闭）
│
├── shared/                               # 🧱 共享基础设施
│   ├── logger.ts                         #    Winston 结构化日志
│   ├── config.ts                         #    环境变量唯一读取点
│   └── startup-check.ts                  #    启动自检（端口/目录/磁盘/配置）
│
└── modules/
    │
    ├── 1_mos_connection/                 # ══ 第1层：协议接入 ══
    │   ├── mos-connection.ts             #    对外接口，注册所有 MOS 回调
    │   ├── connector/                    #    Sofie MOS 移植（勿动）
    │   ├── helper/                       #    XML 解析、MOS 工具函数
    │   └── internals/                    #    MOS 协议模型定义
    │
    ├── 2_ingest/                         # ══ 第2层：数据转换 ══
    │   └── mos-to-rundown.ts             #    纯函数：IMOSRunningOrder → IRundown
    │                                     #    Blueprint 核心（临时规则，待真实字段补全）
    │
    ├── 3_domain_engine/                  # ══ 第3层：核心引擎 ══
    │   ├── store/                        #    业务状态中心
    │   │   ├── rundown-store.ts          #    IRundown 内存状态 + 生命周期管理
    │   │   ├── socket-server.ts          #    Socket.io 服务端 + intent 事件处理
    │   │   ├── json-persistence.ts       #    Rundown JSON 持久化（防抖500ms）
    │   │   └── mos-cache.ts              #    MOS 消息缓存层
    │   └── engine/                       #    播出状态机
    │       ├── rundown-engine.ts         #    状态机 + PartInstance 生命周期 + State Loop（100ms）
    │       ├── timeline-builder.ts       #    纯函数：PartInstances → TimelineObjects
    │       ├── resolver.ts               #    纯函数：resolve(objects, t) + diff(desired, last)
    │       └── runtime-persistence.ts   #    运行时快照持久化（崩溃恢复）
    │
    └── 4_playout_controllers/            # ══ 第4层：设备控制 ══
        └── tricaster/
            ├── tricaster-client.ts       #    双通道 WebSocket（控制+通知），指数退避重连
            └── tricaster-driver.ts       #    监听 commandsReady → sendShortcut
```

### 4.3 状态驱动完整链路（已实现）
```
导播 TAKE / SEND TO PREVIEW
  → SocketServer（intent 事件）
  → RundownEngine（状态机）
  → 创建 / 更新 PartInstance
  → State Loop 心跳（100ms）
  → buildTimeline(partInstances)  → ITimelineObject[]   【纯函数】
  → resolve(objects, now)         → DesiredState        【纯函数】
  → diff(desired, lastSentState)  → DeviceCommand[]     【纯函数】
  → emit commandsReady
  → TricasterDriver._dispatchCommands()
  → tricasterClient.sendShortcut()
  → Tricaster 设备
```

### 4.4 三种状态的严格区分

| 状态名 | 来源 | 职责 |
|--------|------|------|
| **Desired State** | Resolver 纯函数计算 | 系统"希望设备是什么状态"，唯一真理源的投影 |
| **lastSentState** | 系统内部记录 | 低延迟 Diff，不等设备回报即可计算下一批命令 |
| **Actual State** | 设备回报（`change_notifications`） | 检测状态分叉，验证收敛。**待 Tricaster 联网后接入** |

> ⚠️ 三种状态职责严格分离，不能混用。`lastSentState` 决定"发什么命令"，`Actual State` 决定"是否发生了分叉"。用错了会导致播出事故。

### 4.5 core-lib 依赖规则

core-lib 是系统的唯一共享层，依赖关系严格单向：
```
backend  →  core-lib  ←  frontend
backend  ↔  frontend   （禁止直接依赖）
```
```
packages/core-lib/src/
├── models/
│   ├── rundown-model.ts         # IRundown / ISegment / IPart / IPiece
│   └── part-instance-model.ts  # IPartInstance / PlayConfig / isPreview
└── socket/
    └── socket-contracts.ts     # LifecycleStatus / RundownSummary / EngineState / 全部事件契约
```

### 4.6 部署形态

| 形态 | 适用场景 | 模块通信 | 打包方式 |
|------|---------|---------|---------|
| **单体/EXE 模式** | 单机广电工作站 | 内存直接调用（EventEmitter） | `pkg` 打包成单个 `.exe` |
| **微服务模式** | 大型台站，高可用 | gRPC 网络通信 | Docker 容器化 |

两种形态使用同一套业务代码，差异仅在启动入口和通信适配器。

---

## 第五章：关键技术决策

1.  **语言：** TypeScript Strict Mode，全栈统一类型。
2.  **通信：**
    *   模块间：EventEmitter（单体模式），接口已预留 gRPC 扩展。
    *   前后端：Socket.io，连接即得全量快照，断线自动重连。
3.  **纯函数原则：** Timeline Builder / Resolver / Diff Engine 必须是纯函数。同样的输入永远得到同样的输出，不依赖任何外部状态。违反此约束会导致播出行为不可预测、无法编写单元测试。
4.  **持久化：**
    *   Rundown 数据：`data/rundowns/*.json`（防抖500ms写入）
    *   运行时快照：`data/runtime/runtime-snapshot.json`（防抖300ms写入，崩溃恢复用）
5.  **时间驱动：** State Loop 每100ms tick，基于当前时间重新计算 DesiredState。设备控制由时间驱动，而非事件触发后单次执行。

---

## 第六章：当前实现状态（2026-03-10）

| 层级 | 模块 | 状态 | 备注 |
|------|------|------|------|
| 层① | `1_mos_connection` | ✅ 完成 | Profile 0/2/4，9/9 验证通过 |
| 层② | `2_ingest` | ✅ 完成 | 纯函数，Blueprint 临时规则待补全 |
| 层③ | `3_domain_engine/store` | ✅ 完成 | 状态管理 + 持久化 + Socket.io |
| 层③ | `3_domain_engine/engine` | ✅ 完成 | 状态机 + Timeline + Resolver + Diff + 崩溃恢复 |
| 层④ | `4_playout_controllers/tricaster` | ✅ 完成 | 双通道 WS，待局域网联调 |
| 共享 | `core-lib` | ✅ 完成 | Models + Socket 契约 + PartInstance 模型 |
| 前端 | `frontend` | ✅ Step2完成 | 三栏布局 + ON AIR/PREVIEW/NEXT + TAKE/SEND TO PREVIEW |

**端到端验证结论：**
- SEND TO PREVIEW → `main_preview_source = Input1` ✅
- TAKE → `main_background_take` ✅
- 崩溃重启 → 自动恢复 `engine=RUNNING` + PartInstances ✅

**下一个关键里程碑：** 换到有 Tricaster 的局域网环境，接通 `change_notifications` Actual State 回路，实现真正的状态闭环。