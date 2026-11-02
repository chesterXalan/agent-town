import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from 'three'

// 地板 canvas 貼圖（移植概念模型 woodTex／carpetTex／tileTex）：先整張塗底色再畫紋；
// 紋路顏色由底色調亮度而來，不寫色碼；每張貼圖用固定種子亂數，結果穩定

const SEED = 7

/** Park–Miller 亂數，每張貼圖從同一種子開始 */
function seeded(): () => number {
  let s = SEED
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** 底色調亮度（HSL 的 l 加 dl） */
function shade(base: Color, dl: number): string {
  return `#${base.clone().offsetHSL(0, 0, dl).getHexString()}`
}

function canvasTexture(
  size: number,
  draw: (x: CanvasRenderingContext2D, w: number, h: number) => void,
  rx: number,
  ry: number,
): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (ctx) draw(ctx, size, size)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.repeat.set(rx, ry)
  t.anisotropy = 4
  return t
}

/** 木地板：8 排錯縫木板，每塊亮度微調，板縫加深 */
export function woodTexture(color: string, repeatX: number, repeatY: number): CanvasTexture {
  const rnd = seeded()
  const base = new Color(color)
  const seam = shade(base, -0.12)
  return canvasTexture(
    256,
    (x, w, h) => {
      x.fillStyle = color
      x.fillRect(0, 0, w, h)
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 2; j++) {
          x.fillStyle = shade(base, (rnd() - 0.5) * 0.08)
          const off = (i % 2) * 64
          x.fillRect((j * 128 + off) % 256, i * 32, 128, 32)
          if (off && j) x.fillRect(0, i * 32, 64, 32)
        }
        x.fillStyle = seam
        x.fillRect(0, i * 32, w, 2)
        x.fillRect(((i % 2) * 64 + 128) % 256, i * 32, 2, 32)
      }
    },
    repeatX,
    repeatY,
  )
}

/** 地毯：底色上撒亮暗細點，邊緣一圈淡框 */
export function carpetTexture(color: string, repeatX: number, repeatY: number): CanvasTexture {
  const rnd = seeded()
  const base = new Color(color)
  const light = shade(base, 0.04)
  const dark = shade(base, -0.04)
  return canvasTexture(
    128,
    (x, w, h) => {
      x.fillStyle = color
      x.fillRect(0, 0, w, h)
      for (let i = 0; i < 900; i++) {
        x.fillStyle = rnd() > 0.5 ? light : dark
        x.fillRect(rnd() * w, rnd() * h, 2, 2)
      }
      x.strokeStyle = shade(base, -0.05)
      x.lineWidth = 2
      x.strokeRect(0, 0, w, h)
    },
    repeatX,
    repeatY,
  )
}

/** 磁磚：a／b 兩色棋盤，磁磚縫加深 */
export function tileTexture(a: string, b: string, rx: number, ry: number): CanvasTexture {
  const grout = shade(new Color(a), -0.08)
  return canvasTexture(
    128,
    (x, w, h) => {
      x.fillStyle = a
      x.fillRect(0, 0, w, h)
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          x.fillStyle = (i + j) % 2 ? a : b
          x.fillRect(i * 64, j * 64, 64, 64)
        }
      }
      x.strokeStyle = grout
      x.lineWidth = 2
      for (let i = 0; i <= 2; i++) {
        x.beginPath()
        x.moveTo(i * 64, 0)
        x.lineTo(i * 64, h)
        x.stroke()
        x.beginPath()
        x.moveTo(0, i * 64)
        x.lineTo(w, i * 64)
        x.stroke()
      }
    },
    rx,
    ry,
  )
}
