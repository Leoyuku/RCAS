/**
 * @file FramePoolContext.tsx
 * @description 实时帧池 Context
 *
 * 唯一职责：向下传递 framePool，解耦帧数据与组件层级
 *
 * 被使用：App.tsx（provide）/ SourceCard.tsx、RundownListView.tsx（consume）
 */

import { createContext, useContext } from 'react'

export const FramePoolContext = createContext<Record<string, string | null>>({})

export function useFramePool() {
    return useContext(FramePoolContext)
}