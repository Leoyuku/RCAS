# RCAS 项目交接备忘录
**最后更新：2026-03-05**
**用途：新对话开始时，读此文件即可立刻恢复上下文，无需翻阅历史 transcript。**

---

## 一、项目是什么

**RCAS（自动化播出核心系统）**：一个广播级的自动化播出控制系统。
- 从 NCS（新闻编辑系统）通过 **MOS 协议**接收节目单（Rundown）
- 经过内部处理后，自动驱动播出设备（切换台、字幕机、VTR 等）
- 核心哲学：**声明式、状态驱动**（描绘"蓝图"，由 TSR 引擎自动执行）

**代码仓库位置：** `~/rcas/`
**Monorepo 结构：**
```
RCAS/
├── packages/
│   ├── backend/      ← 当前主要工作区
│   ├── frontend/     ← 尚未开始
│   └── core-lib/     ← 类型定义库（IRundown、ISegment 等已定义）
```

---

## 二、后端当前目录结构

```
packages/backend/src/
├── index.ts                          ← 启动入口
├── shared/
│   ├── logger.ts                     ✅ 完成
│   ├── config.ts                     ✅ 完成
│   └── startup-check.ts              ✅ 完成（端口/目录/磁盘检查）
├── modules/
│   ├── 1_mos_connection/             ✅ 完成（整体移植自 Sofie）
│   │   ├── mos-connection.ts         ← MosConnector 类，注册所有回调
│   │   └── connector/                ← Sofie MOS 协议实现（勿动）
│   ├── 2_ingest/                     ⬅️ 【下一步工作目标】（目录存在，内容为空）
│   ├── 3_store/                      （注意：实际文件在 store/ 下，见备注）
│   └── 4_domain_engine/              ❌ 尚未开始
│   └── 5_playout_controllers/        ❌ 尚未开始
└── store/                            ✅ 完成（实际存放位置，非 3_store/）
    ├── rundown-store.ts              ← 核心状态管理，存储 IMOSRunningOrder
    ├── json-persistence.ts           ← 持久化到 data/rundowns/*.json
    ├── socket-server.ts              ← Socket.io 实时推送
    └── logger.ts                     ← Winston 日志
```

**⚠️ 目录备注：** `3_store/` 目录存在但为空，实际 store 代码在 `store/` 下。这是历史遗留，不是紧急任务。

---

## 三、已完成的工作（按时间顺序）

| 轮次 | 内容 | 状态 |
|------|------|------|
| 第一轮 | MOS 连接层（`1_mos_connection`），Profile 0/2/4 全部回调 | ✅ |
| 第二轮 | 数据持久化（RundownStore + JSON）、Socket.io 实时推送、Winston 日志、优雅关闭 | ✅ |
| 第三轮 | 目录架构对齐、启动自检（startup-check）、NCS 白名单配置 | ✅ |
| 验证轮 | Profile 2 全部 9 个操作端到端验证（quick-mos → 后端 → 持久化）| ✅ |

**Profile 2 验证结论：9/9 全部通过。**
顺带修复了 quick-mos 的一个 bug：`refreshFiles()` 里 `Object.entries` 解构变量名对调，导致 `onDeletedRunningOrder` 传入的是 timestamp 而非 RO ID。
修复位置：`packages/quick-mos/src/index.ts` 的 `refreshFiles()` 函数。

---

## 四、当前数据流

```
NCS (quick-mos)
    │
    │  MOS 协议（TCP 10540/10541/10542）
    ▼
1_mos_connection（MosConnector）
    │  IMOSRunningOrder 对象
    ▼
RundownStore（内存 Map）
    │  同步写入
    ├──▶ json-persistence → data/rundowns/*.json（持久化）
    └──▶ socket-server → Socket.io → 前端（实时推送）
```

**RundownStore 存储的是原始 `IMOSRunningOrder`（MOS 协议对象），尚未转换为内部 `IRundown`。**

---

## 五、下一步：第四轮 —— `2_ingest` 数据转换层

### 目标
将 `IMOSRunningOrder`（MOS 协议原始对象）转换为 RCAS 内部的 `IRundown`（业务域对象）。

### 为什么需要这一层
- `IMOSRunningOrder` 是 MOS 协议的产物，含有大量协议细节（`IMOSString128` 类型、MOS XML 语义等）
- `IRundown` 是 RCAS 的业务语言（`Segment` / `Part` / `Piece` 结构），与具体协议无关
- 这一转换层（Blueprint）是系统可扩展性的关键：未来换协议只需换 ingest 层

### core-lib 中已定义的目标类型
```
packages/core-lib/src/models/
├── rundown-model.ts   → IRundown（含 segments、status、currentPartId 等）
├── segment-model.ts   → ISegment
├── part-model.ts      → IPart
├── piece-model.ts     → IPiece
└── enums.ts           → PlaylistStatus 等枚举
```

### 转换映射关系（初步设想）
```
IMOSRunningOrder          →  IRundown
  .ID (IMOSString128)     →    .externalId (string)
  .Slug                   →    .name
  .EditorialStart         →    .expectedStart
  .EditorialDuration      →    .expectedDuration
  .Stories[]              →    .segments[]（每个 Story → Segment）
    Story.Items[]         →      Segment 下的 Parts/Pieces（待设计）
```

### 开始前需要讨论的问题
1. **MOS Story → Segment 还是 Part？** 广播行业惯例是 Story = Segment，Story 里的 Item = Part/Piece，但需根据实际业务确认。
2. **`2_ingest` 的触发方式**：监听 `RundownStore` 的事件（`roCreated`/`roReplaced` 等），还是直接在 `MosConnector` 回调里转换？
3. **转换后的 `IRundown` 存在哪里**：新建 `IngestStore`，还是扩展现有 `RundownStore`？

---

## 六、关键架构决策（已定论，勿推翻）

1. **MOS 角色**：RCAS 是 **MOS Device**，quick-mos / 真实 NCS 是 MOS Client（NCS）
2. **连接模式**：后端监听 10540/10541/10542，NCS 主动连入（openRelay 模式）
3. **持久化格式**：`data/rundowns/_index.json`（索引）+ `data/rundowns/{roID}.json`（完整数据）
4. **Profile 支持**：Profile 0 + 2 + 4，拒绝 1/3/5/6/7
5. **部署形态**：当前 Monolith（单进程），预留 Microservice 扩展点

---

## 七、开发环境

```bash
# 启动后端
cd ~/rcas/packages/backend
npm run dev

# 启动 quick-mos（测试用 NCS）
cd ~/rcas/.gcloudignore/reference/sofie-mos-connection/packages/quick-mos
npm run start

# Rundown 测试文件位置
~/rcas/.gcloudignore/reference/sofie-mos-connection/packages/quick-mos/input/runningorders/

# 持久化数据位置
~/rcas/packages/backend/data/rundowns/

# 验证脚本
~/rcas/verify-profile2.mjs
```

---

## 八、快速上手（新对话首要步骤）

1. 读本文件（已完成）
2. 如需了解某轮细节，读 `/mnt/transcripts/journal.txt` 找对应 transcript
3. 如需了解架构全貌，读项目知识库中的 `ARCHITECTURE.md` 和 `README.md`
4. 如需了解当前代码，重点看：
   - `packages/backend/src/modules/1_mos_connection/mos-connection.ts`（回调注册）
   - `packages/backend/src/store/rundown-store.ts`（状态管理）
   - `packages/core-lib/src/models/`（目标数据类型）
