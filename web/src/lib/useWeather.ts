import { useQuery } from '@tanstack/react-query'
import {
  coordinateKey,
  isWeatherReading,
  WEATHER_REFRESH_MS,
  type City,
  type WeatherReading,
} from '../../../shared/weather'
import { loadWeather, saveWeather } from './weather'

export function useWeather(city: City | null, enabled: boolean) {
  return useQuery({
    queryKey: ['weather', city ? coordinateKey(city) : null],
    enabled: !!city && enabled,
    staleTime: WEATHER_REFRESH_MS,
    refetchInterval: WEATHER_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
    initialData: () => (city ? loadWeather(city) : undefined),
    initialDataUpdatedAt: () => (city ? loadWeather(city)?.fetchedAt : undefined),
    queryFn: async ({ signal }): Promise<WeatherReading> => {
      const query = new URLSearchParams({ latitude: String(city!.latitude), longitude: String(city!.longitude) })
      const response = await fetch(`/api/weather?${query}`, { signal })
      if (!response.ok) throw new Error('Weather unavailable')
      const reading: unknown = await response.json()
      if (!isWeatherReading(reading)) throw new Error('Invalid weather response')
      saveWeather(city!, reading)
      return reading
    },
  })
}
