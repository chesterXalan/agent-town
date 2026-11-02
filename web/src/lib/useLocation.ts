import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isNetworkLocation, LOCATION_REFRESH_MS, resolveCity, type NetworkLocation } from '../../../shared/location'
import { useEnvironment } from './environmentStore'

export function useLocation() {
  const { city: manualCity } = useEnvironment()
  const refresh = useRef(false)
  const query = useQuery<NetworkLocation>({
    queryKey: ['network-location'],
    enabled: !manualCity,
    staleTime: (state) => (state.state.data?.stale ? 60_000 : LOCATION_REFRESH_MS),
    refetchInterval: (state) => (state.state.data?.stale || state.state.error ? 60_000 : LOCATION_REFRESH_MS),
    refetchIntervalInBackground: false,
    retry: false,
    queryFn: async ({ signal }): Promise<NetworkLocation> => {
      const force = refresh.current
      refresh.current = false
      const response = await fetch(`/api/location${force ? '?refresh=1' : ''}`, { signal })
      if (!response.ok) throw new Error('Network location unavailable')
      const value: unknown = await response.json()
      if (!isNetworkLocation(value)) throw new Error('Invalid network location')
      return value
    },
  })
  return {
    ...query,
    city: resolveCity(manualCity, query.data, Date.now()),
    manual: !!manualCity,
    stale:
      query.isError ||
      !!query.data?.stale ||
      (!!query.data && Date.now() - query.data.detectedAt >= LOCATION_REFRESH_MS),
    refresh: () => {
      refresh.current = true
      void query.refetch()
    },
  }
}
