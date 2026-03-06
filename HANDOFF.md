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
├── index.ts                                    ← 启动入口
├── shared/
│   ├── logger.ts                               ✅ 完成
│   ├── config.ts                               ✅ 完成
│   └── startup-check.ts                        ✅ 完成
├── modules/
│   ├── 1_mos_connection/                       ✅ 完成（整体移植自 Sofie）
│   │   ├── mos-connection.ts                   ← MosConnector 类，注册所有回调
│   │   └── connector/                          ← Sofie MOS 协议实现（勿动）
│   │
│   ├── 2_ingest/                               ✅ 完成（mosRunningOrderToRundown 纯函数）
│   │
│   │
│   ├── 3_domain_engine/                        🔲 部分框架已存在
│   │   ├── store/                              ✅ 完成（原 3_store 迁移至此）
│   │   │   ├── rundown-store.ts                ← MOS 状态管理（IMOSRunningOrder）
│   │   │   ├── json-persistence.ts             ← 持久化
│   │   │   └── socket-server.ts                ← Socket.io 实时推送
│   │   ├── blueprints/                         🔲 待实现
│   │   ├── engine/                             🔲 待实现
│   │   └── models/                             🔲 待实现
│   │
│   └── 4_playout_controllers/                  ❌ 尚未开始
```

**编号说明：** 编号代表数据流层级，不是开发顺序。
`1`=协议接入，`2`=数据转换，`3`=核心引擎，`4`=播出控制。
编号连续，无空缺。

---

## 三、已完成的工作（按时间顺序）

| 轮次 | 内容 | 状态 |
|------|------|------|
| 第一轮 | MOS 连接层（`1_mos_connection`），Profile 0/2/4 全部回调 | ✅ |
| 第二轮 | 数据持久化（RundownStore + JSON）、Socket.io 实时推送、Winston 日志、优雅关闭 | ✅ |
| 第三轮 | 目录架构对齐、启动自检（startup-check）、NCS 白名单配置 | ✅ |
| 验证轮 | Profile 2 全部 9 个操作端到端验证（quick-mos → 后端 → 持久化）| ✅ |
| 第四轮 | 架构重构：目录重命名对齐 Sofie 设计思想，3_store 并入 3_domain_engine/store | ✅ |

**Profile 2 验证结论：9/9 全部通过（重构后验证无回归）。**

**quick-mos bug 记录：** `refreshFiles()` 里 `Object.entries` 解构变量名对调，
导致 `onDeletedRunningOrder` 传入的是 timestamp 而非 RO ID。
修复位置：`packages/quick-mos/src/index.ts` 的 `refreshFiles()` 函数。

---

## 四、当前数据流
```
NCS (quick-mos)
    │  MOS 协议（TCP 10540/10541/10542）
    ▼
1_mos_connection（MosConnector）
    │  IMOSRunningOrder 对象
    ▼
3_domain_engine/store/RundownStore（内存 Map）
    │
    ├──▶ json-persistence → data/rundowns/*.json（持久化）
    └──▶ socket-server → Socket.io → 前端（实时推送）
```

**注意：RundownStore 目前存储的是原始 `IMOSRunningOrder`（MOS 协议对象）。
`2_ingest` 实现后，将转换为内部 `IRundown`，RundownStore 最终只存业务对象。**

---

## 五、Rundown 状态模型（已定论）

### 四种状态

| 状态 | 标记 | 说明 |
|------|------|------|
| 已保存 persisted | 💾 | 存在于磁盘，未加载进内存。来源：上次直播遗留，NCS 尚未删除 |
| 待命 standby | 🟡 | 已加载进内存，但当前有其他 Rundown 正在播出，等待导播手动切换 |
| 激活 active | 🟢 | 当前导播正在使用的 Rundown，同时只能有一个 |
| 播出中 on-air | 🔴 | active 状态下且已执行第一个 Take，最需要保护的状态 |

### 自动激活规则

**核心原则：空闲时完全自动，播出中需要人工确认。**

- NCS 推送新 Rundown 时：
  - 若当前无正在播出的 Rundown → 直接自动激活，前端立刻显示
  - 若当前有 Rundown 处于 on-air 状态 → 新 Rundown 进入 standby，前端显示提示条，导播手动确认切换

### 工作流程
```
开播前  → 从 NCS 推送 Rundown → 自动激活 → 导播选择播出
直播中  → NCS 可更新 Rundown → 自动同步（不中断播出）
直播后  → 从 NCS 删除 Rundown → 后端自动清理持久化文件
```

### 启动恢复行为

后端重启时**不自动恢复**持久化数据到激活状态。
只加载索引，让导播在 Rundown 选择器里按需选择加载。
理由：重启后的状态不一定是导播想要的状态，保持导播的主动控制权。

---

## 六、下一步：第五轮 —— `2_ingest` 数据转换层

### 目标
将 `IMOSRunningOrder`（MOS 协议原始对象）转换为 RCAS 内部的 `IRundown`（业务域对象）。

### 架构决策（已定论）
1. **映射关系**：MOS Story → ISegment，MOS Item → IPart（暂不生成 IPiece）
2. **触发方式**：监听 `RundownStore` 事件（`roCreated`/`roReplaced` 等），事件驱动解耦
3. **存储位置**：转换结果存入 `3_domain_engine/store/` 内新建的 `ingest-store.ts`
4. **转换函数**：`2_ingest/mos-to-rundown.ts`，纯函数，无状态，无副作用

### 转换映射关系
```
IMOSRunningOrder          →  IRundown
  .ID (IMOSString128)     →    .externalId (string)
  .Slug                   →    .name
  .EditorialStart         →    .expectedStart
  .EditorialDuration      →    .expectedDuration
  .Stories[]              →    .segments[]
    Story.ID              →      ISegment.externalId
    Story.Slug            →      ISegment.name
    Story.Items[]         →      ISegment 下的 parts[]
      Item.ID             →        IPart.externalId
      Item.Slug           →        IPart.title
```

### 计划文件结构
```
2_ingest/
└── mos-to-rundown.ts     ← 纯函数转换（IMOSRunningOrder → IRundown）

3_domain_engine/store/
├── rundown-store.ts      ← 原 ingest-store，存 IRundown（业务真相来源）
├── mos-cache.ts          ← 原 rundown-store，存 IMOSRunningOrder
├── json-persistence.ts   ← 现有
└── socket-server.ts      ← 已订阅新 rundown-store
```

---

## 七、关键架构决策（已定论，勿推翻）

1. **MOS 角色**：RCAS 是 **MOS Device**，quick-mos 扮演 NCS 的角色
2. **连接模式**：后端监听 10540/10541/10542；lower port 主动连接 NCS；upper port 等待 NCS 连接
3. **持久化格式**：`data/rundowns/_index.json`（索引）+ `data/rundowns/{roID}.json`（完整数据）
4. **Profile 支持**：Profile 0 + 2 + 4，拒绝 1/3/5/6/7
5. **部署形态**：当前 Monolith（单进程），预留 Microservice 扩展点
6. **设计哲学**：参考 Sofie Core，声明式状态驱动，Blueprint 可热插拔

---

## 八、开发环境
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

## 九、快速上手（新对话首要步骤）

1. 读本文件（已完成）
2. 如需了解某轮细节，读 `/mnt/transcripts/journal.txt` 找对应 transcript
3. 如需了解架构全貌，读项目知识库中的 `ARCHITECTURE.md` 和 `README.md`
4. 如需了解当前代码，重点看：
   - `packages/backend/src/modules/1_mos_connection/mos-connection.ts`（回调注册）
   - `packages/backend/src/modules/3_domain_engine/store/rundown-store.ts`（状态管理）
   - `packages/core-lib/src/models/`（目标数据类型）