import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TownSnapshot } from '../../../shared/api'

export function useTown(demo: boolean) {
  const client = useQueryClient()
  const [connected, setConnected] = useState(false)
  const query = useQuery({
    queryKey: ['town'],
    enabled: !demo,
    staleTime: Infinity,
    retry: 1,
    queryFn: async (): Promise<TownSnapshot> => {
      const response = await fetch('/api/town')
      if (!response.ok) throw new Error('Unable to read local session state')
      return response.json() as Promise<TownSnapshot>
    },
  })
  useEffect(() => {
    if (demo) return
    const events = new EventSource('/api/events')
    events.onopen = () => setConnected(true)
    events.onerror = () => setConnected(false)
    events.addEventListener('town', (event: MessageEvent<string>) => {
      client.setQueryData(['town'], JSON.parse(event.data) as TownSnapshot)
    })
    return () => {
      events.close()
      setConnected(false)
    }
  }, [client, demo])
  return { ...query, connected }
}
