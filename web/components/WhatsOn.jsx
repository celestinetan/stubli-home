import { useState } from 'preact/hooks'
import { isoDay, weekdayOf, store, fmtTime, activeOn } from '../lib.js'
import { Updated } from './Updated.jsx'

const DAY = 86_400_000
const WHEN = [
  { id: 'today', label: 'Today' },
  { id: 'weekend', label: 'Weekend' },
  { id: 'week', label: '7 days' },
]
const WHERE = [
  { id: 'all', label: 'All' },
  { id: 'zurich', label: 'Zürich' },
  { id: 'nearby', label: 'Elsewhere' },
]

function kindIcon(kind) {
  const k = kind.toLowerCase()
  if (k === 'exhibition') return '🏛️'
  if (k === 'art') return '🎨'
  if (/konzert|concert|musik|music|jazz|klassik/.test(k)) return '🎵'
  if (/ausstell|exhibit|museum|kunst|art/.test(k)) return '🖼️'
  if (/theater|theatre|bühne|oper|tanz|dance|comedy/.test(k)) return '🎭'
  if (/film|kino|cinema/.test(k)) return '🎬'
  if (/markt|market|messe/.test(k)) return '🛍️'
  if (/kinder|famil|kids/.test(k)) return '🧸'
  if (/sport/.test(k)) return '⚽'
  if (/party|fest/.test(k)) return '🎉'
  return '✨'
}

function dayLabel(iso, today, tomorrow) {
  if (iso === today) return 'Today'
  if (iso === tomorrow) return 'Tomorrow'
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(`${iso}T12:00:00Z`))
}

// The range for each "when" filter, as local YYYY-MM-DD strings.
function range(when, now) {
  const today = isoDay(now)
  if (when === 'today') return [today, today]
  if (when === 'week') return [today, isoDay(now + 7 * DAY)]
  const wd = weekdayOf(now) // 0 = Sunday
  if (wd === 6 || wd === 0) return [today, isoDay(now + (wd === 6 ? 1 : 0) * DAY)]
  return [isoDay(now + (5 - wd) * DAY), isoDay(now + (7 - wd) * DAY)]
}

export function WhatsOn({ now, events, local, place = '', onOpen, eventSources = false }) {
  const [when, setWhen] = useState(() => store.get('wo-when', 'today'))
  const [where, setWhere] = useState(() => store.get('wo-where', 'all'))
  const pickWhen = (v) => { setWhen(v); store.set('wo-when', v) }
  const pickWhere = (v) => { setWhere(v); store.set('wo-where', v) }

  const data = events?.data
  const [from, to] = range(when, now)
  const today = isoDay(now)
  const tomorrow = isoDay(now + DAY)
  const nowHm = fmtTime(now)
  // Curated free items (e.g. free museum days) join the list as all-day events at the top.
  const curated = (local?.data?.items ?? []).filter((it) => it.free).flatMap((it) => {
    const out = []
    for (let i = 0; i <= 7; i++) {
      const t = now + i * DAY, iso = isoDay(t), wd = weekdayOf(t)
      if (activeOn(it, iso, wd)) out.push({ source: 'Curated', title: it.title, venue: it.place ?? '', city: it.city ?? place, date: iso, time: it.time ?? '', kind: 'Exhibition', url: it.url ?? '', nearby: !!it.city && it.city !== place, free: true, icon: it.icon, teaser: it.note })
    }
    return out
  })
  const all = data?.events ?? []
  const dated = all.filter((e) => e.kind !== 'Exhibition')
  const inPlace = (e) => where === 'all' || (where === 'nearby') === e.nearby
  // Exhibitions run for weeks; they're listed once, below the dated events, closing soonest first.
  const exhibitions = all.filter((e) => e.kind === 'Exhibition' && e.date >= from && inPlace(e)).slice(0, 12)
  const list = [...curated, ...dated].filter((e) =>
    e.date >= from && e.date <= to &&
    inPlace(e) &&
    // Today's events that started more than 3 hours ago are probably over.
    !(e.date === today && e.time && e.time < nowHm && minutesBetween(e.time, nowHm) > 180),
  )
  // An empty "Today" isn't useful on a wall: fall back to the next few upcoming events.
  const fallback = when === 'today' && !list.length
    ? dated.filter((e) => e.date > today && inPlace(e)).slice(0, 8)
    : []
  const shown = (fallback.length ? fallback : list).slice().sort((a, b) => a.date.localeCompare(b.date) || Number(!!b.free) - Number(!!a.free) || (a.time || '00').localeCompare(b.time || '00'))
  const days = [...new Set(shown.map((e) => e.date))]

  return (
    <section class="panel whatson">
      <h2>What's on <Updated slot={events} /></h2>
      <div class="filters">
        <div class="segmented small">{WHEN.map((w) => <button key={w.id} aria-pressed={when === w.id} onClick={() => pickWhen(w.id)}>{w.label}</button>)}</div>
        {eventSources && <div class="segmented small">{WHERE.map((w) => <button key={w.id} aria-pressed={where === w.id} onClick={() => pickWhere(w.id)}>{w.id === 'zurich' ? place || 'Here' : w.label}</button>)}</div>}
      </div>
      <div class="scroll">
        {!data && <p class="muted">{events?.error ? 'Events didn\'t load this time. Trying again shortly.' : 'Loading events…'}</p>}
        {data && !shown.length && !exhibitions.length && <p class="muted">{eventSources ? 'Nothing listed for this filter.' : 'Add your own events, like free museum days, in Settings → What\'s on.'}</p>}
        {fallback.length > 0 && !list.length && <p class="muted small">Nothing listed for today. Coming up:</p>}
        {days.map((d) => (
          <div class="agenda-day" key={d}>
            {(when !== 'today' || fallback.length > 0) && <h3>{dayLabel(d, today, tomorrow)}</h3>}
            <ul>
              {shown.filter((e) => e.date === d).slice(0, when === 'today' ? 20 : 8).map((e) => (
                <li key={`${e.source}${e.url}`}>
                  <button class={`event-item${e.free ? ' free' : ''}`} onClick={() => onOpen(asStory(e, dayLabel(e.date, today, tomorrow)))}>
                    <span class="event-when">{e.time || 'All day'}</span>
                    <span class="event-body">
                      <span class="event-name"><span aria-hidden="true">{e.icon ?? kindIcon(e.kind)}</span> {e.title}{e.free && <span class="free-badge" title="Free entry">🆓</span>}</span>
                      <span class="event-where muted">{[e.venue, e.city !== place && e.city].filter(Boolean).join(' · ')}{e.soldOut ? ' · Sold out' : ''}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {exhibitions.length > 0 && (
          <div class="agenda-day">
            <h3>Exhibitions</h3>
            <ul>
              {exhibitions.map((e) => (
                <li key={e.url}>
                  <button class={`event-item${e.free ? ' free' : ''}`} onClick={() => onOpen(asStory(e, `Until ${untilLabel(e.date)}`))}>
                    <span class="event-when">{untilLabel(e.date)}</span>
                    <span class="event-body">
                      <span class="event-name"><span aria-hidden="true">{kindIcon(e.kind)}</span> {e.title}{e.free && <span class="free-badge" title="Free entry">🆓</span>}</span>
                      <span class="event-where muted">{[e.venue, e.city !== place && e.city].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

// "8 Nov": the last day of an exhibition.
const untilLabel = (iso) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(`${iso}T12:00:00Z`))

// Events open in the same detail panel as news stories.
const asStory = (e, when) => ({
  id: e.url, headline: e.title, ai: false, differences: '', published: Date.now(),
  summary: [e.teaser, [e.kind === 'Exhibition' ? '' : e.kind, [e.venue, e.city].filter(Boolean).join(', '), `${when}${e.time ? ` · ${e.time}` : ''}`].filter(Boolean).join(' · ')].filter(Boolean).join('\n\n'),
  reasons: [e.free && 'Free', e.nearby && 'Nearby'].filter(Boolean),
  sources: e.url ? [{ name: e.source, title: e.title, link: e.url, published: Date.now() }] : [],
})

const minutesBetween = (a, b) => {
  const m = (s) => +s.slice(0, 2) * 60 + +s.slice(3, 5)
  return m(b) - m(a)
}
