### **RCAS-MOS 连接模块重构日志 (PROGRESS.md)**

#### **第一阶段：初步探索与教训 (The "Fill-in-the-Blanks" Approach)**

1.  **初始目标**: 将 `.gcloudignore` 目录下引用的 Sofie `mos-connection` 源码，重构并整合到我们 `packages/backend/src/modules/1_mos_connection/` 目录中。
2.  **执行过程**:
    *   尝试直接复制 `sofie-mos-connection/packages/connector/src/index.ts` 的代码。
    *   在遇到 `import` 错误后，采用“哪里报错补哪里”的方式，被动地、零散地复制其他依赖文件（如 `MosDevice.ts`, `lib.ts` 等）。
3.  **遇到的问题**:
    *   这种方法导致了大量的、连锁的 `import` 路径错误和类型定义缺失。
    *   我们反复地在修复路径、补充类型定义，但因为缺乏对整个代码库结构和依赖关系的全局理解，工作陷入了“打地鼠”式的循环，效率极低。
    *   最关键的教训是：**在没有完全理解一个复杂系统的架构之前，任何局部的、自下而上的修补都注定是低效且容易出错的。**

#### **第二阶段：回归起点，系统性分析 (The "Architect's View")**

意识到初步方法的失败后，我们暂停了所有代码编写工作，回归问题的起点，对整个 `sofie-mos-connection` 库进行了系统性的、自顶向下的架构分析。

1.  **核心发现**: `sofie-mos-connection` 实际上是一个由多个独立 NPM 包（packages）组成的 **monorepo**。我们必须理解这些包之间的依赖关系，才能制定正确的迁移策略。

2.  **核心模块依赖关系分析**:
    *   **`@mos-connection/model` (模型层)**:
        *   **职责**: 定义所有 MOS 协议相关的数据结构、TypeScript 接口 (`interface`) 和枚举 (`enum`)。
        *   **依赖**: **无**。它是整个系统的最底层基石。
        *   **关键文件**: `model.ts`, `mosTypes.ts`, `xmlParse.ts`。

    *   **`@mos-connection/helper` (辅助函数层)**:
        *   **职责**: 提供处理 `model` 层数据的各种工具函数（如 XML 解析、数据验证等）。
        *   **依赖**: `-> @mos-connection/model`

    *   **`@mos-connection/connector` (连接与通信层)**:
        *   **职责**: 负责处理与 MOS 设备的实际网络通信（TCP/IP Sockets），收发 MOS 协议消息，管理连接状态。是功能的最顶层实现。
        *   **依赖**: `-> @mos-connection/helper`, `-> @mos-connection/model`

3.  **逻辑拓扑关系图**:

    ```mermaid
    graph TD
        subgraph 高层应用
            Connector["@mos-connection/connector\n(连接与通信)"]
        end
        subgraph 中间支撑
            Helper["@mos-connection/helper\n(辅助函数)"]
        end
        subgraph 核心基础
            Model["@mos-connection/model\n(数据模型)"]
        end
        Connector --> Helper
        Connector --> Model
        Helper --> Model
    ```

#### **第三阶段：确立新路线图 (The "Bottom-Up" Strategy)**

基于以上清晰的架构分析，我们确立了唯一正确且高效的迁移路线：**自底向上 (Bottom-Up)**。

1.  **第一步 (当前)**: **迁移 `@mos-connection/model` 包**。
    *   **目标**: 将 `model` 包的全部逻辑，完整且正确地迁移到 `packages/backend/src/modules/1_mos_connection/internals/` 目录下。这是构建一切的基础。
    *   **状态**: 我们已经完成了对 `model.ts`, `mosTypes.ts` 及其子目录 `mosTypes/` 下所有文件的深入分析，并准备开始创建和填充这些新文件。

2.  **第二步 (未来)**: **迁移 `@mos-connection/helper` 包**。在 `model` 稳定后，构建依赖于它的辅助函数。

3.  **第三步 (未来)**: **迁移 `@mos-connection/connector` 包**。在 `model` 和 `helper` 都就位后，最后处理顶层的网络通信逻辑。


#### **第四阶段：核心机制深度分析**

在开始编码前，我们对 Sofie 设计中最核心的两个机制——心跳和消息流转——进行了基于源码的深度分析，以确保我们的重构能100%还原其精髓。

##### **1. Sofie 真实的心跳机制 (基于 `NCSServerConnection.ts`)**

经过对源码的深入研究，我们摒弃了基于协议规范的通用推测，得出了 Sofie 代码中实际的心跳实现逻辑。该机制由 `NCSServerConnection` 类负责，其核心思想是**基于“请求-响应”模式的、并行的、带有超时机制的健康检查循环**。

**A. 启动时机:**

*   在 `MosConnection` 决定连接到一个 NCS 后，会创建一个 `NCSServerConnection` 实例。
*   该实例的 `connect()` 方法会启动其所有内部端口（Lower/Upper）的 TCP 连接，并在最后调用 `_sendHeartBeats()`，从而**启动心跳循环**。

**B. `_sendHeartBeats()` 循环核心:**

1.  **并行检查**: 使用 `Promise.all()` 来**同时**为所有被标记为 `useHeartbeats: true` 的端口（通常是 Lower 和 Upper）发起健康检查。
2.  **请求-响应机制**: 
    *   它不只是单向发送 `<heartbeat>`。
    *   而是调用 `await this.executeCommand(heartbeat)`。这个方法封装了**“发送消息并等待其 `ack` 回复”**的完整逻辑。
    *   一个心跳只有在**超时（默认5秒）之前收到了 NCS 的 `<mosAck>` 回复**，才被视为成功。
3.  **状态记录**: `NCSServerConnection` 内部为每个端口维护一个 `heartbeatConnected: boolean` 状态。如果 `ack` 成功收到，则为 `true`；如果超时，则为 `false`。
4.  **循环延续**: 当所有并行的检查都完成后（无论成功或失败），程序会启动一个 `setTimeout`，在指定间隔（`_heartBeatsInterval`）后再次调用 `_sendHeartBeats()`，形成无限循环。

**C. 健康裁定 (`getConnectedStatus()`):**

*   连接的最终健康状态，由**所有**必需端口的心跳结果共同决定。
*   只要有**任何一个**被要求心跳的端口其 `heartbeatConnected` 状态为 `false`，整个 `NCSServerConnection` 就会被判定为**不健康**。
*   **“所有必需通道都必须健康，整个连接才算健康”**——这种“与”逻辑确保了连接的绝对可靠性。

**D. 外部控制:**
*   上层的 `MosConnection` 类可以通过调用 `enableHeartbeats()` 和 `disableHeartbeats()` 方法，来命令 `NCSServerConnection` 实例（主/备）启动或停止其心跳循环，从而优雅地实现了主备切换的控制逻辑。

心跳机制的详细逻辑过程：

这个机制的核心，并非我之前所说的简单的 Ping-Pong，而是一个基于“请求-响应”模式的、并行的、带有超时机制的健康检查循环。

其全部逻辑被封装在 NCSServerConnection.ts 这个类中，它为每一个需要建立的 MOS 连接（比如一个主 ENPS，一个备 ENPS）创建一个实例。

当 MosConnection 中的 connect() 方法被调用时，它会为每个配置的端口（Lower, Upper 等）创建一个 MosSocketClient 实例，并把它们注册到 NCSServerConnection 中。
在所有客户端（MosSocketClient）被创建并启动连接后，NCSServerConnection 的 connect() 方法的最后一步，是调用 this._sendHeartBeats()。
这是整个心跳循环的起点。
这个方法是整个机制的心脏，其逻辑如下：

并行检查 (Parallel Checks):

它使用 Promise.all() 来同时为所有注册的、且被标记为 useHeartbeats: true 的客户端（即 Lower Port 和 Upper Port 的连接）执行健康检查。
这意味着它不是检查一个端口，成功后再检查下一个。而是一次性对所有需要维持的通道发起检查。
请求-响应机制 (Request-Response):

对于每一个端口，它并不是简单地发送一个单向的 <heartbeat> 消息。
相反，它调用 await this.executeCommand(heartbeat) 来发送心跳。executeCommand 是一个封装了发送消息并等待其 ack 回复的函数。
这意味着，一个心跳被认为是成功的，当且仅当：
<heartbeat> 消息被成功发送出去。
在预设的 timeout（默认 5 秒）内，收到了来自 NCS 的一个有效的 <mosAck> 回复。
如果超时仍未收到 ack，executeCommand 会抛出一个错误，这个心跳就被认为是失败的。
状态记录 (State Tracking):

NCSServerConnection 为每个端口（Client）维护一个状态：client.heartbeatConnected: boolean。
如果 executeCommand(heartbeat) 成功，它就设置 client.heartbeatConnected = true。
如果 executeCommand(heartbeat) 失败（超时），它就设置 client.heartbeatConnected = false，并发出一个错误事件。
循环的延续 (The Loop):

在 Promise.all() 完成（无论成功还是失败）之后，在 .then() 中，它会调用一个名为 triggerNextHeartBeat() 的函数。
triggerNextHeartBeat() 的唯一作用，就是启动一个 setTimeout，在 _heartBeatsInterval（心跳间隔，比如 10 秒）之后，再次调用 _sendHeartBeats() 方法。
这就构成了“执行检查 -> 等待间隔 -> 再次检查”的无限循环。 这个循环直到 dispose() 被调用时才会停止。
一个 NCSServerConnection 的整体连接状态（connected）不是由 TCP 是否连接来决定的，而是由心跳结果来裁定的。

这个方法会遍历所有被要求进行心跳检查 (useHeartbeats: true) 的客户端。
只要有任何一个必需的端口，其状态是 heartbeatConnected: false，那么整个 NCSServerConnection 就会被判定为未连接 (connected: false)。
只有所有必需的端口，其状态都为 heartbeatConnected: true 时，整个连接才被认为是健康的。
主动方: 我们的 RCAS (NCSServerConnection) 是心跳的唯一主动发起方。
机制: 是一个并行的“请求-响应”检查。它在每个必需的端口上发送 <heartbeat>，并严格要求在超时前收到 <mosAck> 作为响应。
健壮性: 健壮性体现在它的“与”逻辑上。所有必需通道都必须健康，整个连接才算健康。这避免了“半死不活”的连接状态（比如 Lower Port 通，但 Upper Port 不通）。
控制: MosConnection 这个上层类，可以通过 enableHeartbeats() 和 disableHeartbeats() 方法，来精准控制哪个 NCSServerConnection 实例（主/备）应该执行心跳循环，这完美地实现了主备切换时的心跳管理。
这一次，是完全基于 sofie-mos-connection 源码的真实逻辑。这个设计确实如您所说，非常优雅且极其健壮。

##### **2. 一条消息的生命周期**


    为了真正理解 Sofie 的设计，我们必须追踪一条 MOS 消息（无论是从 NCS 进来，还是我们发送出去）在 `model`, `helper`, `connector` 这三个模块中是如何流转的。这清晰地展示了 Sofie 设计的**分层思想**和**数据在不同层次间的转换过程**。

    **A. 处理上行消息 (Incoming: NCS -> RCAS)**

    1.  **`@mos-connection/connector` (耳朵 & 前台)**: 负责底层的 TCP/IP Socket 连接，接收原始 XML 数据流，并拼接成完整的 XML 字符串。
    2.  **`@mos-connection/helper` (翻译官 & 解析器)**: 接收 XML 字符串，使用 `xml-js` 等库将其**解析 (Parse)** 成一个通用的 JavaScript 对象。这是消息从“文本”到“结构化数据”的关键一步。
    3.  **`@mos-connection/model` (数据建模 & 验证)**: `helper` 参照 `model` 中定义的 TypeScript 接口（如 `IMOSRunningOrder`），对通用对象进行**实例化和类型转换**。此过程会大量调用 `getMosTypes` 工厂函数来创建和验证 `IMOSTime`, `IMOSString128` 等特殊类型，最终生成一个完全类型安全的 TypeScript 业务对象。
    4.  **交付应用层**: 最终成型的业务对象，通过事件（EventEmitter）的方式，被 `connector` 交付给 RCAS 的上层业务逻辑（Ingest Service）。

    **B. 处理下行消息 (Outgoing: RCAS -> NCS)**

    1.  **`@mos-connection/model` (构建蓝图)**: 上层业务逻辑根据 `model` 中定义的接口（如 `IMOSAck`），创建一个包含所有回复信息的 TypeScript 对象。
    2.  **`@mos-connection/helper` (XML 生成器)**: `helper` 模块接收此对象，并使用 `xmlbuilder` 等库将其**构建 (Build)** 成一个符合 MOS 协议的 XML 字符串。此过程会调用 `stringify()` 方法将特殊类型转换回字符串格式。
    3.  **`@mos-connection/connector` (嘴巴 & 发送器)**: `connector` 模块接收最终的 XML 字符串，并将其通过活动的 TCP Socket 写入网络，发送给 NCS。


#### **第五阶段：环境与依赖分析**

为了确保重构后的模块能顺利编译、运行和集成，我们通过分析所有 Sofie `mos-connection` 子包的 `package.json` 文件，梳理出了完整的环境与依赖需求清单。

**1. Node.js 版本:**

*   所有包都要求 **`Node.js >= 14.18.0`**。我们的开发和部署环境必须满足此最低版本要求。

**2. 核心 NPM 生产依赖:**

我们的 NestJS 项目 (`packages/backend/package.json`) 必须安装以下 4 个核心依赖库，以支持完整的 MOS 通信功能：

*   **`iconv-lite`**: 关键依赖。用于处理 MOS 协议中标准的 `utf16-be` 字符编码。
*   **`xml-js`**: 关键依赖。用于将从 NCS 接收的上行 XML 消息**解析 (Parse)** 为 JavaScript 对象。
*   **`xmlbuilder`**: 关键依赖。用于将我们要发往 NCS 的下行 JavaScript 对象**构建 (Build)** 为 XML 字符串。
*   **`eventemitter3`**: 关键依赖。用于实现事件驱动架构，使我们重构的 `MosConnectionModule` 能够向应用的其它部分解耦地发出通知（例如 `connected`, `disconnected`, `messageReceived` 等）。


#### **第六阶段：重构路线图 (The Refactoring Roadmap)**

这份路线图是我们下一阶段工作的行动手册，基于我们已经完成的所有分析，并遵循“自底向上”的核心战略。

**第一步：环境搭建 (Environment Setup)**
1.  **安装依赖**: 在 `packages/backend/` 目录下，执行 `npm install` 命令，安装我们在第五阶段分析出的全部 4 个核心生产依赖：`iconv-lite`, `xml-js`, `xmlbuilder`, `eventemitter3`。
2.  **创建模块结构**: 在 `packages/backend/src/modules/` 目录下，创建本次重构的主模块文件夹 `1_mos_connection`。并仿照 Sofie 的结构，在其中创建 `internals` 子目录，用于存放移植的核心代码。

**第二步：迁移 `@mos-connection/model` (数据模型层)**
*这是整个重构的基石。*
1.  在 `internals` 目录下，创建 `mosTypes` 子目录。
2.  **逐个迁移类型文件**: 将 `model/src/mosTypes` 中的 `mosString128.ts`, `mosTime.ts` 等独立、无依赖的底层类型文件，逐一创建并填充到我们新的 `mosTypes` 目录中。
3.  **迁移核心类型工厂**: 创建并填充 `mosTypes.ts` 文件，它将作为这些底层类型的工厂和聚合点。
4.  **迁移核心接口**: 将 `model/src/api` 中的核心接口定义（如 `IMOSObject.ts`, `IMOSDevice.ts`, `IMOSCommon.ts` 等）迁移到 `internals/api` 目录中。
5.  **创建入口**: 在 `internals` 目录下创建 `model.ts`，作为模型层的统一出口，导出所有相关的接口和类型。

**第三步：迁移 `@mos-connection/helper` (辅助工具层)**
*这一层负责数据模型与 XML 格式的相互转换。*
1.  在 `internals` 目录下，创建并填充 `mosModel.ts` 文件（源于 `helper/src/mosModel.ts`）。
2.  **实现 XML 解析**: 利用我们安装的 `xml-js` 库，在 `mosModel.ts` 中实现将 XML 字符串解析为 `model` 层定义的 TypeScript 对象的功能。
3.  **实现 XML 构建**: 利用我们安装的 `xmlbuilder` 库，在 `mosModel.ts` 中实现将 `model` 层的对象序列化为 XML 字符串的功能。
4.  **创建入口**: 在 `internals` 目录下创建 `helper.ts`，作为辅助工具层的统一出口。

**第四步：迁移 `@mos-connection/connector` (连接器核心层)**
*这是最复杂的一层，负责网络通信和心跳。*
1.  在 `internals` 目录下，创建 `connection` 子目录。
2.  **优先实现心跳核心**: 创建并填充 `NCSServerConnection.ts`。根据我们的深度分析，将包含“请求-响应”心跳循环的完整逻辑移植过来。
3.  **实现底层客户端/服务端**: 创建并填充 `mosSocketClient.ts` 和 `mosSocketServer.ts`，它们是 TCP 连接的具体处理者。
4.  **实现顶层控制器**: 创建并填充 `MosConnection.ts`。将连接管理、主备切换、事件派发（使用 `eventemitter3`）的逻辑移植过来。
5.  **实现逻辑设备**: 创建并填充 `MosDevice.ts`，它代表一个完整的、与 NCS 的逻辑连接。

**第五步：封装为 NestJS 模块 (Integration)**
1.  在 `1_mos_connection` 根目录下，创建 `mos-connection.module.ts`。
2.  创建 `mos-connection.service.ts`，将 `MosConnection` 的核心功能（如 `connect`, `dispose`, `getDevice`）封装为 Service 方法，并处理事件的监听与转发。
3.  通过依赖注入，将 `MosConnectionService` 暴露给 RCAS 应用的其他模块使用。


#### **第七阶段：架构原则 - 模块的绝对独立性**

通过对 Sofie `mos-connection` 项目 `package.json` 的最终复核，我们确认了一个至关重要的架构原则：

**Sofie 的 `mos-connection` 模块是一个完全独立的、自包含的 (self-contained) 项目，它在代码层面上与 Sofie 的核心库 (`core-lib`) 没有任何依赖关系。**

这是一个高明的设计决策，它将协议层与业务逻辑层完全解耦。`mos-connection` 的角色是一个纯粹的“翻译官”，它对外输出的，是其内部 `model` 定义的、符合 MOS 协议规范的业务对象，而不是 Sofie 核心所使用的内部对象。

**对我们项目的指导意义：**

我们必须严格遵守这一设计。我们正在重构的 `1_mos_connection` 模块，**绝对不能依赖我们自己的 `packages/core-lib`**。

*   **`1_mos_connection` 的职责**: 仅负责处理 MOS 通信，并将网络数据翻译成其内部 `internals/model.ts` 定义的纯粹 MOS 对象。
*   **“桥梁”的角色**: 我们将在模块**外部**，由一个更高阶的 Service (如 `IngestService`) 来负责消费 `mos-connection` 模块输出的 MOS 对象，并将其进一步转换为我们 `core-lib` 中定义的、RCAS 内部使用的业务模型（如 `RundownModel`, `PartModel` 等）。

这一原则确保了我们协议层的纯粹性、可维护性和未来的可复用性，是我们重构工作必须遵守的核心边界。

### **第八阶段：最终净化 (Final Purification)**

为了确保我们的重构工作在一个绝对干净、没有历史遗留“补丁”的环境中开始，我们对项目进行了一次彻底的清查。

*   **清查 `packages/core-lib`**:
    *   **发现**: 在 `packages/core-lib/src/models/` 目录下，我们找到了一个名为 `mos-model.ts` 的文件。
    *   **问题**: 该文件的存在严重违反了我们确立的“模块绝对独立性”原则，它将底层的协议模型与高层的核心业务模型耦合在了一起。这是一个在我们早期探索阶段留下的技术债务。
    *   **行动**: 我们已将 `mos-model.ts` 及其编译产物（`.js` 和 `.js.map`）彻底删除，使 `core-lib` 恢复了其只包含纯粹核心业务模型的干净状态。

*   **清查 `packages/frontend`**:
    *   **发现**: 我们对 `packages/frontend/src/` 目录及其所有潜在的子目录（如 `lib`, `components`, `model`）进行了系统性排查。
    *   **结论**: 未发现任何与 MOS 协议直接相关的、被临时添加或修改的文件。前端项目是干净的。

**结果：**
我们已经成功地将项目恢复到了一个真正“干净的开始”所要求的状态。所有的历史遗留“补丁”都已被移除，为我们下一阶段的、基于清晰架构的重构工作铺平了没有任何障碍的道路。

我们现在可以满怀信心地宣布，本会话的所有准备工作，包括最后的清理工作，均已完美收官。













