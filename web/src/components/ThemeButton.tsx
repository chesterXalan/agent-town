import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { nextThemePref } from '@/lib/theme'
import { setThemePref, useThemePref } from '@/lib/themeStore'

export function ThemeButton() {
  const { t } = useTranslation()
  const theme = useThemePref()
  const next = nextThemePref(theme)
  const Icon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon
  const label = t('theme.switch', { current: t(`settings.${theme}`), next: t(`settings.${next}`) })
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={() => setThemePref(next)}>
      <Icon className="size-5" />
    </Button>
  )
}
