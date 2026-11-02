import { EMOTE_GLYPH, type Emote } from '@/lib/office/mood'

/** 頭上標籤列裡的情緒圖示，與星數／…／! 並排 */
export function EmoteIcon({ emote }: { emote: Emote }) {
  return (
    <span
      className="border-2 border-border bg-card px-1 text-label text-foreground"
      role="img"
      aria-label={`emote ${emote}`}
    >
      {EMOTE_GLYPH[emote]}
    </span>
  )
}
