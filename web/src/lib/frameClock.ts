/** A fixed drawing budget with real elapsed time, independent of display refresh rate. */
export function createFrameClock(fps = 15) {
  const interval = 1000 / fps
  let deadline = 0
  let previous: number | null = null
  return (time: number): number | null => {
    if (previous !== null && time + 0.01 < deadline) return null
    const delta = previous === null ? 0 : Math.min(0.25, Math.max(0, time - previous) / 1000)
    if (previous === null) deadline = time
    deadline += interval * Math.max(1, Math.floor((time - deadline + 0.01) / interval) + 1)
    previous = time
    return delta
  }
}
