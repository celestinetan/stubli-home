import config from './config'
import { logError, type Env } from './store'

// "What's on": music, art and exhibitions in and around Zürich, from optional sources:
// - Kultur Züri (kulturzueri.ch) has no public API; this reads the same listing pages its website
//   loads (unofficial, could change). Only paths its robots.txt allows, and only the first page of
//   each list: about nine light requests an hour.
// - Zentralwäscherei (zentralwaescherei.space), a Zürich cultural venue: its website's public
//   events API, one request an hour. Concerts and performances only.
// Dates and times are kept as local strings ("2026-11-06", "20:00").

export interface EventItem {
  source: 'Kultur Züri' | 'Zentralwäscherei'
  title: string
  venue: string
  city: string
  date: string // YYYY-MM-DD, local. For exhibitions: the day it ends.
  time: string // HH:MM, local ('' if all day)
  kind: 'Music' | 'Art' | 'Exhibition'
  url: string
  image?: string
  teaser?: string
  nearby: boolean // outside the home city
  free?: boolean
}

const BASE = 'https://kulturzueri.ch'
// Kultur Züri's own filter ids: Musik (all genres); Führungen in Kunst, Design, Fotografie, Architektur.
const MUSIC = '178755'
const ART_TOURS = '345406:37556,345420,345421,345422'

const localDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(d)
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ue/g, 'u')
const isHome = (city: string) => !!city && fold(city).includes(fold(config.location.name))

export async function fetchEvents(env: Env) {
  const kz = config.events.kulturZueri, zw = config.events.zentralwaescherei
  if (!kz && !zw) return { events: [], sources: [] }
  const kinds = config.events.kinds
  const days = Array.from({ length: config.events.daysAhead }, (_, i) => localDate(new Date(Date.now() + i * 86400_000)))
  const last = days[days.length - 1]
  const jobs: { source: EventItem['source']; name: string; run: Promise<EventItem[]> }[] = []
  // Music fills a page within a day or two, so it's fetched day by day; the others fit in one page.
  if (kz && kinds.music) days.forEach((d) => jobs.push({ source: 'Kultur Züri', name: `Music ${d}`, run: list('/veranstaltungen/', `what=${MUSIC}&when=${d}`, 'Music').then((x) => x.filter((e) => e.date === d)) }))
  if (kz && kinds.art) jobs.push({ source: 'Kultur Züri', name: 'Art', run: list('/veranstaltungen/', `what=${ART_TOURS}&when=${days[0]}`, 'Art').then((x) => x.filter((e) => e.date <= last)) })
  if (kz && kinds.exhibitions) jobs.push({ source: 'Kultur Züri', name: 'Exhibitions', run: list('/ausstellungen/', '', 'Exhibition') })
  if (zw) jobs.push({ source: 'Zentralwäscherei', name: 'events', run: zentralwaescherei().then((x) => x.filter((e) => e.date <= last && (e.kind === 'Music' ? kinds.music : kinds.art))) })

  const results = await Promise.allSettled(jobs.map((j) => j.run))
  const events: EventItem[] = []
  const failed: typeof jobs = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') events.push(...r.value)
    else { failed.push(jobs[i]); logError(env, 'server', `${jobs[i].source} ${jobs[i].name}: ${r.reason?.message ?? r.reason}`) }
  })
  if (jobs.length && failed.length === jobs.length) throw new Error('Event sources unavailable')

  const seen = new Set<string>()
  const unique = events.filter((e) => {
    // Same link, or the same title at the same place and time (venues sometimes list a tour twice).
    // Kultur Züri may also list a Zentralwäscherei concert, so the same title on the same day counts too.
    const keys = [`${e.kind === 'Exhibition' ? '' : e.date}|${e.url}`, `${e.date}|${e.time}|${e.venue}|${e.title}`.toLowerCase(), `${e.date}|${fold(e.title)}`]
    if (keys.some((k) => seen.has(k))) return false
    keys.forEach((k) => seen.add(k))
    return true
  })
  unique.sort((a, b) => a.date.localeCompare(b.date) || Number(!!b.free) - Number(!!a.free) || (a.time || '99').localeCompare(b.time || '99'))
  const sources = [...new Set(jobs.map((j) => j.source))].map((name) => {
    const missing = failed.filter((j) => j.source === name).map((j) => j.name)
    return { name, ok: !missing.length, ...(missing.length ? { error: `Missing: ${missing.join(', ')}` } : {}) }
  })
  return { events: unique, sources }
}

// Zentralwäscherei's own events API (the one its website uses). Their types: Concert, Performance,
// Party, Drag, Panel, Community Event; only concerts and performances count here (plus untyped
// events with "concert" or "live in" in the title). The price is a suggested one; 0 means free.
async function zentralwaescherei(): Promise<EventItem[]> {
  const q = new URLSearchParams({ 'filters[end_datetime][$gt]': new Date().toISOString(), 'pagination[pageSize]': '100', locale: 'en', sort: 'start_datetime:asc', 'populate[0]': 'eventtype_rels' })
  const res = await fetch(`https://cms.zentralwaescherei.space/api/events?${q}`, { headers: { 'User-Agent': 'Mozilla/5.0 (wall dashboard)' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { data } = await res.json() as { data: any[] }
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return (data ?? []).flatMap((e): EventItem[] => {
    const types: string[] = (e.eventtype_rels ?? []).map((t: any) => t.name)
    const kind = types.includes('Concert') || (!types.length && /concert|live in/i.test(e.title)) ? 'Music'
      : types.includes('Performance') ? 'Art' : null
    if (!kind || !e.start_datetime) return []
    const start = new Date(e.start_datetime)
    // Today's events that already started still show; they run into the evening.
    const date = localDate(start) < localDate(new Date()) ? localDate(new Date()) : localDate(start)
    const teaser = String(e.description ?? '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_#>]/g, '').split(/\n\s*\n/)[0].trim().slice(0, 240)
    return [{
      source: 'Zentralwäscherei', title: e.title, venue: 'Zentralwäscherei', city: 'Zürich', date, time: time.format(start), kind,
      url: `https://zentralwaescherei.space/en/event/${e.documentId}`, teaser, nearby: !isHome('Zürich'), free: e.price === 0,
    }]
  })
}

async function list(path: string, query: string, kind: EventItem['kind']): Promise<EventItem[]> {
  // The site returns just the list when asked the way its own script asks (POST + X-Requested-With).
  const res = await fetch(`${BASE}${path}${query ? `?${query}` : ''}`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (wall dashboard)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  return html.split('class="cp-teaser-box-item-kz"').slice(1).map((it) => parseItem(it, kind)).filter((e): e is EventItem => !!e)
}

const decode = (s: string) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim()
const pick = (s: string, re: RegExp) => decode(re.exec(s)?.[1] ?? '')

function parseItem(it: string, kind: EventItem['kind']): EventItem | null {
  const href = /href="(\/db\/veranstaltungen\/[^"]+)"/.exec(it)?.[1]
  const title = pick(it, /<h3>([\s\S]*?)<\/h3>/)
  const dm = /class="date">[^<]*?(\d{2})\.(\d{2})\.(\d{4})/.exec(it)
  if (!href || !title || !dm) return null
  const box = /teaser-text-container">([\s\S]*?)<\/div>/.exec(it)?.[1] ?? ''
  const paras = [...box.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/g)]
  // The description comes before the date line, the town after it.
  const dateAt = paras.findIndex((p) => /class="date"/.test(p[1]))
  const plain = (from: number, to: number) => paras.slice(from, to).filter((p) => !/class=/.test(p[1])).map((p) => decode(p[2]))
  const teaser = plain(0, dateAt)[0] ?? ''
  const city = plain(dateAt + 1, paras.length).pop() ?? ''
  const time = /class="time">[\s\S]*?(\d{1,2}):(\d{2})/.exec(it)
  const img = /<img src="([^"]+)"/.exec(it)?.[1]
  return {
    source: 'Kultur Züri',
    title,
    venue: pick(it, /class="organiser">([\s\S]*?)<\/p>/),
    city,
    date: `${dm[3]}-${dm[2]}-${dm[1]}`,
    time: time ? `${time[1].padStart(2, '0')}:${time[2]}` : '',
    kind,
    url: `${BASE}${href}`,
    ...(img ? { image: img.startsWith('http') ? img : `${BASE}${img}` } : {}),
    ...(teaser ? { teaser: teaser.slice(0, 280) } : {}),
    nearby: !!city && !isHome(city),
    free: /eintritt frei|freier eintritt|gratis|kostenlos|free entry/i.test(`${title} ${teaser}`),
  }
}
