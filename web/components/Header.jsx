import { fmtTime, fmtDate, fmtDay, weatherLabel, round } from '../lib.js'
import { Gear, TipIcon } from './icons.jsx'
import { Updated } from './Updated.jsx'
import { useState } from 'preact/hooks'
import { WeatherIcon } from './WeatherIcon.jsx'

export function Header({ now, weather, hideWeather, location, onSettings }) {
  // ?weather=61 (any WMO code) previews another condition's icon.
  const preview = new URLSearchParams(window.location.search).get('weather')
  const w = weather?.data && preview != null ? { ...weather.data, current: { ...weather.data.current, code: +preview } } : weather?.data
  // The weather face plays its little animation on load, when conditions change, every quarter
  // hour, and when tapped; in between it rests, like the Stubli logo.
  const [taps, setTaps] = useState(0)
  const play = `${w?.current?.code}-${Math.floor(now / 900_000)}-${taps}`
  return (
    <header class="header">
      <div class="clock">
        <div class="time">{fmtTime(now)}</div>
        <div class="date">{fmtDate(now)}</div>
      </div>

      {hideWeather ? null : w ? (
        <>
          <div class="now">
            <div class="now-main">
              <button class="now-icon" aria-label={weatherLabel(w.current.code)} onClick={() => setTaps((t) => t + 1)}><WeatherIcon code={w.current.code} isDay={w.current.isDay} size={84} face play={play} /></button>
              <span class="now-temp">{round(w.current.temp)}°</span>
              <span class="now-cond">
                <span class="now-label">{weatherLabel(w.current.code)}</span>
                <span class="now-hl">H {round(w.daily[0]?.max)}° · L {round(w.daily[0]?.min)}°</span>
              </span>
            </div>
            {/* A warning, or up to two short tips, side by side under the temperature. */}
            {(w.warnings?.[0] || w.advice?.[0]) && (
              <div class="now-tips">
                {w.warnings?.[0]
                  ? <span class="now-advice warn"><TipIcon emoji="⚠️" /> {w.warnings[0].type} warning · level {w.warnings[0].level}</span>
                  : w.advice.slice(0, 2).map((a) => <span class="now-advice" key={a.text}><TipIcon emoji={a.icon} /> {a.text}</span>)}
              </div>
            )}
            <div class="now-facts">
              <span>Sunrise {fmtTime(w.daily[0]?.sunrise)}</span>
              <span>Sunset {fmtTime(w.daily[0]?.sunset)}</span>
              <Updated slot={weather} />
            </div>
          </div>
          <div class="forecast" aria-label="Forecast">
            {w.hourly.slice(0, 6).map((h) => (
              <div class="fc-hour" key={h.t}>
                <span class="fc-label">{fmtTime(h.t)}</span>
                <span class="fc-icon"><WeatherIcon code={h.code} isDay={h.isDay} size={28} /></span>
                <span class="fc-temp">{round(h.temp)}°</span>
              </div>
            ))}
            {w.daily.slice(1).filter((d) => d.max != null).slice(0, 3).map((d) => (
              <div class="fc-day" key={d.t}>
                <span class="fc-label">{fmtDay(d.t)}</span>
                <span class="fc-icon small"><WeatherIcon code={d.code} size={22} /></span>
                <span class="fc-range">{round(d.max)}° <span class="muted">{round(d.min)}°</span></span>
              </div>
            ))}
          </div>
        </>
      ) : (
        !location
          ? <button class="now set-city" onClick={onSettings}>Choose your city in Settings to see the weather ›</button>
          : <div class="now muted">{weather?.error ? 'The weather didn\'t load. Trying again shortly.' : 'Loading weather…'}</div>
      )}

      <button class="icon-btn settings-btn" onClick={onSettings} aria-label="Settings"><Gear /></button>
    </header>
  )
}

// "Before you go" advice and MeteoSwiss warnings, as one full-width row of chips.
export function AdviceStrip({ weather }) {
  const w = weather?.data
  const advice = w?.advice ?? []
  const warnings = w?.warnings ?? []
  // The header already shows a warning or two tips; the strip only holds what's left over.
  const rest = [...warnings.slice(1).map((x) => ({ warn: x })), ...advice.slice(warnings.length ? 0 : 2).map((a) => ({ advice: a }))]
  if (!rest.length) return null
  return (
    <div class="strip" aria-label="Before you go">
      {rest.map((r, i) => r.warn
        ? <span class={`chip warn level-${r.warn.level}`} key={`w${i}`} title={r.warn.text}>⚠ {r.warn.type} · level {r.warn.level}</span>
        : <span class="chip advice" key={r.advice.text}><TipIcon emoji={r.advice.icon} /> {r.advice.text}</span>)}
    </div>
  )
}
