import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LocateFixed, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setEnvironment, useEnvironment } from '@/lib/environmentStore'
import { useWeather } from '@/lib/useWeather'
import { usableWeather, weatherIsStale } from '@/lib/weather'
import { sunTimesAtLocation } from '@/lib/sunlight'
import { useLocation } from '@/lib/useLocation'
import { cityLabel, type City } from '../../../shared/weather'

export function EnvironmentSettings({ now }: { now: number }) {
  const { t, i18n } = useTranslation()
  const { weather } = useEnvironment()
  const location = useLocation()
  const { city } = location
  const [input, setInput] = useState('')
  const [search, setSearch] = useState<{ name: string; language: string } | null>(null)
  const cities = useQuery({
    queryKey: ['cities', search],
    enabled: !!search,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async ({ signal }): Promise<City[]> => {
      const params = new URLSearchParams({ q: search!.name, language: search!.language })
      const response = await fetch(`/api/cities?${params}`, { signal })
      if (!response.ok) throw new Error('City search unavailable')
      return response.json() as Promise<City[]>
    },
  })
  const query = useWeather(city, weather === 'auto')
  const reading = usableWeather(query.data, now)
  const times = city ? sunTimesAtLocation(now, city) : null
  const formatTime = (date: Date | null) =>
    date && city
      ? new Intl.DateTimeFormat(i18n.language, { timeZone: city.timezone, hour: '2-digit', minute: '2-digit' }).format(
          date,
        )
      : '—'
  const status =
    weather !== 'auto'
      ? t('location.manual')
      : reading
        ? t(query.isError || weatherIsStale(reading, now) ? 'location.cached' : 'location.current', {
            weather: t(`weather.${reading.weather}`),
            time: city
              ? new Intl.DateTimeFormat(i18n.language, {
                  timeZone: city.timezone,
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(reading.observedAt)
              : '',
          })
        : query.isFetching
          ? t('location.loadingWeather')
          : t('location.unavailable')

  return (
    <section className="flex flex-col gap-3" aria-label={t('location.title')}>
      <h3 className="text-ui">{t('location.title')}</h3>
      <div className="flex items-center justify-between gap-2">
        {city ? (
          <p className="min-w-0 break-words text-body" title={cityLabel(city)}>
            {city.name}
          </p>
        ) : (
          <p role="status" className="min-w-0 text-body text-muted-foreground">
            {t(location.isFetching ? 'location.detecting' : 'location.detectFailed')}
          </p>
        )}
        {location.manual ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('location.clear')}
            title={t('location.clear')}
            onClick={() => setEnvironment({ city: null })}
          >
            <LocateFixed className="size-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('location.refresh')}
            title={t('location.refresh')}
            disabled={location.isFetching}
            onClick={location.refresh}
          >
            <RefreshCw className="size-4" />
          </Button>
        )}
      </div>
      {!location.manual && location.stale && city && (
        <p role="status" className="text-body text-muted-foreground">
          {t('location.lastNetwork')}
        </p>
      )}
      {!location.manual && (
        <p className="text-body text-muted-foreground">
          {t('location.networkHint')}{' '}
          <a className="underline" href="https://ipwhois.io/" target="_blank" rel="noreferrer">
            IPWhois
          </a>
        </p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (input.trim().length < 2) return
          const next = {
            name: input.trim(),
            language: i18n.language.startsWith('zh') ? 'zh' : i18n.language.startsWith('ja') ? 'ja' : 'en',
          }
          if (search?.name === next.name && search.language === next.language) void cities.refetch()
          else setSearch(next)
        }}
      >
        <input
          className="town-select min-w-0 flex-1 text-body"
          aria-label={t('location.search')}
          placeholder={t('location.placeholder')}
          value={input}
          maxLength={100}
          onChange={(event) => setInput(event.target.value)}
        />
        <Button
          variant="outline"
          size="icon"
          type="submit"
          aria-label={t('location.search')}
          disabled={input.trim().length < 2 || cities.isFetching}
        >
          <Search className="size-4" />
        </Button>
      </form>
      {search && (
        <div aria-live="polite" className="text-body">
          {cities.isFetching ? (
            t('location.searching')
          ) : cities.isError ? (
            t('location.searchFailed')
          ) : !cities.data?.length ? (
            t('location.noResults')
          ) : (
            <ul className="flex flex-col gap-2">
              {cities.data.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    className="w-full border-2 border-border p-2 text-left hover:bg-surface-2"
                    onClick={() => {
                      setEnvironment({ city: result })
                      setSearch(null)
                      setInput('')
                    }}
                  >
                    {cityLabel(result)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {city && (
        <div className="flex flex-col gap-2 text-body text-muted-foreground">
          <p>{t('location.sunTimes', { sunrise: formatTime(times!.sunrise), sunset: formatTime(times!.sunset) })}</p>
          {(times!.alwaysUp || times!.alwaysDown) && (
            <p>{t(times!.alwaysUp ? 'location.polarDay' : 'location.polarNight')}</p>
          )}
          <p role="status">{status}</p>
        </div>
      )}
      <p className="text-body text-muted-foreground">
        {t('location.credit')}{' '}
        <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        {' / '}
        <a className="underline" href="https://www.geonames.org/" target="_blank" rel="noreferrer">
          GeoNames
        </a>
      </p>
    </section>
  )
}
