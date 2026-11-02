import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import type { Vec3 } from '@/lib/office/layout'
import { BUBBLE_MS } from '@/lib/office/speech'

/** line 一變就顯示 BUBBLE_MS 後收起；變成 null（思考空檔）不打斷；初次掛載不冒（進頁面不會全場一起講話）；只能在 Canvas 內用 */
export function useBubble(line: string | null): string | null {
  const [shown, setShown] = useState<string | null>(null)
  const prev = useRef(line)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (prev.current === line) return
    prev.current = line
    if (line === null) return
    if (timer.current !== null) clearTimeout(timer.current)
    setShown(line)
    // frameloop 'demand' 下 Html 要一幀才會定位
    invalidate()
    timer.current = setTimeout(() => {
      timer.current = null
      setShown(null)
      invalidate()
    }, BUBBLE_MS)
  }, [line, invalidate])
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )
  return shown
}

/** 頭上台詞泡泡 */
export function SpeechBubble({ text, position }: { text: string; position: Vec3 }) {
  return (
    <Html position={position} center>
      <span
        role="status"
        className="block w-max max-w-60 border-2 border-border bg-card px-2 py-1 text-body text-foreground shadow-brutal-sm"
      >
        {text}
      </span>
    </Html>
  )
}
