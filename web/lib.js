// Shared helpers: talking to the proxy, error reporting, formatting, small storage wrapper.
import { DEMO, demoApi } from './demo.js'


// ---------- API ----------

let failures = 0

export async function api(path, opts = {}) {
  if (DEMO) return demoApi(path, opts)
  let res
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...opts,
      headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
  } catch (e) {
    noteFailure()
    throw e
  }
  const type = res.headers.get('content-type') || ''
  if (res.status === 401) {
    const j = await res.json().catch(() => ({}))
    if (j.error === 'not_paired') location.href = '/pair'
    throw new Error('Not signed in')
  }
  // Cloudflare Access answers an expired session with its HTML sign-in page.
  if (!type.includes('json')) {
    noteFailure()
    throw new Error('Unexpected response (sign-in may have expired)')
  }
  const j = await res.json()
  failures = 0
  window.dispatchEvent(new CustomEvent('connection', { detail: true }))
  if (!res.ok) throw Object.assign(new Error(j.error || `Error ${res.status}`), { status: res.status })
  return j
}

function noteFailure() {
  failures++
  if (failures >= 3) window.dispatchEvent(new CustomEvent('connection', { detail: false }))
}

// ---------- error reporting (read back on the server at /health) ----------

const reported = new Map()
let reportedToday = 0

export function report(message) {
  if (DEMO) return
  const msg = String(message).slice(0, 400)
  const last = reported.get(msg)
  if ((last && Date.now() - last < 3600_000) || reportedToday >= 20) return
  reported.set(msg, Date.now())
  reportedToday++
  fetch('/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: msg }) }).catch(() => {})
}

window.addEventListener('error', (e) => report(`${e.message} @ ${e.filename}:${e.lineno}`))
window.addEventListener('unhandledrejection', (e) => report(`Unhandled: ${e.reason?.message || e.reason}`))
setInterval(() => { reportedToday = 0 }, 86400_000)

// ---------- storage (may be unavailable) ----------

export const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v) } catch { return fallback } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}

// ---------- formatting ----------

// Formatters follow the dashboard's time zone (from Settings); setTimezone() rebuilds them.
// Until a city is chosen, the tablet's own time zone.
let TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
let F = {}
function build() {
  const fmt = (opts, locale = 'en-GB') => new Intl.DateTimeFormat(locale, { timeZone: TZ, ...opts })
  F = {
    time: fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    hour: fmt({ hour: '2-digit', hourCycle: 'h23' }),
    date: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
    day: fmt({ weekday: 'short' }),
    dayLong: fmt({ weekday: 'long', day: 'numeric', month: 'short' }),
    ymd: fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }),
    iso: fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA'),
    wd: fmt({ weekday: 'short' }, 'en-US'),
  }
}
build()
export function setTimezone(tz) {
  if (!tz || tz === TZ) return false
  try { new Intl.DateTimeFormat('en', { timeZone: tz }) } catch { return false }
  TZ = tz
  build()
  return true
}
export const timezone = () => TZ

export const fmtTime = (t) => F.time.format(t)
export const fmtHour = (t) => F.hour.format(t)
export const fmtDate = (t) => F.date.format(t)
export const fmtDay = (t) => F.day.format(t)
export const fmtDayLong = (t) => F.dayLong.format(t)
export const dayKey = (t) => F.ymd.format(t)
export const isoDay = (t) => F.iso.format(t) // YYYY-MM-DD in the dashboard's time zone
export const weekdayOf = (t) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(F.wd.format(t))

export function ago(t, now = Date.now()) {
  const m = Math.round((now - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

// Minutes since local midnight in the dashboard's time zone, and parsing "HH:MM".
export function minutesNow(t = Date.now()) {
  const [h, m] = F.time.format(t).split(':').map(Number)
  return h * 60 + m
}
export const toMinutes = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
export function inWindow(now, start, end) {
  return start <= end ? now >= start && now < end : now >= start || now < end
}

// ---------- weather codes (WMO) ----------

export function weatherIcon(code, isDay = true) {
  if (code === 0) return isDay ? '☀️' : '🌙'
  if (code === 1) return isDay ? '🌤️' : '🌙'
  if (code === 2) return '⛅'
  if (code === 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 51 && code <= 57) return '🌦️'
  if (code >= 61 && code <= 67) return '🌧️'
  if (code >= 71 && code <= 77) return '🌨️'
  if (code >= 80 && code <= 82) return '🌦️'
  if (code === 85 || code === 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '·'
}

export function weatherLabel(code) {
  if (code === 0) return 'Clear'
  if (code === 1) return 'Mostly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Showers'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code >= 95) return 'Thunderstorm'
  return ''
}

export const round = (n) => (n == null ? '–' : Math.round(n))
