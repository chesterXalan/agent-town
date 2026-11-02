import { useTranslation } from 'react-i18next'
import { Canvas } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Building2, ChevronLeft, ChevronRight, CircleHelp, Eye, Pause, Play, Users, X } from 'lucide-react'
import { SceneClock } from '@/components/SceneClock'
import { OfficeScene } from '@/components/office/OfficeScene'
import { Button } from '@/components/ui/button'
import { SettingsMenu } from '@/components/SettingsMenu'
import { ThemeButton } from '@/components/ThemeButton'
import { OFFICE_CAMERA } from '@/lib/office/camera'
import { assignSeats, type SeatMap } from '@/lib/office/layout'
import { localHour, PHASES, phaseSky, skyAt, WEATHERS, type Phase, type Weather } from '@/lib/office/sky'
import { buildCampuses, DEMO_SESSIONS, STATE_CLASS } from '@/lib/town'
import { useFrameRate } from '@/lib/frameRateStore'
import { useTown } from '@/lib/useTown'
import { setEnvironment, useEnvironment } from '@/lib/environmentStore'
import { useWeather } from '@/lib/useWeather'
import { usableWeather } from '@/lib/weather'
import { skyAtLocation } from '@/lib/sunlight'
import { useLocation } from '@/lib/useLocation'
import type { TownSession } from '../../shared/api'

class SceneBoundary extends Component<{ children: ReactNode; message: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="p-8 text-body">
        {this.props.message}
      </div>
    ) : (
      this.props.children
    )
  }
}
const EMPTY: TownSession[] = []
export default function App() {
  const { t } = useTranslation()
  const fps = useFrameRate()
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
  const { phase, weather: weatherMode } = useEnvironment()
  const { city } = useLocation()
  const localWeather = useWeather(city, weatherMode === 'auto')
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
    document.title = waiting ? t('app.waitingTitle', { count: waiting }) : 'Agent Town'
  }, [waiting, t])
  const hour = localHour(now)
  const sky = phase === 'auto' ? (city ? skyAtLocation(now, city) : skyAt(hour)) : phaseSky(phase)
  const weather =
    weatherMode === 'auto'
      ? city
        ? (usableWeather(localWeather.data, now)?.weather ?? 'clear')
        : 'clear'
      : weatherMode
  const sourceLabel = demo
    ? t('source.demo')
    : town.isError
      ? t('source.failed')
      : town.data?.source === 'unavailable'
        ? t('source.unavailable')
        : town.data?.source === 'error'
          ? t('source.error')
          : !town.data
            ? t('source.connecting')
            : town.connected
              ? t('source.ready')
              : t('source.reconnecting')
  const sessionTitle = (session: TownSession) => (demo ? t(session.title) : session.title)
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
            <p className="text-label text-muted-foreground">{t('app.tagline')}</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" aria-label={t('help.title')} onClick={() => setHelp(!help)}>
            <CircleHelp className="size-5" />
          </Button>
          <ThemeButton />
          <SettingsMenu demo={demo} sourceLabel={sourceLabel} onToggleDemo={toggleDemo} now={now} />
        </div>
      </header>
      <div className="town-workspace">
        <aside className="town-roster border-r-2 border-border bg-card" aria-label={t('roster.label')}>
          <div className="flex flex-col gap-3 border-b-2 border-border p-4">
            <div className="flex items-center gap-2">
              <Users className="size-5" />
              <h2 className="text-title">{t('roster.title')}</h2>
              <span className="ml-auto text-num">{sessions.length}</span>
            </div>
            <div className="flex gap-4 text-ui">
              <span className="text-run">
                {t('roster.working', { count: sessions.filter((s) => s.state === 'working').length })}
              </span>
              <span className="text-warn">{t('roster.waiting', { count: waiting })}</span>
            </div>
            <select
              aria-label={t('roster.filter')}
              className="town-select text-ui"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">{t('roster.all')}</option>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="waiting">{t('state.waiting')}</option>
              <option value="working">{t('state.working')}</option>
              <option value="idle">{t('state.idle')}</option>
              <option value="unknown">{t('roster.unknown')}</option>
            </select>
          </div>
          <div className="town-residents p-3">
            {campus.districts.map((district) => {
              const residents = filtered.filter((a) => a.dept === district.dept)
              if (!residents.length) return null
              return (
                <section key={district.id} className="mb-5">
                  <h3 className="mb-2 truncate px-2 text-label text-muted-foreground" title={district.cwd}>
                    {district.label} {residents.length > 1 && <span className="text-num">{residents.length}</span>}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {residents.map(({ session }) => (
                      <button
                        key={session.id}
                        onClick={() => select(session.id)}
                        aria-pressed={selectedId === session.id}
                        className={`town-resident border-2 p-3 text-left ${selectedId === session.id ? 'border-primary bg-surface-2' : 'border-transparent hover:border-border'}`}
                      >
                        <span className="block truncate text-ui">{sessionTitle(session) || district.label}</span>
                        <span className="mt-1 flex items-center justify-between gap-2 text-label">
                          <span>{session.provider === 'codex' ? 'Codex' : 'Claude'}</span>
                          <span className={STATE_CLASS[session.state]}>{t(`state.${session.state}`)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
            {sessions.length === 0 && (
              <div className="p-2 text-body text-muted-foreground">
                <p>{t('roster.empty')}</p>
                <p className="mt-3">{t('roster.openCli')}</p>
                {town.data?.source !== 'ready' && <p className="mt-3">{t('roster.bridgeHelp')}</p>}
                <Button className="mt-4" variant="outline" onClick={toggleDemo}>
                  {t('demo.visit')}
                </Button>
              </div>
            )}
            {sessions.length > 0 && filtered.length === 0 && (
              <p className="p-3 text-body text-muted-foreground">{t('roster.noMatches')}</p>
            )}
          </div>
          <div className="mt-auto border-t-2 border-border p-4 text-label text-muted-foreground">
            {t('roster.localLife')}
          </div>
        </aside>
        <main className="town-main" aria-label={t('scene.label')}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border bg-card px-4 py-2">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('campus.previous')}
                disabled={pageIndex === 0}
                onClick={() => changePage(pageIndex - 1)}
              >
                <ChevronLeft />
              </Button>
              <span className="text-label">
                {t('campus.label', { current: pageIndex + 1, total: campuses.length })}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('campus.next')}
                disabled={pageIndex === campuses.length - 1}
                onClick={() => changePage(pageIndex + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={t('scene.phase')}
                className="town-select text-ui"
                value={phase}
                onChange={(e) => setEnvironment({ phase: e.target.value as Phase | 'auto' })}
              >
                <option value="auto">{t(city ? 'scene.localDaylight' : 'scene.auto')}</option>
                {PHASES.map((value) => (
                  <option key={value} value={value}>
                    {t(`phase.${value}`)}
                  </option>
                ))}
              </select>
              <select
                aria-label={t('scene.weather')}
                className="town-select text-ui"
                value={weatherMode}
                onChange={(e) => setEnvironment({ weather: e.target.value as Weather | 'auto' })}
              >
                <option value="auto">{t('scene.localWeather')}</option>
                {WEATHERS.map((value) => (
                  <option key={value} value={value}>
                    {t(`weather.${value}`)}
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
                {t(firstPerson ? 'scene.overview' : 'scene.walk')}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={t(paused ? 'scene.resume' : 'scene.pause')}
                onClick={() => setPaused(!paused)}
              >
                {paused ? <Play /> : <Pause />}
              </Button>
            </div>
          </div>
          {help && <div className="border-b-2 border-border bg-surface-2 p-4 text-body">{t('help.body')}</div>}
          <div className="town-canvas">
            <div ref={setLabelLayer} className="town-labels" />
            <SceneBoundary message={t('scene.error')}>
              <Suspense fallback={<div className="p-8 text-body">{t('scene.loading')}</div>}>
                {labelLayer && (
                  <Canvas
                    style={{ isolation: 'isolate' }}
                    shadows
                    camera={OFFICE_CAMERA}
                    dpr={[1, 1.5]}
                    frameloop={!hidden && !paused && reduce ? 'demand' : 'never'}
                    gl={{ antialias: true, powerPreference: 'low-power' }}
                  >
                    <SceneClock active={!hidden && !paused && !reduce} fps={fps} />
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
                {t('scene.paused')}
              </span>
            )}
            {selected && (
              <aside
                className="town-card border-2 border-border bg-card p-4 shadow-brutal"
                aria-label={t('resident.details')}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h2 className="text-title">{sessionTitle(selected)}</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('resident.close')}
                    onClick={() => setSelectedId(null)}
                  >
                    <X />
                  </Button>
                </div>
                <p className={`mb-3 text-ui ${STATE_CLASS[selected.state]}`}>{t(`state.${selected.state}`)}</p>
                <dl className="grid gap-3 text-body">
                  <div>
                    <dt className="text-label text-muted-foreground">{t('resident.session')}</dt>
                    <dd>
                      {selected.provider === 'codex' ? 'Codex' : 'Claude'} · PID {selected.pid}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-label text-muted-foreground">{t('resident.directory')}</dt>
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
