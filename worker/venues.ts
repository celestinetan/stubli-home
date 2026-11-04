import config from './config'
import type { EventItem } from './events'

// Optional venues for "What's on": each reads the venue's own public programme, one light request
// an hour, only where its robots.txt allows. None of these is an official feed, so a redesign of a
// venue's website can break one (it then shows as missing, and the others carry on). All in Zürich.
// Turn them on in Settings → What's on. To add a venue: give it an id, a name and a reader here.

const UA = { 'User-Agent': 'Mozilla/5.0 (wall dashboard)' }
const CITY = 'Zürich'

export const decode = (s: string) => s
  .replace(/<\/?br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim()

const localDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(d)
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ue/g, 'u')
const nearby = () => !fold(config.location.name || '').includes(fold(CITY))
const MONTHS = ['januar', 'februar', 'marz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']
const pad = (n: number | string) => String(n).padStart(2, '0')

async function get(url: string) {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

const item = (venue: string, e: Omit<EventItem, 'source' | 'venue' | 'city' | 'nearby'>): EventItem =>
  ({ source: venue, venue, city: CITY, nearby: nearby(), ...e })

export const VENUES: { id: string; name: string; note: string; read: () => Promise<EventItem[]> }[] = [
  { id: 'zentralwaescherei', name: 'Zentralwäscherei', note: 'concerts and performances', read: zentralwaescherei },
  { id: 'kauz', name: 'Kauz', note: 'concerts, jazz and club nights', read: kauz },
  { id: 'friedasbuexe', name: "Frieda's Büxe", note: 'club nights', read: friedasBuexe },
  { id: 'hive', name: 'Hive', note: 'club nights', read: hive },
  { id: 'umbo', name: 'Umbo', note: 'experimental music and club nights', read: umbo },
]

// Zentralwäscherei's own events API (the one its website uses). Their types: Concert, Performance,
// Party, Drag, Panel, Community Event; only concerts and performances count here (plus untyped
// events with "concert" or "live in" in the title). The price is a suggested one; 0 means free.
async function zentralwaescherei(): Promise<EventItem[]> {
  const q = new URLSearchParams({ 'filters[end_datetime][$gt]': new Date().toISOString(), 'pagination[pageSize]': '100', locale: 'en', sort: 'start_datetime:asc', 'populate[0]': 'eventtype_rels' })
  const { data } = await (await get(`https://cms.zentralwaescherei.space/api/events?${q}`)).json() as { data: any[] }
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return (data ?? []).flatMap((e): EventItem[] => {
    const types: string[] = (e.eventtype_rels ?? []).map((t: any) => t.name)
    const kind = types.includes('Concert') || (!types.length && /concert|live in/i.test(e.title)) ? 'Music'
      : types.includes('Performance') ? 'Art' : null
    if (!kind || !e.start_datetime) return []
    const start = new Date(e.start_datetime)
    // Events that already started (a festival, say) show from today.
    const date = localDate(start) < localDate(new Date()) ? localDate(new Date()) : localDate(start)
    const teaser = String(e.description ?? '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_#>]/g, '').split(/\n\s*\n/)[0].trim().slice(0, 240)
    return [item('Zentralwäscherei', { title: e.title, date, time: time.format(start), kind, url: `https://zentralwaescherei.space/en/event/${e.documentId}`, teaser, free: e.price === 0 })]
  })
}

// Kauz: the programme on its home page, grouped under month headings ("November '26").
async function kauz(): Promise<EventItem[]> {
  const html = await (await get('https://www.kauzig.ch/')).text()
  const out: EventItem[] = []
  for (const block of html.split('<h2 class="events-month">').slice(1)) {
    const head = /^([^<]+)<\/h2>/.exec(block)?.[1] ?? ''
    const m = /([A-Za-zäöüÄÖÜ]+)\s*&#039;(\d{2})/.exec(head)
    const month = m ? MONTHS.indexOf(fold(m[1])) + 1 : 0
    if (!month) continue
    for (const ev of block.split('<div class="event">').slice(1)) {
      const day = /class="event-date">\s*\D*(\d{1,2})/.exec(ev)?.[1]
      const h3 = /<h3 class="event-title">([\s\S]*?)<\/h3>/.exec(ev)?.[1] ?? ''
      const title = decode(h3.replace(/<sup>[\s\S]*?<\/sup>/g, '')).replace(/:\s*$/, '')
      if (!day || !title) continue
      const genre = decode(/<sup>([\s\S]*?)<\/sup>/.exec(h3)?.[1] ?? '')
      const artists = [...ev.matchAll(/class="artists">([\s\S]*?)<span class="set-type"/g)].map((a) => decode(a[1])).filter(Boolean)
      out.push(item('Kauz', {
        title, date: `20${m![2]}-${pad(month)}-${pad(day)}`, time: /class="event-time">\s*(\d{1,2}:\d{2})/.exec(ev)?.[1]?.padStart(5, '0') ?? '', kind: 'Music',
        url: /href="([^"]+)"/.exec(h3)?.[1] ?? 'https://www.kauzig.ch/', teaser: [genre, artists.join(', ')].filter(Boolean).join(' · '),
      }))
    }
  }
  return out
}

// Frieda's Büxe: the events list its website loads.
async function friedasBuexe(): Promise<EventItem[]> {
  const data = await (await get('https://friedasbuexe.ch/wp-json/friedas/v1/events')).json() as any[]
  return (data ?? []).filter((e) => e.dateSort && e.title).map((e) => item("Frieda's Büxe", {
    title: decode(e.title), date: e.dateSort, time: /^\d{1,2}:\d{2}/.exec(e.doors ?? '')?.[0]?.padStart(5, '0') ?? '', kind: 'Music', url: e.url ?? 'https://friedasbuexe.ch/',
    teaser: [e.genre, [...(e.wohnzimmer ?? []), ...(e.salon ?? [])].join(', ')].filter(Boolean).join(' · '), soldOut: !!e.soldOut,
  }))
}

// Hive: its programme page ("05. November 2026 um 22:00"). The weekly club yoga is left out.
async function hive(): Promise<EventItem[]> {
  const html = await (await get('https://www.hiveclub.ch/programm/')).text()
  return html.split('<div class="event-wrapper1">').slice(1).flatMap((ev): EventItem[] => {
    const link = /<h2><a href="([^"]+)">([\s\S]*?)<\/a><\/h2>/.exec(ev)
    const when = /(\d{1,2})\. ([A-Za-zäöüÄÖÜ]+) (\d{4}) um (\d{1,2}:\d{2})/.exec(ev)
    const month = when ? MONTHS.indexOf(fold(when[2])) + 1 : 0
    const teaser = decode(/class="event-beschreibung\d*">([\s\S]*?)<\/p>/.exec(ev)?.[1] ?? '')
    if (!link || !when || !month || /yoga/i.test(`${link[2]} ${teaser}`)) return []
    return [item('Hive', { title: decode(link[2]), date: `${when[3]}-${pad(month)}-${pad(when[1])}`, time: when[4].padStart(5, '0'), kind: 'Music', url: link[1], teaser })]
  })
}

// Umbo: the events list its website loads. Times look like "23.H" or "19.30.H".
async function umbo(): Promise<EventItem[]> {
  const data = await (await get('https://umbo.wtf/api/events')).json() as any[]
  return (data ?? []).filter((e) => e.date && e.title).map((e) => {
    const t = /^(\d{1,2})(?:\.(\d{2}))?/.exec(e.time ?? '')
    return item('Umbo', {
      title: e.title, date: e.date, time: t ? `${pad(t[1])}:${t[2] ?? '00'}` : '', kind: 'Music',
      url: `https://umbo.wtf/event.html?id=${encodeURIComponent(e.id)}`, teaser: (e.acts ?? []).map((a: any) => a.name).join(', '),
    })
  })
}
