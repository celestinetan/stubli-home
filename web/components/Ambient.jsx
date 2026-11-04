import { useEffect, useState } from 'preact/hooks'
import { fmtTime, fmtDate, weatherLabel, round } from '../lib.js'
import { WeatherIcon } from './WeatherIcon.jsx'

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

// The calm screen: time, weather and what's next, large enough to read across the room.
// A touch anywhere brings the full dashboard back.
export function Ambient({ now, weather, calendar, place }) {
  const next = (calendar?.events ?? []).find((e) => e.end > now && !e.allDay)
  const soon = next && next.start - now < 12 * 3600_000
  return (
    <div class="ambient" role="button" aria-label="Show the full dashboard">
      <div class="ambient-time">{fmtTime(now)}</div>
      <div class="ambient-date">{fmtDate(now)}</div>
      {weather?.current && (
        <div class="ambient-weather">
          <WeatherIcon code={weather.current.code} isDay={weather.current.isDay} size={72} face />
          <span class="ambient-temp">{round(weather.current.temp)}°</span>
          <span class="ambient-cond">{weatherLabel(weather.current.code)}{weather.rain ? ` · ${weather.rain.text}` : place ? ` in ${place}` : ''}</span>
        </div>
      )}
      {soon && (
        <div class="ambient-next" style={{ '--cal': next.color }}>
          <span class="ambient-next-label">{next.start <= now ? 'Now' : `Next · ${fmtTime(next.start)}`}</span>
          <span class="ambient-next-title">{next.title}</span>
        </div>
      )}
      <span class="ambient-hint">Touch to see everything</span>
    </div>
  )
}
