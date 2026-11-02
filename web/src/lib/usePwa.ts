import { useRegisterSW } from 'virtual:pwa-register/react'

export function usePwa() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  return { needRefresh, updateServiceWorker }
}
