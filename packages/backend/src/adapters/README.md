# adapters — 通信适配器层

## 职责
决定模块之间如何通信，使同一套业务代码支持两种部署形态：

- `in-memory-adapter.ts` — 单体/EXE 模式：内存 EventBus
- `grpc-adapter.ts` — 微服务模式：gRPC 网络通信

## 当前状态
单体模式下模块直接调用，无需适配器。
微服务拆分时再实现。
