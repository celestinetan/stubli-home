import { useEffect, useState } from 'preact/hooks'

// True once nobody has touched the screen for `ms`; any touch, click or key resets it.
export function useIdle(ms) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (!ms) return
    let t
    const reset = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), ms) }
    const events = ['pointerdown', 'keydown', 'wheel']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true, capture: true }))
    reset()
    return () => { clearTimeout(t); events.forEach((e) => window.removeEventListener(e, reset, { capture: true })) }
  }, [ms])
  return idle
}
