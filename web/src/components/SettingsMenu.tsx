import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { FRAME_RATES, DEFAULT_FRAME_RATE, type FrameRate } from '@/lib/frameRate'
import { setFrameRate, useFrameRate } from '@/lib/frameRateStore'
import { Popover } from 'radix-ui'
import { Settings, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setLanguagePreference, useLanguagePreference } from '@/i18n'
import type { LanguagePreference } from '@/i18n/language'
import { setThemePref, useThemePref } from '@/lib/themeStore'
import type { ThemePref } from '@/lib/theme'

export function SettingsMenu({
  demo,
  sourceLabel,
  onToggleDemo,
}: {
  demo: boolean
  sourceLabel: string
  onToggleDemo(): void
}) {
  const { t } = useTranslation()
  const language = useLanguagePreference()
  const theme = useThemePref()
  const fps = useFrameRate()
  const titleId = useId()
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('settings.title')} title={t('settings.title')}>
          <Settings className="size-5" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="town-settings border-2 border-border bg-card p-4 text-foreground shadow-brutal"
          aria-labelledby={titleId}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-title">
              {t('settings.title')}
            </h2>
            <Popover.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t('settings.close')}>
                <X className="size-4" />
              </Button>
            </Popover.Close>
          </div>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-ui">
              {t('settings.language')}
              <select
                className="town-select"
                value={language}
                onChange={(event) => setLanguagePreference(event.target.value as LanguagePreference)}
              >
                <option value="system">{t('settings.system')}</option>
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-ui">
              {t('settings.theme')}
              <select
                className="town-select"
                value={theme}
                onChange={(event) => setThemePref(event.target.value as ThemePref)}
              >
                <option value="system">{t('settings.system')}</option>
                <option value="light">{t('settings.light')}</option>
                <option value="dark">{t('settings.dark')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-ui">
              {t('settings.frameRate')}
              <select
                className="town-select"
                aria-label={t('settings.frameRate')}
                value={fps}
                onChange={(event) => setFrameRate(Number(event.target.value) as FrameRate)}
              >
                {FRAME_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate === DEFAULT_FRAME_RATE ? t('settings.recommendedFps', { fps: rate }) : `${rate} FPS`}
                  </option>
                ))}
              </select>
              <span className="text-body text-muted-foreground">{t('settings.frameRateHelp')}</span>
            </label>
            <hr className="border-t-2 border-border" />
            <div>
              <p className="mb-2 text-label text-muted-foreground">{t('settings.source')}</p>
              <p role="status" className="text-body">
                {sourceLabel}
              </p>
            </div>
            <Popover.Close asChild>
              <Button variant={demo ? 'default' : 'outline'} onClick={onToggleDemo}>
                {t(demo ? 'demo.live' : 'demo.visit')}
              </Button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
