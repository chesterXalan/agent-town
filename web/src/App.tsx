import { Canvas } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Building2, ChevronLeft, ChevronRight, CircleHelp, Eye, Pause, Play, Users, X } from 'lucide-react'
import { SceneClock } from '@/components/SceneClock'
import { OfficeScene } from '@/components/office/OfficeScene'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { OFFICE_CAMERA } from '@/lib/office/camera'
import { assignSeats, type SeatMap } from '@/lib/office/layout'
import { localHour, PHASE_LABEL, phaseSky, skyAt, WEATHER_LABEL, type Phase, type Weather } from '@/lib/office/sky'
import { buildCampuses, DEMO_SESSIONS, STATE_CLASS, STATE_LABEL } from '@/lib/town'
import { useTown } from '@/lib/useTown'
import type { TownSession } from '../../shared/api'

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="p-8 text-body">
        3D 場景載入失敗，請重新整理或確認瀏覽器已啟用 WebGL，左側仍可查看工作階段
      </div>
    ) : (
      this.props.children
    )
  }
}
const EMPTY: TownSession[] = []
export default function App() {
  const [demo, setDemo] = useState(() => new URLSearchParams(location.search).get('demo') === '1')
  const town = useTown(demo)
  const sessions = demo ? DEMO_SESSIONS : (town.data?.sessions ?? EMPTY)
  const campuses = useMemo(() => buildCampuses(sessions), [sessions])
  const [page, setPage] = useState(0)
  const pageIndex = Math.min(page, campuses.length - 1)
  const campus = campuses[pageIndex]
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = sessions.find((s) => s.id === selectedId)
  const [firstPerson, setFirstPerson] = useState(false)
  const [paused, setPaused] = useState(false)
  const [phase, setPhase] = useState<Phase | 'auto'>('auto')
  const [weather, setWeather] = useState<Weather>('clear')
  const [now, setNow] = useState(Date.now)
  const [hidden, setHidden] = useState(document.hidden)
  const [reduce, setReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [help, setHelp] = useState(false)
  const [labelLayer, setLabelLayer] = useState<HTMLDivElement | null>(null)
  const [filter, setFilter] = useState('all')
  const seatsRef = useRef<SeatMap>(new Map())
  const seats = useMemo(() => {
    seatsRef.current = assignSeats(seatsRef.current, campus.agents)
    return seatsRef.current
  }, [campus.agents])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    const visibility = () => setHidden(document.hidden)
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => setReduce(media.matches)
    document.addEventListener('visibilitychange', visibility)
    media.addEventListener('change', motion)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      media.removeEventListener('change', motion)
    }
  }, [])
  const waiting = sessions.filter((s) => s.state === 'waiting').length
  useEffect(() => {
    document.title = waiting ? `(${waiting}) 等你 · Agent Town` : 'Agent Town'
  }, [waiting])
  const hour = localHour(now)
  const sky = phase === 'auto' ? skyAt(hour) : phaseSky(phase)
  const sourceLabel = demo
    ? '示範小鎮'
    : town.isError
      ? '連線失敗'
      : town.data?.source === 'unavailable'
        ? '尚未連接橋接工具'
        : town.data?.source === 'error'
          ? '橋接工具讀取失敗'
          : !town.data
            ? '連線中'
            : town.connected
              ? '本機即時狀態'
              : '重新連線中・資料可能過時'
  function select(id: string) {
    setSelectedId(id)
    setFirstPerson(false)
    setPaused(false)
  }
  function changePage(next: number) {
    setPage(next)
    setSelectedId(null)
    setFirstPerson(false)
  }
  function toggleDemo() {
    const next = !demo
    setDemo(next)
    changePage(0)
    setFilter('all')
    history.replaceState(null, '', next ? '/?demo=1' : '/')
  }
  const filtered = campus.agents.filter(
    (a) => filter === 'all' || a.session.provider === filter || a.session.state === filter,
  )
  return (
    <div className="town-app bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <Building2 className="size-7 text-primary" />
          <div>
            <h1 className="text-display">AGENT TOWN</h1>
            <p className="text-label text-muted-foreground">把工作留給 agent，把日常還給小鎮</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-ui" role="status">
            {sourceLabel}
          </span>
          <Button variant={demo ? 'default' : 'outline'} onClick={toggleDemo}>
            {demo ? '回到即時' : '看看示範'}
          </Button>
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="操作說明" onClick={() => setHelp(!help)}>
            <CircleHelp className="size-5" />
          </Button>
        </div>
      </header>
      <div className="town-workspace">
        <aside className="town-roster border-r-2 border-border bg-card" aria-label="居民名冊">
          <div className="flex flex-col gap-3 border-b-2 border-border p-4">
            <div className="flex items-center gap-2">
              <Users className="size-5" />
              <h2 className="text-title">小鎮居民</h2>
              <span className="ml-auto text-num">{sessions.length}</span>
            </div>
            <div className="flex gap-4 text-ui">
              <span className="text-run">{sessions.filter((s) => s.state === 'working').length} 工作中</span>
              <span className="text-warn">{waiting} 等你回覆</span>
            </div>
            <select
              aria-label="篩選居民"
              className="town-select text-ui"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">全部居民</option>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="waiting">等你回覆</option>
              <option value="working">工作中</option>
              <option value="idle">休息中</option>
              <option value="unknown">未知狀態</option>
            </select>
          </div>
          <div className="town-residents p-3">
            {campus.districts.map((district) => {
              const residents = filtered.filter((a) => a.dept === district.dept)
              if (!residents.length) return null
              return (
                <section key={district.id} className="mb-5">
                  <h3 className="mb-2 truncate px-2 text-label text-muted-foreground" title={district.cwd}>
                    {district.label} <span className="text-num">{residents.length}</span>
                  </h3>
                  <div className="flex flex-col gap-2">
                    {residents.map(({ session }) => (
                      <button
                        key={session.id}
                        onClick={() => select(session.id)}
                        aria-pressed={selectedId === session.id}
                        className={`town-resident border-2 p-3 text-left ${selectedId === session.id ? 'border-primary bg-surface-2' : 'border-transparent hover:border-border'}`}
                      >
                        <span className="block truncate text-ui">{session.title || district.label}</span>
                        <span className="mt-1 flex items-center justify-between gap-2 text-label">
                          <span>{session.provider === 'codex' ? 'Codex' : 'Claude'}</span>
                          <span className={STATE_CLASS[session.state]}>{STATE_LABEL[session.state]}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
            {sessions.length === 0 && (
              <div className="p-2 text-body text-muted-foreground">
                <p>目前還沒有居民入住</p>
                <p className="mt-3">開啟 Claude Code 或 Codex，就會自動出現在這裡</p>
                {town.data?.source !== 'ready' && (
                  <p className="mt-3">即時模式需要已安裝 MH Desk Pets 的橋接工具與 hooks，桌寵不用開著</p>
                )}
                <Button className="mt-4" variant="outline" onClick={toggleDemo}>
                  先逛示範小鎮
                </Button>
              </div>
            )}
            {sessions.length > 0 && filtered.length === 0 && (
              <p className="p-3 text-body text-muted-foreground">這個園區沒有符合的居民</p>
            )}
          </div>
          <div className="mt-auto border-t-2 border-border p-4 text-label text-muted-foreground">
            生活動畫是本機模擬，不會消耗 tokens
          </div>
        </aside>
        <main className="town-main" aria-label="3D 小鎮">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border bg-card px-4 py-2">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                aria-label="上一個園區"
                disabled={pageIndex === 0}
                onClick={() => changePage(pageIndex - 1)}
              >
                <ChevronLeft />
              </Button>
              <span className="text-label">
                園區 {pageIndex + 1} / {campuses.length}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="下一個園區"
                disabled={pageIndex === campuses.length - 1}
                onClick={() => changePage(pageIndex + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="時段"
                className="town-select text-ui"
                value={phase}
                onChange={(e) => setPhase(e.target.value as Phase | 'auto')}
              >
                <option value="auto">跟隨時間</option>
                {Object.entries(PHASE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="天氣"
                className="town-select text-ui"
                value={weather}
                onChange={(e) => setWeather(e.target.value as Weather)}
              >
                {Object.entries(WEATHER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Button
                variant={firstPerson ? 'default' : 'outline'}
                onClick={() => {
                  setFirstPerson(!firstPerson)
                  setPaused(false)
                }}
              >
                <Eye className="size-4" />
                {firstPerson ? '回到俯瞰' : '進去走走'}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={paused ? '繼續畫面' : '暫停畫面'}
                onClick={() => setPaused(!paused)}
              >
                {paused ? <Play /> : <Pause />}
              </Button>
            </div>
          </div>
          {help && (
            <div className="border-b-2 border-border bg-surface-2 p-4 text-body">
              拖曳旋轉、滾輪縮放，WASD 移動，點居民可找到他，進去走走後可拖曳轉頭，時段與天氣是場景效果
            </div>
          )}
          <div className="town-canvas">
            <div ref={setLabelLayer} className="town-labels" />
            <SceneBoundary>
              <Suspense fallback={<div className="p-8 text-body">小鎮準備中…</div>}>
                {labelLayer && (
                  <Canvas
                    style={{ isolation: 'isolate' }}
                    shadows
                    camera={OFFICE_CAMERA}
                    dpr={[1, 1.5]}
                    frameloop={!hidden && !paused && reduce ? 'demand' : 'never'}
                    gl={{ antialias: true, powerPreference: 'low-power' }}
                  >
                    <SceneClock active={!hidden && !paused && !reduce} />
                    <OfficeScene
                      key={`${demo}:${pageIndex}`}
                      agents={campus.agents}
                      seats={seats}
                      labels={campus.labels}
                      htmlPortal={{ current: labelLayer }}
                      sky={sky}
                      weather={weather}
                      hour={hour}
                      focusId={selectedId}
                      firstPerson={firstPerson}
                      reduce={reduce}
                      onSelectAgent={select}
                    />
                  </Canvas>
                )}
              </Suspense>
            </SceneBoundary>
            {paused && (
              <span className="absolute bottom-4 left-4 border-2 border-border bg-card px-3 py-2 text-label">
                畫面已暫停・狀態繼續更新
              </span>
            )}
            {selected && (
              <aside className="town-card border-2 border-border bg-card p-4 shadow-brutal" aria-label="居民資料">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h2 className="text-title">{selected.title}</h2>
                  <Button variant="ghost" size="icon" aria-label="關閉居民資料" onClick={() => setSelectedId(null)}>
                    <X />
                  </Button>
                </div>
                <p className={`mb-3 text-ui ${STATE_CLASS[selected.state]}`}>{STATE_LABEL[selected.state]}</p>
                <dl className="grid gap-3 text-body">
                  <div>
                    <dt className="text-label text-muted-foreground">工作階段</dt>
                    <dd>
                      {selected.provider === 'codex' ? 'Codex' : 'Claude'} · PID {selected.pid}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-label text-muted-foreground">工作目錄</dt>
                    <dd className="break-all text-mono">{selected.cwd}</dd>
                  </div>
                </dl>
              </aside>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
