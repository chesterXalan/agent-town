import type { TFunction } from 'i18next'
import { SPEECH_KEYS } from './speech-keys'

/** Translate at render time so a language change does not restart the life simulation. */
export function localizeSpeech(line: string, t: TFunction): string {
  const key = SPEECH_KEYS[line]
  if (key) return t(key)
  const read = /^看一下 (.+)$/.exec(line)
  if (read) return t('speech.readFile', { name: read[1] })
  const edit = /^改 (.+)$/.exec(line)
  if (edit) return t('speech.editFile', { name: edit[1] })
  return line
}
