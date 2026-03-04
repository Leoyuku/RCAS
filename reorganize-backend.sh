#!/bin/bash
# =============================================================================
# RCAS 后端目录结构对齐脚本
# 在项目根目录（RCAS/）下执行：bash reorganize-backend.sh
#
# 执行内容：
#   1. 建立新目录结构
#   2. 移动文件到正确位置
#   3. 删除原始设计中已废弃的空目录骨架
#   4. 打印最终目录结构供验证
#
# ⚠️  注意：执行前请确保 git 已提交或备份，脚本不可逆
# =============================================================================

set -e  # 任何命令失败立即退出

SRC="packages/backend/src"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     RCAS 后端目录结构对齐脚本 开始执行        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 步骤 1：创建新目录结构 ───────────────────────────────────────────────────
echo "▶ 步骤 1/4：创建新目录结构..."

mkdir -p "$SRC/shared"
mkdir -p "$SRC/modules/2_ingest"
mkdir -p "$SRC/modules/3_store"
mkdir -p "$SRC/modules/4_domain_engine/blueprints"
mkdir -p "$SRC/modules/4_domain_engine/engine"
mkdir -p "$SRC/modules/5_playout_controllers/drivers"
mkdir -p "$SRC/adapters"
mkdir -p "$SRC/entrypoints"

echo "   ✅ 目录创建完成"

# ── 步骤 2：移动 store/ → shared/ 和 modules/3_store/ ───────────────────────
echo ""
echo "▶ 步骤 2/4：移动文件到新位置..."

# logger.ts 是全局基础设施，归属 shared/
if [ -f "$SRC/store/logger.ts" ]; then
    mv "$SRC/store/logger.ts" "$SRC/shared/logger.ts"
    echo "   移动: store/logger.ts → shared/logger.ts"
fi

# rundown-store、json-persistence、socket-server 归属 modules/3_store/
if [ -f "$SRC/store/rundown-store.ts" ]; then
    mv "$SRC/store/rundown-store.ts" "$SRC/modules/3_store/rundown-store.ts"
    echo "   移动: store/rundown-store.ts → modules/3_store/rundown-store.ts"
fi

if [ -f "$SRC/store/json-persistence.ts" ]; then
    mv "$SRC/store/json-persistence.ts" "$SRC/modules/3_store/json-persistence.ts"
    echo "   移动: store/json-persistence.ts → modules/3_store/json-persistence.ts"
fi

if [ -f "$SRC/store/socket-server.ts" ]; then
    mv "$SRC/store/socket-server.ts" "$SRC/modules/3_store/socket-server.ts"
    echo "   移动: store/socket-server.ts → modules/3_store/socket-server.ts"
fi

# 删除已清空的 store/ 目录
if [ -d "$SRC/store" ]; then
    rmdir "$SRC/store" 2>/dev/null && echo "   删除: store/（已清空）" || echo "   ⚠️  store/ 目录非空，请手动检查"
fi

echo "   ✅ 文件移动完成"

# ── 步骤 3：删除废弃的空目录骨架 ─────────────────────────────────────────────
echo ""
echo "▶ 步骤 3/4：清理废弃的空目录骨架..."

# 原始设计中的 2_protocol_parsers 和 3_data_validators
# 这两层的职责已被 Sofie MOS 模块内部承担，目录废弃
for DEAD_DIR in \
    "$SRC/modules/2_protocol_parsers" \
    "$SRC/modules/3_data_validators"
do
    if [ -d "$DEAD_DIR" ]; then
        # 检查目录是否真的为空（只有占位文件或完全空）
        FILE_COUNT=$(find "$DEAD_DIR" -type f ! -name ".gitkeep" ! -name "*.md" | wc -l)
        if [ "$FILE_COUNT" -eq 0 ]; then
            rm -rf "$DEAD_DIR"
            echo "   删除废弃目录: $(basename $DEAD_DIR)/"
        else
            echo "   ⚠️  跳过 $(basename $DEAD_DIR)/ — 目录内有 $FILE_COUNT 个文件，请手动确认"
        fi
    fi
done

echo "   ✅ 废弃目录清理完成"

# ── 步骤 4：创建占位文件（防止 git 丢失空目录，并说明用途）───────────────────
echo ""
echo "▶ 步骤 4/4：创建新目录的说明文件..."

cat > "$SRC/modules/2_ingest/README.md" << 'EOF'
# 2_ingest — 数据转换层

## 职责
将来自 `1_mos_connection` 的 MOS 格式数据（`IMOSRunningOrder`）
翻译为 RCAS 内部格式（`IRundown`）。

这是 Blueprint 系统的原型，业务逻辑（如"什么样的 Story 对应什么播出动作"）将在此定义。

## 待实现
- `mos-to-rundown.ts` — MOS RO → IRundown 转换器
- `blueprints/` — 可热插拔的业务规则配置
EOF

cat > "$SRC/modules/4_domain_engine/README.md" << 'EOF'
# 4_domain_engine — 核心引擎（大脑）

## 职责
- **Store**: 维护当前 Rundown 运行状态（当前播出条目、下一条等）
- **Resolver**: 结合当前时间计算 TargetState（Timeline）
- **Engine**: 响应 Take、SetNext 等用户操作

## 待实现
- `engine/rundown-engine.ts` — 播出状态机（Take/Next/Stop）
- `blueprints/default-blueprint.ts` — 默认数据转换规则
- `resolver/timeline-resolver.ts` — Timeline 计算引擎
EOF

cat > "$SRC/modules/5_playout_controllers/README.md" << 'EOF'
# 5_playout_controllers — 播出控制层（四肢）

## 职责
接收 Timeline，通过 State Diff 算法计算最小指令集，
调用具体设备驱动执行物理控制。

## 待实现
- `tsr-engine.ts` — Timeline State Resolver
- `drivers/casparcg-driver.ts` — CasparCG 视频服务器
- `drivers/atem-driver.ts` — Blackmagic ATEM 切换台
- `drivers/vmix-driver.ts` — vMix
EOF

cat > "$SRC/adapters/README.md" << 'EOF'
# adapters — 通信适配器层

## 职责
决定模块之间如何通信，使同一套业务代码支持两种部署形态：

- `in-memory-adapter.ts` — 单体/EXE 模式：内存 EventBus
- `grpc-adapter.ts` — 微服务模式：gRPC 网络通信

## 当前状态
单体模式下模块直接调用，无需适配器。
微服务拆分时再实现。
EOF

cat > "$SRC/shared/config.ts" << 'EOF'
/**
 * @fileoverview 全局配置模块
 *
 * 所有 process.env 的读取集中在这里，避免散落在各个文件中。
 * 其他模块通过 import { config } from '../../shared/config' 使用。
 */

export const config = {
    // 运行环境
    nodeEnv:     process.env.NODE_ENV      || 'development',
    isProduction: process.env.NODE_ENV     === 'production',

    // HTTP 服务器
    port: parseInt(process.env.PORT        || '3000'),

    // 日志
    logLevel:    process.env.LOG_LEVEL     || 'info',

    // MOS 设备身份
    mosID:       process.env.MOS_ID        || 'rcas.mos',
    mosSerial:   process.env.MOS_SERIAL    || 'SN-RCAS-001',

    // MOS 监听端口
    mosPortLower: parseInt(process.env.MOS_PORT_LOWER || '10540'),
    mosPortUpper: parseInt(process.env.MOS_PORT_UPPER || '10541'),
    mosPortQuery: parseInt(process.env.MOS_PORT_QUERY || '10542'),

    // 联调模式（主动连接对端）
    mosConnectHost:      process.env.MOS_CONNECT_HOST,
    mosConnectID:        process.env.MOS_CONNECT_ID        || 'quick.mos',
    mosConnectPortLower: parseInt(process.env.MOS_CONNECT_PORT_LOWER || '11540'),
    mosConnectPortUpper: parseInt(process.env.MOS_CONNECT_PORT_UPPER || '11541'),
    mosConnectPortQuery: parseInt(process.env.MOS_CONNECT_PORT_QUERY || '11542'),

    // Socket.io
    socketCorsOrigin: process.env.SOCKET_CORS_ORIGIN || '*',

    // 版本
    version: process.env.npm_package_version || '1.0.0',
} as const;
EOF

echo "   ✅ 说明文件和 config.ts 创建完成"

# ── 完成，打印最终结构 ────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║              执行完成！最终目录结构            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

if command -v tree &> /dev/null; then
    tree "$SRC" -I "node_modules|*.spec.ts|*.js.map|__tests__" --dirsfirst -L 4
else
    find "$SRC" -not -path "*/node_modules/*" -not -name "*.js.map" | sort | \
    sed 's|[^/]*/|  |g' | sed 's|  \([^/]\)|└─ \1|'
fi

echo ""
echo "⚠️  重要提示：文件移动后，需要更新以下 import 路径："
echo ""
echo "   1. index.ts 中："
echo "      from './store/...'  →  from './modules/3_store/...'"
echo "      from './store/logger'  →  from './shared/logger'"
echo ""
echo "   2. modules/1_mos_connection/mos-connection.ts 中："
echo "      from '../../store/rundown-store'  →  from '../3_store/rundown-store'"
echo "      from '../../store/logger'         →  from '../../shared/logger'"
echo ""
echo "   3. modules/3_store/rundown-store.ts 中："
echo "      from './json-persistence'  (路径不变，同目录)"
echo "      from './logger'  →  from '../../shared/logger'"
echo ""
echo "   4. modules/3_store/json-persistence.ts 中："
echo "      from './logger'  →  from '../../shared/logger'"
echo ""
echo "   5. modules/3_store/socket-server.ts 中："
echo "      from './rundown-store'  (路径不变，同目录)"
echo "      from './logger'  →  from '../../shared/logger'"
echo ""
echo "完成后建议运行 tsc --noEmit 检查是否还有路径错误。"
echo ""