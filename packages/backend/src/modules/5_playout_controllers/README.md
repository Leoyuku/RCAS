# 5_playout_controllers — 播出控制层（四肢）

## 职责
接收 Timeline，通过 State Diff 算法计算最小指令集，
调用具体设备驱动执行物理控制。

## 待实现
- `tsr-engine.ts` — Timeline State Resolver
- `drivers/casparcg-driver.ts` — CasparCG 视频服务器
- `drivers/atem-driver.ts` — Blackmagic ATEM 切换台
- `drivers/vmix-driver.ts` — vMix
