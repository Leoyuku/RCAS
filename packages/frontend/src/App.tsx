import { useEffect } from 'react'
import { useRCASStore } from './store/useRCASStore'

// 生命周期状态颜色
const lifecycleColors: Record<string, string> = {
  'on-air':    'bg-red-700 text-white',
  'active':    'bg-green-700 text-white',
  'standby':   'bg-yellow-600 text-white',
  'persisted': 'bg-gray-600 text-white',
}

const lifecycleLabels: Record<string, string> = {
  'on-air':    'ON AIR',
  'active':    'ACTIVE',
  'standby':   'STANDBY',
  'persisted': 'PERSISTED',
}

export default function App() {
  const { connected, summaries, runtime, activate, take, sendToPreview, setNext, _initSocket } = useRCASStore()

  useEffect(() => { _initSocket() }, [])

  // 找到当前激活的 Rundown
  const activeRundown = summaries.find(s => s.lifecycle === 'active' || s.lifecycle === 'on-air')

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">

      {/* 顶栏 */}
      <header className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-4 shrink-0">
        <span className="font-bold text-lg tracking-widest">RCAS</span>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        {runtime && (
          <div className="ml-4 text-xs text-gray-400 font-mono">
            ENGINE: <span className="text-white font-bold">{runtime.engineState}</span>
          </div>
        )}
        {activeRundown && (
          <div className="text-xs text-gray-400">
            <span className="text-white">{activeRundown.name}</span>
          </div>
        )}
      </header>

      {/* 断线横幅 */}
      {!connected && (
        <div className="bg-red-800 text-white text-center text-sm py-2 font-semibold tracking-wide">
          ⚠ 连接中断 — 所有操作已禁用
        </div>
      )}

      {/* 主体三栏 */}
      <main className="flex flex-1 overflow-hidden">

        {/* 左栏：Rundown 列表 */}
        <aside className="w-72 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-gray-700">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Rundowns ({summaries.length})
            </h2>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {summaries.length === 0 && (
              <li className="px-4 py-6 text-sm text-gray-500 text-center">No rundowns available</li>
            )}
            {summaries.map((s) => (
              <li
                key={s.id}
                className="px-4 py-3 border-b border-gray-700 hover:bg-gray-700 cursor-pointer"
                onClick={() => activate(s.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{s.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold shrink-0 ${lifecycleColors[s.lifecycle] ?? 'bg-gray-600 text-white'}`}>
                    {lifecycleLabels[s.lifecycle] ?? s.lifecycle.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{s.segmentCount} segment{s.segmentCount !== 1 ? 's' : ''}</div>
              </li>
            ))}
          </ul>
        </aside>

        {/* 中栏：PROGRAM + 控制按钮 */}
        <section className="flex-1 flex flex-col border-r border-gray-700 min-w-0">

          {/* ON AIR */}
          <div className="border-b border-gray-700">
            <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/50 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-600" />
              <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">On Air</span>
            </div>
            <div className="px-4 py-4 min-h-16">
              {runtime?.onAirPartId ? (
                <div className="text-lg font-bold text-white">{runtime.onAirPartId}</div>
              ) : (
                <div className="text-sm text-gray-600">— 无播出内容 —</div>
              )}
            </div>
          </div>

          {/* PREVIEW */}
          <div className="border-b border-gray-700">
            <div className="px-4 py-2 bg-green-900/30 border-b border-green-800/50 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-600" />
              <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">Preview</span>
            </div>
            <div className="px-4 py-4 min-h-16">
              {runtime?.previewPartId ? (
                <div className="text-lg font-bold text-green-300">{runtime.previewPartId}</div>
              ) : (
                <div className="text-sm text-gray-600">— 无预监内容 —</div>
              )}
            </div>
          </div>

          {/* NEXT */}
          <div className="border-b border-gray-700">
            <div className="px-4 py-2 bg-yellow-900/30 border-b border-yellow-800/50 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-600" />
              <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">Next</span>
            </div>
            <div className="px-4 py-4 min-h-16">
              {runtime?.nextPartId ? (
                <div className="text-lg font-bold text-yellow-300">{runtime.nextPartId}</div>
              ) : (
                <div className="text-sm text-gray-600">— 无待播内容 —</div>
              )}
            </div>
          </div>

          {/* 控制按钮 */}
          <div className="p-4 flex gap-3">
            <button
              onClick={take}
              disabled={!connected || !runtime || runtime.engineState === 'STOPPED'}
              className="flex-1 h-12 bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold text-sm rounded transition-colors"
            >
              TAKE
            </button>
            <button
              onClick={sendToPreview}
              disabled={!connected || !runtime || !runtime.nextPartId}
              className="flex-1 h-12 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold text-sm rounded transition-colors"
            >
              SEND TO PREVIEW
            </button>
          </div>

        </section>

        {/* 右栏：Part 列表（可点击 SET NEXT） */}
        <section className="w-80 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-gray-700">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Parts — 点击设为 Next</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!runtime ? (
              <div className="px-4 py-6 text-sm text-gray-500 text-center">— domain engine pending —</div>
            ) : (
              <PartList runtime={runtime} onSetNext={setNext} connected={connected} />
            )}
          </div>
        </section>

      </main>
    </div>
  )
}

// ─── PartList 组件 ────────────────────────────────────────────────────────────

import type { RundownRuntime } from '../../core-lib/src/socket/socket-contracts'
import { useRCASStore as useStore } from './store/useRCASStore'

function PartList({ runtime, onSetNext, connected }: {
  runtime: RundownRuntime
  onSetNext: (partId: string) => void
  connected: boolean
}) {
  const summaries = useStore(s => s.summaries)
  const activeRundown = summaries.find(s => s.lifecycle === 'active' || s.lifecycle === 'on-air')

  // 从 store 里找到完整 rundown 数据（目前只有摘要，Part 列表暂用 runtime 的指针展示）
  // Step 2 阶段：用已知的三个 Part ID 渲染状态
  const partIds = [
    runtime.onAirPartId,
    runtime.previewPartId,
    runtime.nextPartId,
  ].filter(Boolean) as string[]

  if (partIds.length === 0) {
    return <div className="px-4 py-6 text-sm text-gray-500 text-center">暂无 Part 数据</div>
  }

  return (
    <ul>
      {partIds.map((partId) => {
        const isOnAir   = partId === runtime.onAirPartId
        const isPreview = partId === runtime.previewPartId
        const isNext    = partId === runtime.nextPartId

        const bg = isOnAir ? 'bg-red-900/40 border-red-700' :
                   isPreview ? 'bg-green-900/40 border-green-700' :
                   isNext ? 'bg-yellow-900/40 border-yellow-700' :
                   'border-gray-700 hover:bg-gray-700'

        const label = isOnAir ? 'ON AIR' : isPreview ? 'PREVIEW' : isNext ? 'NEXT' : ''
        const labelColor = isOnAir ? 'text-red-400' : isPreview ? 'text-green-400' : 'text-yellow-400'

        return (
          <li
            key={partId}
            className={`px-4 py-3 border-b cursor-pointer ${bg} transition-colors`}
            onClick={() => connected && !isOnAir && onSetNext(partId)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-mono truncate">{partId}</span>
              {label && <span className={`text-xs font-bold shrink-0 ${labelColor}`}>{label}</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}