import config from './config'
import { fetchText, type Env } from './store'

// Minimal iCalendar reader for Proton "Share via link" feeds: single events, all-day events,
// recurring events (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY,
// BYMONTH), EXDATE and edited occurrences (RECURRENCE-ID).

const DAY = 86_400_000

interface Prop { value: string; params: Record<string, string> }
type VEvent = Record<string, Prop[]>

export interface CalEvent {
  calendar: string
  color: string
  title: string
  location: string
  start: number
  end: number
  allDay: boolean
}

export async function fetchCalendar(env: Env) {
  // Calendars added in Settings (KV) win over the CALENDAR_FEEDS secret.
  const raw = (await env.KV.get('secret:calendars')) ?? env.CALENDAR_FEEDS
  if (!raw) return { configured: false, calendars: [], events: [] as CalEvent[] }
  const feeds = JSON.parse(raw) as { name: string; url: string; color?: string }[]
  const visible = feeds.filter((f) => !config.calendar.hidden.includes(f.name))

  const results = await Promise.allSettled(visible.map((f) => fetchText(feedUrl(f.url))))
  const calendars: { name: string; color: string; error?: string }[] = []
  const events: CalEvent[] = []
  results.forEach((r, i) => {
    const f = visible[i]
    const color = f.color ?? config.calendar.colors[i % config.calendar.colors.length]
    if (r.status === 'rejected') {
      calendars.push({ name: f.name, color, error: String(r.reason?.message ?? r.reason) })
      return
    }
    calendars.push({ name: f.name, color })
    events.push(...expand(parseEvents(r.value), f.name, color))
  })
  if (visible.length && calendars.every((c) => c.error)) {
    throw new Error(`All calendar feeds failed: ${calendars.map((c) => `${c.name}: ${c.error}`).join('; ')}`)
  }
  events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start)
  return { configured: true, calendars, events }
}

// Accepts a full link, or a Proton link pasted without its start ("<id>/calendar.ics?CacheKey=…").
export function feedUrl(raw: string) {
  const u = raw.trim().replace(/^webcals?:\/\//i, 'https://')
  if (/^https?:\/\//i.test(u)) return u
  if (u.includes('calendar.ics')) return `https://calendar.proton.me/api/calendar/v1/url/${u.replace(/^\/+/, '')}`
  throw new Error('Not a calendar link')
}

// ---------- parsing ----------

function parseEvents(ics: string): VEvent[] {
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const out: VEvent[] = []
  let cur: VEvent | null = null
  let nested = 0
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; nested = 0; continue }
    if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; continue }
    if (!cur) continue
    if (line.startsWith('BEGIN:')) { nested++; continue } // e.g. VALARM
    if (line.startsWith('END:')) { nested--; continue }
    if (nested > 0) continue
    const m = /^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(line)
    if (!m) continue
    const params: Record<string, string> = {}
    for (const p of m[2].split(';').slice(1)) {
      const [k, v = ''] = p.split('=')
      params[k.toUpperCase()] = v.replace(/^"|"$/g, '')
    }
    ;(cur[m[1].toUpperCase()] ??= []).push({ value: m[3], params })
  }
  return out
}

const text = (e: VEvent, k: string) =>
  (e[k]?.[0]?.value ?? '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()

// ---------- time zones ----------

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string) {
  let f = formatters.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      })
    } catch {
      f = formatter(config.timezone)
    }
    formatters.set(tz, f)
  }
  return f
}

function tzOffset(t: number, tz: string) {
  const p: Record<string, number> = {}
  for (const part of formatter(tz).formatToParts(new Date(t))) p[part.type] = Number(part.value)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return asUtc - Math.floor(t / 1000) * 1000
}

function toUtc(day: number, secs: number, tz: string) {
  const wall = day * DAY + secs * 1000
  if (tz === 'UTC') return wall
  const off = tzOffset(wall, tz)
  const off2 = tzOffset(wall - off, tz)
  return wall - off2
}

interface DT { day: number; secs: number; tz: string; allDay: boolean }

function parseDT(p: Prop): DT | null {
  const v = p.value.trim()
  const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)(Z?))?$/.exec(v)
  if (!m) return null
  const day = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY)
  if (!m[4]) return { day, secs: 0, tz: config.timezone, allDay: true }
  return { day, secs: +m[4] * 3600 + +m[5] * 60 + +m[6], tz: m[7] ? 'UTC' : p.params.TZID || config.timezone, allDay: false }
}

const dtUtc = (d: DT) => toUtc(d.day, d.secs, d.tz)

function parseDuration(v: string) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v)
  if (!m) return 0
  const s = (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 86400 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)
  return (m[1] === '-' ? -s : s) * 1000
}

// ---------- recurrence ----------

const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const weekday = (day: number) => (((day + 4) % 7) + 7) % 7 // 0 = Sunday
const ymd = (day: number) => {
  const d = new Date(day * DAY)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
}
const dayOf = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY)
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

function monthDays(y: number, m: number, rule: Record<string, string>, startDom: number) {
  const n = daysInMonth(y, m)
  const out: number[] = []
  if (rule.BYDAY) {
    for (const tok of rule.BYDAY.split(',')) {
      const t = /^([+-]?\d+)?([A-Z]{2})$/.exec(tok)
      if (!t) continue
      const wd = WD.indexOf(t[2])
      const all: number[] = []
      for (let d = 1; d <= n; d++) if (weekday(dayOf(y, m, d)) === wd) all.push(d)
      const ord = t[1] ? +t[1] : 0
      if (!ord) out.push(...all)
      else { const pick = ord > 0 ? all[ord - 1] : all[all.length + ord]; if (pick) out.push(pick) }
    }
  } else if (rule.BYMONTHDAY) {
    for (const s of rule.BYMONTHDAY.split(',')) {
      const v = +s
      const d = v > 0 ? v : n + v + 1
      if (d >= 1 && d <= n) out.push(d)
    }
  } else if (startDom <= n) out.push(startDom)
  return [...new Set(out)].sort((a, b) => a - b).map((d) => dayOf(y, m, d))
}

function* candidateDays(rule: Record<string, string>, start: number): Generator<number> {
  const interval = Math.max(1, +(rule.INTERVAL ?? 1))
  const byday = rule.BYDAY ? rule.BYDAY.split(',').map((s) => WD.indexOf(s.slice(-2))) : null
  const s = ymd(start)
  switch (rule.FREQ) {
    case 'DAILY':
      for (let d = start; ; d += interval) if (!byday || byday.includes(weekday(d))) yield d
    case 'WEEKLY': {
      const monday = start - ((weekday(start) + 6) % 7)
      const offsets = (byday ?? [weekday(start)]).map((w) => (w + 6) % 7).sort((a, b) => a - b)
      for (let w = monday; ; w += 7 * interval) for (const o of offsets) if (w + o >= start) yield w + o
    }
    case 'MONTHLY':
      for (let k = 0; ; k += interval) {
        const mi = s.m - 1 + k
        for (const d of monthDays(s.y + Math.floor(mi / 12), (mi % 12) + 1, rule, s.d)) if (d >= start) yield d
      }
    case 'YEARLY': {
      const months = rule.BYMONTH ? rule.BYMONTH.split(',').map(Number).sort((a, b) => a - b) : [s.m]
      const yrRule = rule.BYDAY || rule.BYMONTHDAY ? rule : {}
      for (let k = 0; ; k += interval)
        for (const m of months) for (const d of monthDays(s.y + k, m, yrRule, s.d)) if (d >= start) yield d
    }
  }
}

// ---------- expansion into the display window ----------

function expand(vevents: VEvent[], calendar: string, color: string): CalEvent[] {
  const now = Date.now()
  const today = Math.floor((now + tzOffset(now, config.timezone)) / DAY)
  const winStart = toUtc(today, 0, config.timezone)
  const winEnd = toUtc(today + config.calendar.daysAhead, 0, config.timezone)
  const lastDay = today + config.calendar.daysAhead + 1

  const overridden = new Set<string>()
  for (const e of vevents) {
    const rid = e['RECURRENCE-ID']?.[0] && parseDT(e['RECURRENCE-ID'][0])
    if (rid) overridden.add(`${text(e, 'UID')}|${dtUtc(rid)}`)
  }

  const out: CalEvent[] = []
  for (const e of vevents) {
    if (text(e, 'STATUS').toUpperCase() === 'CANCELLED' || !e.DTSTART) continue
    const start = parseDT(e.DTSTART[0])
    if (!start) continue
    const startUtc = dtUtc(start)
    const end = e.DTEND && parseDT(e.DTEND[0])
    const durMs = end ? dtUtc(end) - startUtc : e.DURATION ? parseDuration(e.DURATION[0].value) : start.allDay ? DAY : 0
    const durDays = start.allDay ? Math.max(1, Math.round(durMs / DAY)) : 0
    const base = { calendar, color, title: text(e, 'SUMMARY') || '(No title)', location: text(e, 'LOCATION'), allDay: start.allDay }

    const push = (day: number) => {
      const s = start.allDay ? toUtc(day, 0, config.timezone) : toUtc(day, start.secs, start.tz)
      const en = start.allDay ? toUtc(day + durDays, 0, config.timezone) : s + durMs
      if (s < winEnd && Math.max(en, s + 1) > winStart) out.push({ ...base, start: s, end: en })
    }

    const rrule = e.RRULE?.[0]?.value
    if (!rrule || e['RECURRENCE-ID']) { push(start.day); continue }

    const rule = Object.fromEntries(rrule.split(';').map((kv) => kv.split('=') as [string, string]))
    const count = rule.COUNT ? +rule.COUNT : Infinity
    const untilDt = rule.UNTIL ? parseDT({ value: rule.UNTIL, params: { TZID: start.tz } }) : null
    const until = untilDt ? dtUtc(untilDt) + (untilDt.allDay ? DAY - 1 : 0) : Infinity
    const exdates = new Set<number>()
    for (const p of e.EXDATE ?? [])
      for (const v of p.value.split(',')) { const d = parseDT({ value: v, params: p.params }); if (d) exdates.add(dtUtc(d)) }
    const uid = text(e, 'UID')

    let n = 0
    let guard = 0
    for (const day of candidateDays(rule, start.day)) {
      if (++guard > 20000 || day > lastDay || ++n > count) break
      if (day < today - 31) continue // well before the window; skip the costly time-zone maths
      const occ = toUtc(day, start.secs, start.tz)
      if (occ > until) break
      if (exdates.has(occ) || overridden.has(`${uid}|${occ}`)) continue
      push(day)
    }
  }
  return out
}
