# RCAS - 自动化播出核心系统 | 架构设计与开发纲领

**文档版本：v2.3**
**最后更新：2026-03-10**

---

## 版本历史

| 版本 | 说明 |
|------|------|
| v2.0 | 初始架构设计，自研 MOS 协议解析层 |
| v2.1 | 整体移植 Sofie MOS 模块，替代自研协议层；目录结构更新 |
| v2.2 | 架构重构：对齐 Sofie Core 设计思想，目录编号重新梳理，3_store 并入 3_domain_engine/store |
| v2.3 | domain engine 完整实现：状态机 + Timeline Builder + Resolver + Diff Engine + TricasterDriver + 崩溃恢复 |

---

## 第一章：核心哲学 (System Constitution)

*我们将构建一个"状态驱动"的系统，而非"命令驱动"的脚本。这是系统高可靠性的基石。*

### 1.1 唯一真理源 (Single Source of Truth)
系统的唯一权威是 **Target Timeline State**（目标时间线状态）。
- **公式：** `TargetState(t) = Resolver(RundownModel, t)`
- **原则：** 设备状态、UI 显示、数据库字段都只是这个真理的投影。核心引擎永远是唯一的"大脑"。

### 1.2 时间主权 (Time Sovereignty)
系统的一切行为由**模型**和**当前时间**共同决定。
- **原则：** 绝不允许依赖"历史命令"或"上一帧状态"。系统必须能回答："在 T 时间点，系统应该是什么样？"
- **推论：** 系统必须具备"预测未来"的能力（例如：预加载下一段视频）。

### 1.3 可重建性 (Reconstructability)
这是系统的**核心验收标准**。
- **定义：** 在任何时刻，如果我们删除所有运行时状态，仅保留 `Rundown` 数据和 `CurrentTime`，重启系统后，它必须能**毫秒级精确恢复**到正确的播出状态。
- **已验证：** 服务崩溃重启后自动恢复 engine=RUNNING + PartInstances，导播无需手动重建。

### 1.4 设备从属原则 (Device Subordination)
设备是单纯的执行者。
- **原则：** 它们只报告 `ActualState`（真实状态），绝不能修改 `TargetState`。

### 1.5 单向数据流 (Unidirectional Flow)
```
Editorial (业务) → Temporal (时间) → State (状态) → Diff (差异) → Device (设备)
```
禁止反向依赖。

---

## 第二章：领域模型 (Domain Modeling)

系统划分为三个严格隔离的领域：

### 2.1 业务域 (Editorial Domain)
- **核心对象：** `Rundown`, `Segment`, `Part`, `Piece`
- **职责：** 描述"意图"——"这里需要播一段视频"，而非"VTR 播放命令"

### 2.2 时间域 (Temporal Domain)
- **核心对象：** `Timeline`, `TimelineObject`
- **核心算法：** `Resolver(Timeline, Time) → DesiredState`

### 2.3 物理域 (Physical Domain)
- **核心对象：** `Device`, `Mapping`, `Command`
- **职责：** State Diff → 最小指令集 → 物理设备执行

---

## 第三章：定位与 MOS 协议策略

**RCAS 的角色：一个极其智能的 MOS Device，而非 NCS。**

我们订阅 NCS 的数据更新，将其转化为内部 Rundown，然后自主驱动播出。

### 支持的 Profiles

| Profile | 功能 | 策略 |
|---------|------|------|
| Profile 0 | 基础通信 | ✅ MUST — 系统心跳，100% 兼容 |
| Profile 2 | 基础 Rundown 工作流 | ✅ MUST — 接收 roCreate/roDelete 等，核心饭碗 |
| Profile 4 | 高级 Rundown 工作流 | ✅ MUST — roStorySend 获取完整 Story 信息 |
| Profile 1 | 基础对象工作流 | ❌ WON'T — 我们不是媒体资产服务器 |
| Profile 3 | 高级对象工作流 | ❌ WON'T — 不接受 NCS 创建/替换媒体对象 |
| Profile 5 | 媒体项控制 | ❌ WON'T — 与声明式架构哲学根本冲突 |
| Profile 6 | MOS 重定向 | ❌ WON'T — 初期不涉及多服务器媒体传输 |
| Profile 7 | MOS 对 RO 的修改 | ❌ WON'T — 保证数据流单向，我们只执行不反写 |

**对外声明：** `RCAS is MOS Compatible - Profiles 0, 2, 4`

---

## 第四章：Sofie 架构思想与三大支柱

通过对 Sofie Automation 的深度研究，RCAS 确立了以下核心设计思想：

### 4.1 从"命令式"到"声明式"

| Sofie 概念 | RCAS 实现方式 |
|-----------|-------------|
| **Blueprint** | `2_ingest` 层负责将 MOS 数据翻译为 `IRundown`，逻辑可编程、可热插拔 |
| **Timeline** | `3_domain_engine/engine` 在每次状态变化后重新生成 Timeline，描述期望状态 |
| **TSR** | `4_playout_controllers` 持续对比 Timeline 与设备真实状态，自动计算最小指令集 |

### 4.2 三大支柱

1. **声明式状态驱动：** 不"指挥"设备，只"描绘蓝图"，由 Resolver+Diff Engine 实现蓝图
2. **可编程业务逻辑：** 核心数据转换逻辑由可热插拔的 Blueprints 定义
3. **单向数据流水线：** 每一层职责清晰，禁止反向依赖

---

## 第五章：最终架构（v2.3 当前状态）

### 5.1 宏观物理结构
```
RCAS/
├── packages/
│   ├── backend/      # 【后端核心】自动化核心服务
│   ├── frontend/     # 【前端界面】状态可视化与人工干预
│   └── core-lib/     # 【共享契约】系统通用语言（Models + Socket契约）
├── .env.example
├── .env              # 不提交 git
└── package.json
```

### 5.1.1 core-lib 依赖规则

core-lib 是系统的唯一共享层，依赖关系严格单向：

- `backend` → `core-lib`（允许）
- `frontend` → `core-lib`（允许）
- `backend` ↔ `frontend`（**禁止直接依赖**）
```
packages/core-lib/src/
├── models/
│   ├── rundown-model.ts        # IRundown / ISegment / IPart / IPiece
│   └── part-instance-model.ts  # IPartInstance / PlayConfig
└── socket/
    └── socket-contracts.ts     # LifecycleStatus / RundownSummary / EngineState / 事件契约
```

### 5.2 后端内部架构

**编号规则：编号代表数据流层级，不是开发顺序。**
```
packages/backend/src/
│
├── index.ts                              # 🚀 启动入口
│
├── shared/                               # 🧱 共享基础设施
│   ├── logger.ts                         #    Winston 结构化日志        ✅
│   ├── config.ts                         #    环境变量唯一读取点         ✅
│   └── startup-check.ts                  #    启动自检（端口/目录/磁盘） ✅
│
└── modules/                              # 📦 单向数据流水线
    │
    ├── 1_mos_connection/                 # ══ 第1层：协议接入 ══         ✅ 完成
    │   ├── mos-connection.ts             #    对外接口，注册所有回调
    │   ├── connector/                    #    Sofie MOS 移植（勿动）
    │   ├── helper/                       #    XML 解析、MOS 工具函数
    │   └── internals/                    #    MOS 协议模型定义
    │
    ├── 2_ingest/                         # ══ 第2层：数据转换 ══         ✅ 完成
    │   └── mos-to-rundown.ts             #    纯函数：IMOSRunningOrder → IRundown
    │                                     #    Blueprint 临时规则（TODO: 真实字段映射）
    │
    ├── 3_domain_engine/                  # ══ 第3层：核心引擎 ══         ✅ 完成
    │   ├── store/                        #    业务状态中心
    │   │   ├── rundown-store.ts          #    IRundown 内存状态 + 生命周期管理
    │   │   ├── socket-server.ts          #    Socket.io 服务端 + intent 事件处理
    │   │   ├── json-persistence.ts       #    Rundown JSON 持久化（防抖500ms）
    │   │   └── mos-cache.ts              #    MOS 消息缓存
    │   └── engine/                       #    播出状态机
    │       ├── rundown-engine.ts         #    状态机 + PartInstance 生命周期 + State Loop
    │       ├── timeline-builder.ts       #    纯函数：PartInstances → TimelineObjects
    │       ├── resolver.ts               #    纯函数：resolve + diff
    │       └── runtime-persistence.ts    #    运行时快照持久化（崩溃恢复）
    │
    └── 4_playout_controllers/            # ══ 第4层：设备控制 ══         ✅ Tricaster完成
        └── tricaster/
            ├── tricaster-client.ts       #    双通道WebSocket（控制+通知），指数退避重连
            └── tricaster-driver.ts       #    监听commandsReady → sendShortcut
```

### 5.3 状态驱动完整链路
```
导播 TAKE / SEND TO PREVIEW
  → SocketServer（intent 事件）
  → RundownEngine（状态机）
  → 创建 / 更新 PartInstance
  → State Loop 心跳（100ms）
  → buildTimeline(partInstances) → ITimelineObject[]
  → resolve(objects, now)        → DesiredState
  → diff(desired, lastSentState) → DeviceCommand[]
  → emit commandsReady
  → TricasterDriver._dispatchCommands()
  → tricasterClient.sendShortcut()
  → Tricaster 设备
```

### 5.4 三种状态的区别（不能混淆）

| 状态名 | 来源 | 用途 |
|--------|------|------|
| **Desired State** | Resolver 计算输出 | 系统"希望设备是什么状态"，纯函数结果 |
| **lastSentState** | 系统自己记录 | 决定"这次要发哪些命令"，低延迟 Diff |
| **Actual State** | 设备回报（change_notifications） | 检测状态分叉，待 Tricaster 联网后接入 |

---

## 第六章：技术选型

| 关注点 | 选型 | 说明 |
|--------|------|------|
| 运行时 | Node.js 22 LTS | 稳定、长期支持 |
| 语言 | TypeScript Strict | 全栈统一类型 |
| 实时推送 | Socket.io | 连接即得全量快照，断线重连 |
| 前端状态 | Zustand v5 | 轻量，从 `zustand/react` 导入 |
| 前端框架 | React + Vite + Tailwind | 快速迭代 |
| 模块间通信 | EventEmitter | 单体模式下内存直接调用 |
| 部署形态 | 当前 Monolith，预留 Microservice | 同一套代码，适配器切换 |

---

## 第七章：当前开发进度

| 模块 | 状态 | 说明 |
|------|------|------|
| `shared/logger` | ✅ 完成 | Winston，文件滚动，结构化日志 |
| `shared/config` | ✅ 完成 | 环境变量统一管理 |
| `shared/startup-check` | ✅ 完成 | 端口/目录/磁盘/配置自检 |
| `1_mos_connection` | ✅ 完成 | Profile 0/2/4 全部回调，异常捕获，优雅关闭 |
| `2_ingest` | ✅ 完成 | `mosRunningOrderToRundown` 纯函数，Blueprint 临时规则待补全 |
| `3_domain_engine/store` | ✅ 完成 | 内存状态管理、JSON 持久化、Socket.io 推送 |
| `3_domain_engine/engine` | ✅ 完成 | 状态机 + PartInstance + State Loop（100ms）+ 崩溃恢复 |
| `4_playout_controllers` | ✅ 完成（Tricaster） | 双通道 WebSocket，指数退避重连，待局域网联调 |
| `core-lib` | ✅ 完成 | Models + Socket 契约 + PartInstance 模型 |
| HTTP REST API | ✅ 完成 | `/health`、`/rundowns`、`/rundowns/:id` |
| 前端 | ✅ Step2 完成 | 三栏布局 + ON AIR/PREVIEW/NEXT + TAKE/SEND TO PREVIEW 操作 |

**Profile 2 验证结论：9/9 全部通过。**

**端到端链路验证：**
- SEND TO PREVIEW → `main_preview_source = Input1` ✅
- TAKE → `main_background_take` ✅
- 崩溃重启 → 自动恢复 engine=RUNNING + PartInstances ✅

---

## 第八章：已知问题与待完成事项

### 待完成（优先级排序）

| 项目 | 说明 |
|------|------|
| **Actual State 回路** | 接入 `change_notifications`，实现状态分叉检测。需要 Tricaster 在线 |
| **Blueprint 完善** | 等真实 Octopus 字段数据后补全 Part 类型识别规则和 Layer 映射 |
| **前端节目单树** | 显示完整 Segment/Part 层级，Part 类型颜色区分 |
| **设备状态指示灯** | Tricaster / VIZ / LAWO 连接状态实时显示 |
| **TAKING/TRANSITION 状态** | TAKE 六步骤完整实现，含收敛超时报警 |
| **AdLib 面板** | 导播即兴操作支持 |
| **VIZ Engine / LAWO Driver** | 第二、三设备驱动 |

### 已知 Bug（已修复）

**⚠️ quick-mos `refreshFiles()` 传参 Bug（已修复）**

`Object.entries()` 解构时两个变量名对调，导致 roDelete 传入时间戳而非 RO ID。已修复。

---

## 第九章：部署形态

| 形态 | 适用场景 | 模块通信 | 打包方式 |
|------|---------|---------|---------|
| 单体/EXE 模式 | 单机广电工作站 | 内存直接调用 | `pkg` 打包成单个 `.exe` |
| 微服务模式 | 大型台站，高可用 | gRPC 网络通信 | Docker 容器化 |

两种形态使用同一套业务代码，差异仅在启动入口和通信适配器。

---

## 第十章：下一步里程碑

**最关键：换到有 Tricaster 的局域网环境，接通 Actual State 回路（`change_notifications`），让系统真正闭环。**

这是从"单向状态驱动"到"完整闭环状态驱动"的分水岭。