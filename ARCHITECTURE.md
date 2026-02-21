# RCAS - 自动化播出核心系统 | 架构设计与开发纲领 (v2.0)

**文档目的:** 本文档是 RCAS 项目的最高指导原则。它定义了系统的核心哲学、逻辑架构、物理结构以及关键技术决策。任何代码实现都必须服从于本文档定义的原则。

---

## 第一章：核心哲学 (System Constitution)

*我们将构建一个“状态驱动”的系统，而非“命令驱动”的脚本。这是系统高可靠性的基石。*

### 1.1 唯一真理源 (Single Source of Truth)
系统的唯一权威是 **Target Timeline State**（目标时间线状态）。
*   **公式：** `TargetState(t) = Resolver(RundownModel, t)`
*   **原则：** 设备状态、UI 显示、数据库字段都只是这个真理的投影。核心引擎永远是唯一的“大脑”。

### 1.2 时间主权 (Time Sovereignty)
系统的一切行为由 **模型** 和 **当前时间** 共同决定。
*   **原则：** 绝不允许依赖“历史命令”或“上一帧状态”。系统必须能回答：“在 T 时间点，系统应该是什么样？”
*   **推论：** 系统必须具备“预测未来”的能力（例如：预加载下一段视频）。

### 1.3 可重建性 (Reconstructability)
这是系统的**核心验收标准**。
*   **定义：** 在任何时刻，如果我们删除所有运行时状态（缓存、设备连接状态、临时变量），仅保留 `Rundown` 数据和 `CurrentTime`，重启系统后，它必须能**毫秒级精确恢复**到正确的播出状态。

### 1.4 设备从属原则 (Device Subordination)
设备是单纯的执行者。
*   **原则：** 它们只报告 `ActualState`（真实状态），绝不能修改 `TargetState`。
*   **职责：** 设备驱动负责将“意图”翻译为物理指令，但决不能反向影响业务逻辑。

### 1.5 单向数据流 (Unidirectional Flow)
数据流向必须严格遵守：
`Editorial (业务)` -> `Temporal (时间)` -> `State (状态)` -> `Diff (差异)` -> `Device (设备)`
禁止反向依赖。

---

## 第二章：领域模型 (Domain Modeling)

为了保证系统的纯粹性，我们将系统划分为三个严格隔离的领域：

### 2.1 业务域 (Editorial Domain)
*   **关注点：** 节目、新闻、文稿。
*   **核心对象：** `Rundown`, `Segment`, `Part`, `Piece`。
*   **职责：** 描述“意图”（Intent）。例如：“这里需要播一段视频”，而不是“VTR 播放命令”。
*   **特点：** 不包含任何设备控制逻辑，不关心时间冲突。

### 2.2 时间域 (Temporal Domain)
*   **关注点：** 时间线、优先级、层级冲突、逻辑运算。
*   **核心对象：** `Timeline`, `TimelineObject`。
*   **职责：** 将业务域的“意图”翻译成数学上的“时间线对象”。解决逻辑冲突（如：两个图文重叠时谁优先）。
*   **核心算法：** `Resolver(Timeline, Time) -> ActiveState`。

### 2.3 物理域 (Physical Domain)
*   **关注点：** I/O、TCP连接、设备协议、命令执行。
*   **核心对象：** `Device`, `Mapping`, `Command`。
*   **职责：** 通过 **State Diff** 算法，将 `Target Timeline` 与 `Actual Device State` 进行比对，计算出最小指令集（Commands）并执行。实现幂等性（Idempotency）。

---

## 第三章：MOS 协议策略

我们必须明确 RCAS 在广播生态中的定位。

*   **定位：** RCAS 是一个**智能的 MOS Device**，而非 NCS。
*   **核心逻辑：** 我们订阅 NCS 的数据更新，将其转化为内部 Rundown，然后自主驱动播出。

### 支持的 Profiles
| Profile | 功能 | 策略 | 原因 |
| :--- | :--- | :--- | :--- |
| **Profile 0** | 基础通信 | **MUST** | 系统的“心跳”，必须 100% 兼容。 |
| **Profile 2** | 基础 Rundown | **MUST** | 接收 `roCreate`, `roDelete` 等指令，构建业务数据。 |
| **Profile 4** | 高级 Rundown | **MUST** | 支持 `roStorySend`，获取更详细的 Story 信息。 |

### 拒绝的 Profiles
*   **Profile 1, 3 (Object Push):** 我们不是媒体资产库，不负责管理文件元数据。
*   **Profile 5, 6, 7 (Control/Edit):** 我们不接受外部的“播放/停止”命令控制（与状态驱动冲突），也不允许外部修改已锁定的 Rundown 结构。

---

## 第四章：物理架构 (Physical Architecture)

我们将采用 Monorepo 结构，并在后端采用“模块化单体”架构，兼顾开发效率与未来扩展。

### 4.1 目录结构
```text
RCAS/
├── packages/
│   ├── backend/          # 【后端核心】 - 包含 Ingest, Core, Playout 逻辑
│   ├── frontend/         # 【前端界面】 - 状态的可视化与人工干预
│   └── core-lib/         # 【类型定义】 - 系统的通用语言 (Models)
```

### 4.2 后端流水线 (`packages/backend`)

后端内部被设计为一条单向流动的流水线：

1.  **Ingest Layer (`modules/1_mos_connection` ... `3_validators`)**
    *   负责与外部世界（MOS）沟通。
    *   将脏数据清洗为纯净的 `Rundown` 对象。
    *   **输出：** `Rundown` 事件流。

2.  **Core Engine (`modules/4_domain_engine`)**
    *   **Store:** 维护当前的 `Rundown` 状态。
    *   **Blueprint:** 运行业务逻辑脚本，将 `Rundown` 映射为 `Timeline`。
    *   **Resolver:** 结合当前时间，计算 `TargetState`。
    *   **输出：** `Timeline` 对象流。

3.  **Playout Gateway (`modules/5_playout_controllers`)**
    *   **Diff Engine:** 对比 `TargetState` 和 `DeviceState`。
    *   **Drivers:** 执行具体的物理指令（TCP/UDP/Serial）。
    *   **输出：** 物理设备控制信号。

### 4.3 部署形态
*   **Monolith Mode:** 开发及小型部署时，所有模块运行在同一个 Node.js 进程中，通过内存 EventBus 通信。
*   **Microservice Mode:** 大型部署时，Ingest, Core, Playout 可拆分为独立进程，通过 gRPC 进行通信，实现高可用和负载均衡。

---

## 第五章：关键技术决策

1.  **语言:** TypeScript (Strict Mode)。
2.  **通信:**
    *   模块间：定义明确的 TypeScript Interface。
    *   服务间：gRPC / Protobuf。
3.  **状态管理:**
    *   业务状态：RxJS (推荐) 或 Redux-like Store。
    *   持久化：MongoDB (暂定，因其对 JSON 文档的友好性) 或 PostgreSQL (JSONB)。
4.  **时间同步:** 系统必须依赖统一的高精度时钟源。

---

*本文档由架构委员会批准，修改需经过严格的 RFC 流程。*
