基于对 MOS-Protocol/profile0.md 的阅读以及结合我们之前的架构讨论（状态驱动 vs 命令驱动，以及 Sofie 的启发），我对 MOS Profile 0 的 Workflow 看法如下：

1. Profile 0 的核心定位：不仅仅是“握手”，更是“状态确立”
从文档来看，Profile 0 的 Workflow 非常简洁，只有三步：

建立连接 (Connect)：TCP/IP Socket层面的连接。
心跳 (Heartbeat)：应用层面的存活确认。
设备信息交换 (Machine Info)：reqMachInfo -> listMachInfo，确认“你是谁”以及“你支持什么 Profile”。
在传统的命令驱动（Command-Driven）架构中，我们往往把这看作一个“初始化流程”或“配置步骤”，连上了就不管了，或者写个定时器发心跳。

但在状态驱动（State-Driven）及 Sofie 的架构理念中，Profile 0 定义了整个系统的基础状态模型。它不应该只是一个“动作”，而是一个持续维护的“状态对象”。

2. 对“状态驱动”架构的映射
如果我们要像专家建议的那样，从底层开始就贯彻状态驱动，那么 Profile 0 的实现逻辑应该是这样的：

Connection State (连接状态): 不仅仅是 Socket.connected (true/false)。

文档提到 heartbeat 确认了三个层级的连通性（网络、Socket、应用响应）。
实现思路：我们需要一个 ConnectionManager，它维护一个状态机（Disconnected -> Connecting -> SocketConnected ->AppConnected/HeartbeatOK）。每一次 heartbeat 的成功或失败，都是在这个状态机上的一次 Update（状态更新），而不是简单的报错。
Capability State (能力状态): listMachInfo 返回的内容。

这定义了后续交互的边界。比如对方只支持 Profile 0 和 1，那么我们的状态机就应该自动禁用 Profile 2 (Running Order) 的相关状态逻辑，而不是等到发命令时才发现不支持。
实现思路：listMachInfo 的结果应该被映射到一个 MosDevice 的 State Store 中，作为该设备的不可变属性（直到下次重连）。
3. 关键的实现细节与挑战 (基于文档)
文档中有几个点对我们底层架构设计至关重要，也是之前的工程容易“推倒重来”的坑：

端口分离与并发 (Two Ports - Four Sockets):

文档明确指出了 Lower Port (10540) 和 Upper Port (10541) 的分离。
这意味着我们的底层连接类不能是一个单例 Socket，而必须管理两组独立的连接状态。上层端口（Running Order）的阻塞不应影响下层端口（Metadata）的心跳。这点在状态机设计中必须解耦。
严格的 ACK 机制 (Synchronous ACK):

文档强调：Wait for an Ack message ... before ... transmitting the next message.
这是一个典型的阻塞队列模型。
架构启示：我们不能随心所欲地通过状态变化触发发送。我们需要一个 Outbound Queue (发送队列) 状态机。
状态驱动逻辑：
业务层改变状态（例如：Rundown 更新）。
Diff 逻辑生成 MOS 消息，推入队列。
底层 Socket Actor 处于 Idle 状态时，从队列取出一个发送，进入 WaitingForAck 状态。
收到 ACK，状态变回 Idle，触发队列下一个。 如果在这里没有处理好状态流转，很容易出现文档警告的“死循环”或“消息丢失”。
4. 结论：第一块砖怎么砌？
我非常赞同专家们的建议。

如果按照 Sofie 的思路和状态驱动的原则，我们的第一步不应该是写“发送 Running Order”的代码。

第一块砖应该是搭建一个健壮的 MosConnection Actor (或状态机服务)。

它只做一件事：维护 Profile 0 定义的连接生命周期。

它负责自动重连。
它负责定时发送 Heartbeat 并更新健康状态。
它负责在连接建立初期自动索取 MachineInfo 并存入状态库。
它对上层暴露的不是 socket 对象，而是一个 Observable (可观察) 的 ConnectionStatus 数据流。
你觉得我们是直接开始着手设计这个 MosConnection 模块的接口，还是你需要再深入了解一下 Sofie 是如何处理这个“队列与ACK”机制的？

