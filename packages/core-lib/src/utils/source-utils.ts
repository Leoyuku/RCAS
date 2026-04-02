/**
 * @fileoverview source-utils.ts — sourceId 标准化工具
 *
 * 前后端共用，放在 core-lib/src/utils/source-utils.ts
 *
 * 解决两个问题：
 * 1. 命名容差：NCS 里 "CAM1" 和 Tricaster iso_label "CAM 1" 是同一个东西
 * 2. 文本提取：主编在直播词里用 《CAM 1》 标注机位，需要宽容解析
 */

// ─── normalizeSourceId ────────────────────────────────────────────────────────
/**
 * 将 sourceId 归一化：去除所有空格，转大写
 *
 * 用途：
 * - switcherMap 建立 key 时调用（Tricaster iso_label → 归一化 key）
 * - 查找 switcherMap 时调用（NCS sourceId → 归一化 key）
 * - 两端各自归一化后做比较，消除空格/大小写差异
 *
 * 示例：
 *   "CAM 1"  → "CAM1"
 *   "cam1"   → "CAM1"
 *   "CAM  1" → "CAM1"（双空格也处理）
 *   "INPUT7" → "INPUT7"
 */
export function normalizeSourceId(id: string): string {
    return id.replace(/\s+/g, '').toUpperCase()
}

// ─── extractSourceHint ────────────────────────────────────────────────────────
/**
 * 从自然语言文本中提取 sourceId 提示
 *
 * 主编在 NCS 直播词里用各种括号标注机位，例如：
 *   《CAM 1》今天的新闻头条……
 *   <<SERVER>> 播放录像……
 *   【CAM2】记者连线……
 *   [CAM 3] 现场直播……
 *
 * 提取后经 normalizeSourceId 处理，与 switcherMap key 格式一致。
 *
 * 返回 null 表示文本中没有找到括号标注。
 *
 * 注意：此函数目前预留，待拿到真实 MOS rundown 数据后
 * 在 mos-to-rundown.ts 中调用，填入 piece.content.sourceId。
 *
 * 示例：
 *   "《CAM 1》今天新闻"  → "CAM1"
 *   "<<SERVER>>播放"     → "SERVER"
 *   "【CAM2】连线"       → "CAM2"
 *   "[INPUT7] 视频"      → "INPUT7"
 *   "普通文本"           → null
 */
export function extractSourceHint(text: string): string | null {
    if (!text) return null

    // 按优先级依次匹配各种括号形式
    // 中文书名号：《内容》
    // 英文双尖括号：<<内容>>
    // 中文方括号：【内容】
    // 英文方括号：[内容]
    // 单尖括号：<内容>（优先级最低，避免误匹配 HTML 标签）
    const patterns = [
        /《([^》]+)》/,
        /<<([^>]+)>>/,
        /【([^】]+)】/,
        /\[([^\]]+)\]/,
        /<([^>]+)>/,
    ]

    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match && match[1]) {
            const extracted = match[1].trim()
            // 过滤掉明显不是 sourceId 的内容（长度过长，或包含中文字符）
            if (extracted.length <= 20 && !/[\u4e00-\u9fff]/.test(extracted)) {
                return normalizeSourceId(extracted)
            }
        }
    }

    return null
}