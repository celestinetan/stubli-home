import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { report } from '../lib.js'
import { buildCards } from './News.jsx'

// A slow headline ticker above the bottom bar: weather warnings and rain alerts first, then the
// most important stories. It's the one thing on screen that keeps moving; touching it pauses it
// so a headline can be tapped. It's moved frame by frame rather than by a CSS animation, because
// Safari stops CSS animations when the iPad's Reduce Motion setting is on.

const PX_PER_SECOND = 90

export function Ticker({ news, categories, weather, onOpen }) {
  const [paused, setPaused] = useState(false)
  const timer = useRef(0)
  const track = useRef(null)
  const pausedRef = useRef(false)
  pausedRef.current = paused
  const items = useMemo(() => {
    const w = weather?.data
    const alerts = [
      ...(w?.warnings ?? []).map((x) => ({ key: `w${x.type}`, kind: 'warn', text: `${x.type} warning · level ${x.level}` })),
      ...(w?.rain ? [{ key: 'rain', kind: 'rain', text: w.rain.text }] : []),
    ]
    // Headlines already on the news cards are skipped, so the ticker adds rather than repeats.
    const onCards = new Set(buildCards(news?.data?.stories, categories).flatMap((c) => c.stories.map((x) => x.id)))
    const hard = (news?.data?.stories ?? []).filter((s) => !s.kind || s.kind === 'news' || s.kind === 'analysis')
    const fresh = hard.filter((s) => !onCards.has(s.id))
    // With only a few stories about, the ticker shows them all rather than run nearly empty.
    const stories = (fresh.length >= 4 ? fresh : hard).slice(0, 12)
      .map((s) => ({ key: s.id, kind: 'story', text: s.headline, story: s }))
    return [...alerts, ...stories]
  }, [news, weather, categories])

  useEffect(() => {
    let x = 0, last = 0, raf = 0, moved = 0
    const step = (t) => {
      const el = track.current
      if (el) {
        const dt = last ? Math.min(100, t - last) : 0
        last = t
        if (!pausedRef.current) {
          const half = el.scrollWidth / 2
          x -= (PX_PER_SECOND * dt) / 1000
          if (half && -x >= half) x += half
          el.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`
          moved += dt
        }
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    // If the screen never draws frames, say so in the server log (see /health).
    const check = setTimeout(() => { if (!moved) report(`Ticker not moving (reduce motion: ${matchMedia('(prefers-reduced-motion: reduce)').matches})`) }, 8000)
    return () => { cancelAnimationFrame(raf); clearTimeout(check) }
  }, [])

  if (!items.length) return null
  const list = items.filter((it) => it.story).map((it) => it.story)
  const pause = () => { setPaused(true); clearTimeout(timer.current); timer.current = setTimeout(() => setPaused(false), 6000) }

  // The list is drawn twice so the loop joins up seamlessly.
  const run = (copy) => items.map((it) => (
    <span class={`tick tick-${it.kind}`} key={`${copy}${it.key}`} aria-hidden={copy ? 'true' : undefined}>
      {it.kind === 'warn' && <span aria-hidden="true">⚠ </span>}
      {it.kind === 'rain' && <span aria-hidden="true">☂ </span>}
      {it.story
        ? <button tabIndex={copy ? -1 : 0} onClick={() => onOpen(it.story, list)}>{it.text}</button>
        : it.text}
    </span>
  ))

  return (
    <div class={`ticker${paused ? ' paused' : ''}`} onPointerDown={pause} role="region" aria-label="Headlines">
      <div class="ticker-track" ref={track}>
        {run(0)}{run(1)}
      </div>
    </div>
  )
}
