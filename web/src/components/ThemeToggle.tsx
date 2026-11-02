import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { nextThemePref, type ThemePref } from '@/lib/theme'
import { setThemePref, useThemePref } from '@/lib/themeStore'

const META: Record<ThemePref, { icon: typeof Sun; label: string }> = {
  system: { icon: Monitor, label: '跟隨系統' },
  light: { icon: Sun, label: '亮色' },
  dark: { icon: Moon, label: '暗色' },
}

export function ThemeToggle() {
  const pref = useThemePref()
  const { icon: Icon, label } = META[pref]
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => setThemePref(nextThemePref(pref))}
      title={`主題：${label}（點擊切換）`}
      aria-label={`主題：${label}（點擊切換）`}
    >
      <Icon className="size-4" />
    </Button>
  )
}
