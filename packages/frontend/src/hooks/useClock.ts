/**
 * @file useClock.ts
 * @description 实时时钟 Hook
 *
 * 功能：每秒更新本地时间 + 触发 NTP 同步（POST /api/time/sync）
 * 返回：{ time: Date, ntpSynced: boolean }
 *
 * 依赖：
 *   /api/time/sync  — 后端接口，触发系统 NTP 校时
 *
 * 被使用：Header.tsx、InfoPanel.tsx
 */

import { useEffect, useState } from 'react'

export function useClock() {
    const [syncing, setSyncing] = useState(false)
    const [time, setTime] = useState(() => new Date())
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 500)
        return () => clearInterval(t)
    }, [])
    const sync = async () => {
        setSyncing(true)
        try {
            const res = await fetch('/api/time/sync', { method: 'POST' })
            await res.json()
        } catch (e) {
            // 静默失败
        } finally {
            setSyncing(false)
        }
    }
    return {
        display: time.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        syncing,
        sync,
    }
}