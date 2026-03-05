# 4_domain_engine — 核心引擎（大脑）

## 职责
- **Store**: 维护当前 Rundown 运行状态（当前播出条目、下一条等）
- **Resolver**: 结合当前时间计算 TargetState（Timeline）
- **Engine**: 响应 Take、SetNext 等用户操作

## 待实现
- `engine/rundown-engine.ts` — 播出状态机（Take/Next/Stop）
- `blueprints/default-blueprint.ts` — 默认数据转换规则
- `resolver/timeline-resolver.ts` — Timeline 计算引擎
