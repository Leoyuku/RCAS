# 2_ingest — 数据转换层

## 职责
将来自 `1_mos_connection` 的 MOS 格式数据（`IMOSRunningOrder`）
翻译为 RCAS 内部格式（`IRundown`）。

这是 Blueprint 系统的原型，业务逻辑（如"什么样的 Story 对应什么播出动作"）将在此定义。

## 待实现
- `mos-to-rundown.ts` — MOS RO → IRundown 转换器
- `blueprints/` — 可热插拔的业务规则配置
