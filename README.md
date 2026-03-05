# RCAS - 自动化播出核心系统 | 架构设计与开发纲领

**文档版本：v2.2**
**最后更新：2026-03-05**

---

## 版本历史

| 版本 | 说明 |
|------|------|
| v2.0 | 初始架构设计，自研 MOS 协议解析层 |
| v2.1 | 整体移植 Sofie MOS 模块，替代自研协议层；目录结构更新 |
| v2.2 | 架构重构：对齐 Sofie Core 设计思想，目录编号重新梳理，3_store 并入 3_domain_engine/store |

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
- **核心算法：** `Resolver(Timeline, Time) → ActiveState`

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
| **Timeline** | `3_domain_engine` 在每次状态变化后重新生成 Timeline JSON，描述未来期望状态 |
| **TSR** | `4_playout_controllers` 持续对比 Timeline 与设备真实状态，自动计算最小指令集 |

### 4.2 三大支柱

1. **声明式状态驱动：** 不"指挥"设备，只"描绘蓝图"，由 TSR 实现蓝图
2. **可编程业务逻辑：** 核心数据转换逻辑由可热插拔的 Blueprints 定义
3. **单向数据流水线：** 每一层职责清晰，禁止反向依赖

---

## 第五章：最终架构（v2.2 当前状态）

### 5.1 宏观物理结构
```
RCAS/
├── packages/
│   ├── backend/      # 【后端核心】自动化核心服务
│   ├── frontend/     # 【前端界面】状态可视化与人工干预（尚未开始）
│   └── core-lib/     # 【类型定义】系统通用语言（Models）
├── .env.example
├── .env              # 不提交 git
└── package.json
```

### 5.2 后端内部架构

**编号规则：编号代表数据流层级，不是开发顺序。编号连续无空缺。**
```
packages/backend/src/
│
├── index.ts                              # 🚀 启动入口
│
├── shared/                               # 🧱 共享基础设施
│   ├── logger.ts                         #    Winston 结构化日志        ✅
│   ├── config.ts                         #    环境变量唯一读取点          ✅
│   └── startup-check.ts                  #    启动自检（端口/目录/磁盘）  ✅
│
└── modules/                              # 📦 单向数据流水线
    │
    ├── 1_mos_connection/                 # ══ 第1层：协议接入 ══         ✅ 完成
    │   ├── mos-connection.ts             #    对外接口，注册所有回调
    │   ├── connector/                    #    Sofie MOS 移植（勿动）
    │   ├── helper/                       #    XML 解析、MOS 工具函数
    │   └── internals/                    #    MOS 协议模型定义
    │
    ├── 2_ingest/                         # ══ 第2层：数据转换 ══         🔲 待实现
    │   └── mos-to-rundown.ts             #    纯函数：IMOSRunningOrder → IRundown
    │                                     #    无状态，无副作用，Blueprint 核心
    │
    ├── 3_domain_engine/                  # ══ 第3层：核心引擎 ══         🔲 部分框架
    │   ├── store/                        #    业务状态中心               ✅ 完成
    │   │   ├── rundown-store.ts          #    内存 Map + EventEmitter
    │   │   ├── json-persistence.ts       #    JSON 文件持久化（防抖写入）
    │   │   └── socket-server.ts          #    Socket.io 实时推送
    │   ├── blueprints/                   #    可热插拔业务规则            🔲 待实现
    │   └── engine/                       #    播出状态机（Take/Next/Stop）🔲 待实现
    │
    └── 4_playout_controllers/            # ══ 第4层：播出控制 ══         🔲 待实现
        ├── tsr-engine.ts                 #    Timeline State Resolver
        └── drivers/                      #    设备驱动（CasparCG/ATEM 等）
```

### 5.3 当前数据流
```
NCS (iNEWS / ENPS / quick-mos)
    │  MOS Protocol (TCP 10540/10541/10542)
    ▼
┌──────────────────────────────────┐
│  1_mos_connection                │  接收全部 Profile 0/2/4 消息
│  mos-connection.ts               │  所有回调有异常捕获，ACK 必达
└────────────┬─────────────────────┘
             │ IMOSRunningOrder
             ▼
┌──────────────────────────────────┐
│  3_domain_engine/store/          │  内存 Map 维护全量 RO 状态
│  rundown-store.ts                │  严格遵循 MOS 3.6.12 语义
│                                  │  → 触发 EventEmitter 事件
└──────┬───────────────────┬───────┘
       │ 防抖写入            │ 实时事件
       ▼                   ▼
┌──────────────┐   ┌────────────────────┐
│ JSON 文件     │   │  socket-server.ts   │ → 前端实时更新
│ data/rundowns│   │  连接时推送全量快照  │ → 断线自动重连
└──────────────┘   └────────────────────┘
```

### 5.4 目标数据流（2_ingest 实现后）
```
1_mos_connection
    │ IMOSRunningOrder
    ▼
3_domain_engine/store/rundown-store  ← MOS 协议缓冲
    │ emit: roCreated / roReplaced / roDeleted
    ▼
2_ingest/mos-to-rundown（纯函数转换）
    │ IRundown
    ▼
3_domain_engine/store/ingest-store   ← 业务真相来源
    │
    ├── Socket.io → 前端
    ├── JSON 持久化
    └── → 3_domain_engine/engine（后续）
```

---

## 第六章：关键技术决策（v2.2）

| 决策项 | 当前方案 | 备注 |
|--------|---------|------|
| MOS 协议层 | 整体移植 Sofie MOS 模块 | 生产验证成熟，勿动 |
| 数据校验 | Sofie 内置严格模式 | 已覆盖全部 MOS 类型 |
| 状态持久化 | JSON 文件 | 单机无需数据库，人工可读 |
| 日志 | Winston 结构化日志 | 文件滚动 + 控制台 |
| 实时推送 | Socket.io | 连接即得全量快照，断线重连 |
| 语言 | TypeScript Strict | 不变 |
| 模块间通信 | EventEmitter → EventBus（微服务时）| 接口已预留 |
| 部署形态 | 当前 Monolith，预留 Microservice | 同一套代码，适配器切换 |

---

## 第七章：当前开发进度

| 模块 | 状态 | 说明 |
|------|------|------|
| `1_mos_connection` | ✅ 完成 | Profile 0/2/4 全部回调，异常捕获，优雅关闭 |
| `3_domain_engine/store` | ✅ 完成 | 内存状态管理、JSON 持久化、Socket.io 推送 |
| `shared/logger` | ✅ 完成 | Winston，文件滚动，结构化日志 |
| `shared/config` | ✅ 完成 | 环境变量统一管理 |
| `shared/startup-check` | ✅ 完成 | 端口/目录/磁盘/配置自检 |
| HTTP REST API | ✅ 完成 | `/health`、`/rundowns`、`/rundowns/:roID` |
| `2_ingest` | 🔲 待实现 | `IMOSRunningOrder → IRundown` Blueprint 转换 |
| `3_domain_engine/engine` | 🔲 待实现 | 播出状态机、Timeline Resolver |
| `4_playout_controllers` | 🔲 待实现 | TSR 引擎、设备驱动 |

**Profile 2 验证结论：9/9 全部通过（含架构重构后回归验证）。**

---

## 第八章：已知 Bug 与注意事项

### ⚠️ quick-mos `refreshFiles()` 传参 Bug（已修复）

**位置：** `packages/quick-mos/src/index.ts` — `refreshFiles()` 函数

**现象：** 在验证 Profile 2 的 `roDelete` 操作时，后端收到的 RO ID 是时间戳字符串，
而非真正的 Running Order ID，导致删除操作找不到对应的 RO。

**根因：** `Object.entries()` 解构时两个变量名对调，`[timestamp, roID]` 写成了 `[roID, timestamp]`。

**修复前：**
```typescript
for (const [roID, timestamp] of Object.entries(this.files)) {
    // 此时 roID 实际上是 timestamp，timestamp 实际上是 roID
    this.onDeletedRunningOrder(roID)  // ← 传入的是时间戳！
}
```

**修复后：**
```typescript
for (const [timestamp, roID] of Object.entries(this.files)) {
    this.onDeletedRunningOrder(roID)  // ← 正确传入 RO ID
}
```

**教训：** `Object.entries()` 返回 `[key, value]`，quick-mos 的 `files` 对象结构是
`{ [timestamp]: roID }`，key 是时间戳，value 是 RO ID，解构顺序务必注意。

---

## 第九章：部署形态

| 形态 | 适用场景 | 模块通信 | 打包方式 |
|------|---------|---------|---------|
| 单体/EXE 模式 | 单机广电工作站 | 内存直接调用 | `pkg` 打包成单个 `.exe` |
| 微服务模式 | 大型台站，高可用 | gRPC 网络通信 | Docker 容器化 |

两种形态使用同一套业务代码，差异仅在启动入口和通信适配器。