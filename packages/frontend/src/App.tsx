import { useEffect } from 'react'
import { useRCASStore } from './store/useRCASStore'

// 生命周期状态对应的颜色（广电行业标准色）
const lifecycleColors: Record<string, string> = {
  'on-air':    'bg-red-700 text-white',
  'active':    'bg-red-700 text-white',
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
  const { connected, summaries, activate, _initSocket } = useRCASStore()

  // 初始化 Socket 连接（只执行一次）
  useEffect(() => {
    _initSocket()
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">

      {/* 顶栏 */}
      <header className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-4">
        <span className="font-bold text-lg tracking-widest">RCAS</span>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* 主体 */}
      <main className="flex flex-1 overflow-hidden">

        {/* 左栏：Rundown 列表 */}
        <aside className="w-72 bg-gray-800 border-r border-gray-700 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Rundowns ({summaries.length})
            </h2>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {summaries.length === 0 && (
              <li className="px-4 py-6 text-sm text-gray-500 text-center">
                No rundowns available
              </li>
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
                <div className="text-xs text-gray-500 mt-1">
                  {s.segmentCount} segment{s.segmentCount !== 1 ? 's' : ''}
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* 中栏：PROGRAM（占位） */}
        <section className="flex-1 flex flex-col border-r border-gray-700">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-600" />
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Program</h2>
          </div>
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
            — domain engine pending —
          </div>
        </section>

        {/* 右栏：PREVIEW（占位） */}
        <section className="flex-1 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-600" />
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Preview</h2>
          </div>
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
            — domain engine pending —
          </div>
        </section>

      </main>
    </div>
  )
}