# RCAS - 自动化播出核心系统 | 架构设计与开发纲领 (v1.0)

**文档目的:** 本文档旨在沉淀 RCAS 项目从概念到最终架构方案的全过程核心思想，作为项目开发、迭代和维护的最高指导原则。当任何团队成员对“我们为什么这么做”产生疑问时，本文档将是最终的答案。

MOS 协议 2.8.4 核心技术总结
MOS (Media Object Server) 协议，是广播电视行业新闻制作领域的基石性通信标准。

1. 它的核心价值是什么？
简单来说，MOS 协议解决了新闻制播流程中**“文稿”与“媒体”之间信息孤岛的问题。它在新闻文稿系统 (NCS - Newsroom Computer System)** 和媒体服务器/设备 (MOS-Device) 之间，建立了一条标准的、双向的沟通桥梁。

NCS: 记者和编辑写稿、编排节目串联单（Rundown）的地方。例如 Avid iNEWS, ENPS。

MOS-Device: 存储和播出音视频、图文包装等媒体素材的设备。例如视频服务器、图文机、字幕机等。

在没有MOS协议的时代，编辑在文稿里需要某条视频，只能手动记录视频的ID，再由播出人员去另一台设备上寻找，效率低下且极易出错。MOS协议的出现，将这个流程自动化和一体化了。

2. 它是如何工作的？
MOS 协议本质上是一个基于 XML 和 TCP/IP 的应用层协议。

NCS 和 MOS 设备之间会建立持续的 TCP 连接。

双方通过互相发送特定格式的 XML 消息来进行沟通。

这些XML消息定义了所有的操作，比如“获取一个媒体列表”、“将一个视频片段链接到这篇文稿”、“这条素材的播出状态变了”。

3. 协议中的关键“角色”和“对象”
这份文档通篇都在围绕以下几个核心概念：

| 关键概念                       | 角色/作用                                                                 | 广电场景举例                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| NCS (Newsroom Computer System) | 主控方。新闻编辑和导播的工作平台。                                        | 编辑在 iNEWS 系统里写了一条关于“天气预报”的新闻稿。                                             |
| MOS (Media Object Server)      | 受控方/服务方。媒体资产的管理者和执行者。                                 | Vizrt 图文包装系统、Avid AirSpeed 视频服务器。                                                  |
| Rundown                        | 播出串联单。整个节目的播出顺序列表。                                      | 完整的《晚间新闻》节目单，包含了片头、主播口播、新闻视频、天气预报等环节。                      |
| Story                          | 稿件/条目。串联单中的一个独立环节。                                       | 上述例子中的“天气预报”就是一个 Story。                                                          |
| Item                           | 媒体项。嵌入在 Story 中的具体媒体对象。                                   | “天气预报”稿件中插入的“华北地区云图”这张图片，或者一段30秒的“未来三天天气”视频，就是一个 Item。 |
| mosObj                         | MOS 对象。对一个 Item 的详细 XML 描述，包含了媒体ID、时长、描述等元数据。 | 描述“华北地区云图”的XML信息，其中包含了它在图文服务器上的存储路径、预计播出时长等。             |


4. 核心工作流程（一个简化范例）
连接: MOS启动后，主动连接到 Octopus 系统（NCS）。

媒体推送: 编辑在 Octopus的媒体浏览器中，看到了MOS设备里面的所有可用图文模板（这是通过 MOS 协议获取的）。

拖拽链接: 编辑将一个“气温”模板拖拽到“天气预报”的稿件（Story）中。此时，Octopus 会向 MOS设备 发送一条 MOS 消息，在 Story 和 Item 之间建立链接。

数据填充: 编辑在Octopus 的插件（ActiveX 或 HTML5 插件）里，直接填写“北京 25°C”。这些数据通过 MOS 协议发送给 Rundown Control，然后RCAS 实时渲染出最终画面。

播出: 当导播切换到“天气预报”这条 Story 时，NCS 会通过 MOS 协议向RCAS发送“播出”指令，RCAS将渲染好的画面输出到切换台。

总结
MOS 协议是现代新闻制作流程实现“所见即所得”和“文稿驱动播出”的核心技术。 它将过去割裂的文稿创作、媒体管理、图文包装和播出控制，无缝地整合到了以“新闻串联单”为中心的统一工作流中。

这份 2.8.4 版本的文档，详细定义了上述流程中每一条 XML 消息的语法、参数和交互时序，是所有广电厂商开发相关设备时必须严格遵守的“法律”。虽然枯燥，但其重要性不言而喻。

希望这份总结能帮助你快速理解 MOS 协议的精髓。如果对其中某个具体细节感兴趣，我们可以继续深入探讨。

MOS 协议功能集 (Profiles) 核心提炼

| Profile 编号","Profile 官方名称","核心功能 (官方定义)","RCAS 最终实现策略                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile 0","Basic Communication","基础通信","✅ 完全支持 (MUST)。 这是 RCAS 的“身份证”和“心跳”，是我们 mos-connection 模块的核心职责，必须 100% 兼容。                                                                                                                  |
| Profile 1","Basic Object Workflow","基础对象工作流 (MOS -> NCS)","❌ 明确不支持 (WON'T)。 RCAS 不是一个媒体资产服务器(MOS)，我们不负责向 NCS 推送 (mosObj) 或提供 (mosListAll) 媒体对象列表。                                                                           |
| Profile 2","Basic Running Order / Content List Workflow","基础 Rundown 工作流","✅ 完全支持 (MUST)。 这是 RCAS 的“饭碗”，是我们接收和管理 Rundown 的核心。我们必须支持所有“roConstruction”族消息，如 roCreate, roReplace, roDelete，以及用于状态反馈的 roElementStat。  |
| Profile 3","Advanced Object Based Workflow","高级对象工作流","❌ 明确不支持 (WON'T)。 RCAS 不接受 NCS 创建 (mosObjCreate) 或替换 (mosItemReplace) 媒体对象的指令。我们的媒体对象信息，内嵌在 Profile 2 和 4 的 Rundown 数据中。                                         |
| Profile 4","Advanced RO / Content List Workflow","高级 Rundown 工作流","✅ 完全支持 (MUST)。 roReqAll 允许我们在启动时主动从 NCS 同步所有 Rundown，这对于系统的鲁棒性和故障恢复至关重要。roStorySend 让我们能接收一个 Story 的完整、详细信息。                          |
| Profile 5","Item Control","媒体项控制","❌ 明确不支持 (WON'T)。 这是与我们“声明式”架构哲学根本冲突的 Profile。我们绝不接受 <roCtrl> 这样的命令式外部指令。虽然 <roItemCue> 是一个有用的“提示”，但为了保持架构的纯粹性，我们选择在初期完整地、明确地拒绝整个 Profile 5。 |
| Profile 6","MOS Redirection","MOS 重定向","❌ 明确不支持 (WON'T)。 我们的初期架构不涉及复杂的多服务器媒体自动传输和“完全限定 MOS ID”的场景。                                                                                                                            |
| Profile 7","MOS RO / Content List Modification","MOS 对 RO 的修改","❌ 明确不支持 (WON'T)。 RCAS 是 NCS Rundown 的“执行者”，而不是“反向修改者”。我们不应该拥有修改 NCS 端数据的权限，这保证了数据流的单向和清晰。                                                       |

最终结论与声明
基于以上策略，RCAS 在与 NCS 进行 listMachInfo 握手时，将对外声明：

"RCAS is MOS Compatible - Profiles 0, 2, 4"

这个声明，简洁、准确、诚实且完全自洽。它向整个新闻网络生态系统清晰地宣告了我们的身份和能力：

“你可以完全信任我来管理和执行你的 Rundown (Profile 2)。”

“你可以向我发送更高级、更详细的 Rundown 数据 (Profile 4)。”

“我能通过一个统一的、强大的 roElementStat 消息，向你实时、精确地汇报我的所有状态。”

“但是，请不要把我当作一个可以被随意遥控的播放器 (Profile 5)，或者一个需要你来管理其中内容的文件服务器 (Profile 1, 3)。我有我自己的‘大脑’ (TSR)，请相信我的自主决策。”


## 第一章：基石 - 理解我们的“语言” (MOS 协议)

在构建任何系统之前，我们必须深刻理解我们所要交互的世界的“法律”——MOS 协议。

### 1.1 MOS 协议的核心价值

MOS (Media Object Server) 协议是**新闻制作领域**的行业标准，其核心价值在于，在**新闻文稿系统 (NCS)** 和**媒体服务器/设备 (MOS-Device)** 之间，建立了一条标准的、双向的沟通桥梁，实现了**“文稿驱动播出”**。

[![Data Flow in Sofie](https://sofie-automation.github.io/sofie-core/docs/user-guide/concepts-and-architecture/images/data-flow.svg)](https://sofie-automation.github.io/sofie-core/docs/user-guide/concepts-and-architecture/images/data-flow.svg)
*图1：MOS生态系统的数据流，NCS是指令源头*

### 1.2 关键角色与对象

| 关键概念                           | 角色/作用                                     | RCAS 项目中的对应                               |
| :--------------------------------- | :-------------------------------------------- | :---------------------------------------------- |
| **NCS (Newsroom Computer System)** | **主控方**，新闻流程的“大脑”。                | 我们的**上游系统** (iNEWS, ENPS)。              |
| **MOS (Media Object Server)**      | **受控方/服务方**，媒体资产的管理者和执行者。 | **我们的 RCAS 系统**，扮演一个智能的 MOS 设备。 |
| **Rundown**                        | 播出串联单，一个完整的节目。                  | 我们系统的**主要处理对象**。                    |
| **Story**                          | 稿件/条目，Rundown 中的一个逻辑单元。         | 对应 Sofie 中的 **Segment**。                   |
| **Item**                           | 媒体项，嵌入在 Story 中的具体媒体对象。       | 对应 Sofie 中的 **Part** + **Piece** 的组合。   |

---

## 第二章：定位 - RCAS 在生态中的角色

根据第一章的分析，我们必须明确 RCAS 的定位，以决定我们需要实现哪些功能。

### 2.1 我们的角色：一个智能的 MOS Device

RCAS 不是 NCS，而是作为一个**极其智能和强大的 MOS 设备**。我们**订阅和响应**来自 NCS 的指令，并将这些指令转化为对真实物理设备的精确控制。

### 2.2 我们必须支持的 Profile (功能集)
Profiles 0, 2, 4


## 第三章：进化 - 学习巨人的思想 (Sofie 架构)

在明确了“做什么”之后，我们必须回答“**如何做得最好**”。通过对世界级开源项目 Sofie Automation 的深度剖析，我们确定了 RCAS 将要遵循的**核心设计哲学**。

### 3.1 Sofie 的核心概念：从“命令”到“声明”

Sofie 的强大之处在于它彻底抛弃了“命令式”的控制模型，转而采用“声明式”的状态驱动模型。

[![The Timeline](https://sofie-automation.github.io/sofie-core/docs/user-guide/concepts-and-architecture/images/timeline.svg)](https://sofie-automation.github.io/sofie-core/docs/user-guide/concepts-and-architecture/images/timeline.svg)
*图2：Timeline - 描述“未来应该是什么样”的声明式蓝图*

| Sofie 概念            | **RCAS 将如何实现**                                                                                                                                                                                         |
| :-------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blueprint (蓝图)**  | 我们的 `core-engine` 将包含一个 **Blueprint 模块**，它负责将来自 NCS 的数据，**翻译**成我们内部的、包含 `Segments`, `Parts`, `Pieces` 的标准 Rundown 结构。**这部分逻辑必须是可编程、可配置的。**           |
| **Timeline (时间线)** | 我们的 `core-engine` 在每次状态变化（如 Take）后，都将**重新生成**一个代表“未来期望状态”的 `Timeline` JSON 对象。                                                                                           |
| **TSR (状态解析器)**  | 我们的 `playout-gateway` 的核心将是一个 **TSR 引擎**。它**只做一件事**：持续对比 `core-engine` 发布的 `Timeline` 和它自己维护的“设备真实状态”，并**自动计算**出最小化的指令集去执行，以抹平二者之间的差异。 |

### 3.2 最终结论：RCAS 的三大支柱

1.  **物理隔离的微服务:** `mos-gateway`, `core-engine`, `playout-gateway` 是三个独立的程序，通过 gRPC 网络通信。
2.  **声明式的状态驱动:** 我们不“指挥”设备，我们只“**描绘蓝图 (Timeline)**”，并由 TSR 去“**实现蓝图**”。
3.  **可编程的业务逻辑:** 核心的“数据转换”逻辑，由可热插拔的 **Blueprints** 来定义。

---

## 第四章：蓝图 - RCAS 的最终架构

基于以上所有原则，我们确定了 RCAS 的最终项目架构。

核心设计哲学: 稳固基石，拥抱扩展 (Solid Foundation, Embrace Extension)。我们的架构在物理和逻辑上，都为未来的变化预留了清晰的扩展点，而其核心永远保持稳定、封闭。

第一部分：宏观物理结构 (The Monorepo)
我们将采用行业标准的 Monorepo 结构，从物理上将前端、后端和共享库进行隔离，确保职责清晰，团队可并行开发。

RCAS/
├── packages/
│   │
│   ├── backend/          # 【后端包】 - 自动化核心服务
│   │
│   ├── frontend/         # 【前端包】 - UI 控制面板
│   │
│   └── core-lib/         # 【核心类型库】 - 我们项目的“法律”和“通用语言”
│
└── package.json          # Monorepo 根 package.json (使用 Lerna/Yarn Workspaces 管理)


第二部分：后端内部架构 (The Atomic & Encapsulated Pipeline)
backend 包内部，我们将采用最终确定的“原子化与封装结合的流水线”架构。它既有 Sofie 式“黑盒”带来的易用性，又有我们追求的、在实现细节上的原子化。

packages/backend/
└── src/
    │
    ├── shared/                     # 🧱 【共享层】
    │   ├── event-bus.ts            # - 全局事件总线 (我们“非直接耦合”的神经中枢)
    │   ├── config.ts               # - 环境变量与配置加载
    │   └── logger.ts               # - 全局日志服务
    │
    ├── modules/
    └── 1_mos_connection/
    │   ├── index.ts              # - [公共接口] 只导出 MosConnection 类
    │   │
    │   ├── mos-connection-ts     # - [最顶层] “总指挥”，管理两个“协议终端”
    │   │
    │   └── internals/            # - [内部实现细节]
    │       │
    │       ├── mos-socket.ts       # --- 【第一层：物理层】 ---
    │       │                       # - 纯粹的TCP连接器，只负责连接、重连、收发Buffer
    │       │
    │       ├── mos-protocol-machine.ts #--- 【第二层：协议层】 ---
    │       │                       # - 智能的“协议终端”，封装了心跳和ACK状态机
    │       │
    │       └── mos-xml.ts          # --- 【通用工具】 ---
    │                                # - 纯函数，用于构建和解析MOS XML，被上两层使用
    │   
    │   │
    │   ├── 2_protocol_parsers/     # --- 2号站：协议解析器
    │   │   └── mos-xml-parser.ts     # - 订阅 MosConnection 发出的 "rawXmlReceived" 事件，解析XML
    │   │
    │   ├── 3_data_validators/      # --- 3号站：数据校验器
    │   │   └── mos-object-validator.ts # - 订阅解析后的JS对象，用Zod校验，发布类型安全的“领域对象”
    │   │
    │   ├── 4_domain_engine/        # --- 4号站：领域引擎 (大脑)
    │   │   ├── models/             # - 定义 Rundown, Timeline 等 TypeScript 类型
    │   │   ├── blueprints/         # - 定义“数据转换”的业务逻辑
    │   │   └── engine/             # - 定义“状态运行”的业务逻辑 (Take, SetNext...)
    │   │
    │   └── 5_playout_controllers/    # --- 5号站：播出控制器 (四肢)
    │       ├── tsr-engine.ts       # - [核心] Timeline状态解析器
    │       └── drivers/            # - 具体的设备驱动 (Atem, CasparCG...)
    │
    ├── adapters/                   # 🔌 【适配器层】 - 决定“模块之间”如何通信
    │   ├── in-memory-adapter.ts    # - [单体模式] 使用内存EventBus桥接所有模块
    │   └── grpc-adapter.ts         # - [微服务模式] 使用gRPC通过网络桥接所有模块
    │
    └── entrypoints/                # 🚀 【启动入口】
        ├── monolith-entrypoint.ts  # - [启动方式①] 用于打包成EXE
        └── microservice-entrypoint.ts # - [启动方式②] 用于作为独立服务部署

packages/core-lib/src/models/
│
├── mos-model-ts          # 【职责单一】只定义从 Gateway 传来的、标准化的 MOS Rundown 对象接口
│
├── rundown-model.ts      # 【职责单一】只定义最顶层的 Rundown 对象的接口 (IRundown)
│
├── segment-model.ts      # 【职责单一】只定义 Segment 对象的接口 (ISegment)
│
├── part-model.ts         # 【职责单一】只定义 Part 对象的接口 (IPart)
│
├── piece-model.ts        # 【职责单一】只定义 Piece 对象的接口 (IPiece)
│
├── timeline-model.ts     # 【职责单一】只定义 Timeline 和 TimelineObject 的接口
│
└── enums-ts              # 【职责单一】定义所有共享的枚举，如 DeviceType, StatusCode 等

这些文件之间的关系
它们之间会通过 import 形成一个清晰的、自上而下的依赖链：

rundown.model.ts 会 import { Segment } from './segment.model';

segment.model.ts 会 import { Part } from './part.model';

part.model.ts 会 import { Piece } from './piece.model';

这个结构，就像一个俄罗斯套娃，每一层都清晰地定义了自己的结构，并引用了它的下一层。


第三部分：数据流与工作方式
启动:

monolith.entrypoint.ts 启动时，会实例化所有 modules/ 下的服务，并使用 in-memory.adapter.ts 将它们全部连接到同一个内存 EventBus 上。

数据进入:

1_mos_connection 模块，作为我们流水线的第一站，它像一个功能强大的“预处理中心”。它封装了所有与 NCS 通信的复杂性。

它对外只派发高级、有意义的事件，例如 on('roCreate', (xmlString) => ...) 或 on('roElementAction', ...)。

数据加工:

2_parsers 订阅这些事件，将 xmlString 解析成 JS 对象。

3_validators 订阅解析后的对象，进行校验，生成类型安全的领域对象。

决策与生成:

4_domain_engine 接收到干净的领域对象。

blueprints/ 将其转换为内部的 Part, Piece 结构。

engine/ 在响应 take 等指令时，更新状态。

engine/ 在状态更新后，生成最终的 Timeline 对象。

执行:

5_playout_controllers 的 tsr.engine 接收到 Timeline，计算出指令，并交由相应的 drivers/ 去执行。

这，就是我们的最终蓝图。

它完全采纳并融合了我们所有的共识：

物理上，它是一个清晰的 Monorepo。

思想上，它是一个声明式的、受 Sofie 启发的系统。

结构上，它是一条原子化的、望文生义的“数据流水线”。

实现上，它通过“黑盒”封装，将复杂性内聚，对外提供简单接口。

部署上，它拥有“一体”和“分身”两种形态，兼具开发的便捷性和未来的扩展性。

在架构层面，再无遗漏，再无争议

