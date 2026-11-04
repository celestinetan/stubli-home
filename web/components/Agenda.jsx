import { fmtTime, fmtDay, isoDay, weekdayOf, activeOn } from '../lib.js'
import { Updated } from './Updated.jsx'

const DAY = 86_400_000
const MIN = 60_000

// Your day, in one visual language: a short line for what the timeline can't show (rain, a
// holiday), today's all-day items as pills, the rest of today as a timeline from now (events as
// blocks tinted in their calendar's colour, free time as space), then tomorrow in the same style.
// Only two days, so each event has room for its time, length and place.
export function Agenda({ now, calendar, local, weather, place = '', extra }) {
  const c = calendar?.data
  const today = isoDay(now)
  const items = local?.data?.items ?? []
  // Holidays, markets and your own non-free items; free ones are listed in What's on.
  const localOn = (iso, wd) => items.filter((it) => !it.free && activeOn(it, iso, wd))

  let body
  if (!c) body = <p class="muted">{calendar?.error ? 'Your calendar didn\'t load. Check the link in Settings, or wait a moment.' : 'Loading calendar…'}</p>
  else if (!c.configured) body = <p class="muted">No calendars yet. Add one in Settings → Calendars &amp; keys: any iCal link from Proton, Google, iCloud or Outlook.</p>
  else {
    const upcoming = c.events.filter((e) => e.end > now)
    // Events on a day, including all-day and multi-day ones that started earlier.
    const on = (key) => upcoming.filter((e) => isoDay(e.start) === key || (isoDay(e.start) < key && isoDay(e.end - 1) >= key))
    const todays = on(today)
    const timed = todays.filter((e) => !e.allDay)
    const pills = [...todays.filter((e) => e.allDay).map((e) => ({ key: e.title, title: e.title, color: e.color })),
      ...localOn(today, weekdayOf(now)).map((it) => ({ key: it.title, title: it.title, note: [it.time, it.place].filter(Boolean).join(' · ') }))]
    const tmr = isoDay(now + DAY)
    const tmrEvents = on(tmr)
    const tmrPills = [...tmrEvents.filter((e) => e.allDay).map((e) => ({ key: e.title, title: e.title, color: e.color })),
      ...localOn(tmr, weekdayOf(now + DAY)).map((it) => ({ key: it.title, title: it.title, note: [it.time, it.place].filter(Boolean).join(' · ') }))]
    body = (
      <>
        <div class="scroll tl-scroll">
          <Pills items={pills} />
          <Timeline now={now} events={timed} />
          <h3 class="tl-day">Tomorrow <span class="muted">· {fmtDay(now + DAY)}</span></h3>
          <Pills items={tmrPills} />
          <Tomorrow events={tmrEvents.filter((e) => !e.allDay)} />
        </div>
        {c.calendars.filter((x) => x.error).map((x) => (
          <p class="muted small" key={x.name}>⚠ {x.name} couldn't be loaded</p>
        ))}
      </>
    )
  }

  return (
    <section class="panel agenda">
      <h2>Your day <Updated slot={calendar} /></h2>
      <div class="agenda-body">
        <TodayLine weather={weather?.data} />
        {body}
      </div>
      {extra}
    </section>
  )
}

// Only what the timeline can't show: rain to come, or showers later.
function TodayLine({ weather }) {
  const text = weather?.rain?.text ?? (weather?.daily?.[0]?.pop >= 50 ? 'Showers likely later' : null)
  return text ? <p class="today-line">{text}</p> : null
}

const hm = (ms) => {
  const m = Math.round(ms / MIN)
  return m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`
}

// The rest of today, from now: a rail of times, a green "now" mark at the top, events as tinted
// blocks (taller when longer), and free stretches of an hour or more shown as "Free until …".
// The next event is the first block, larger: there's no separate "next up" card.
function Timeline({ now, events }) {
  const rows = []
  let cursor = now
  events.forEach((e, i) => {
    const gap = e.start - cursor
    if (gap >= 60 * MIN) rows.push({ kind: 'free', key: `f${i}`, from: cursor, to: e.start })
    rows.push({ kind: 'event', key: `${e.calendar}${e.start}${e.title}`, e, first: i === 0 })
    cursor = Math.max(cursor, e.end)
  })
  const endOfDay = new Date(now).setHours(23, 59, 0, 0)
  const freeEvening = endOfDay - cursor >= 60 * MIN

  return (
    <ol class="timeline" aria-label="Today">
      <li class="tl-row tl-now">
        <span class="tl-time">{fmtTime(now)}</span>
        <span class="tl-rail"><i /></span>
        <span class="tl-now-label">Now</span>
      </li>
      {rows.map((r) => r.kind === 'free' ? (
        <li class="tl-row tl-free" key={r.key}>
          <span class="tl-time" />
          <span class="tl-rail" />
          <span class="tl-free-label">Free for {hm(r.to - r.from)}</span>
        </li>
      ) : <EventRow key={r.key} e={r.e} now={now} first={r.first} />)}
      {freeEvening && (
        <li class="tl-row tl-free tl-end">
          <span class="tl-time" />
          <span class="tl-rail" />
          <span class="tl-free-label">{events.length ? `Free from ${fmtTime(cursor)}` : 'Nothing else today'}</span>
        </li>
      )}
    </ol>
  )
}

function EventRow({ e, now, first }) {
  const live = e.start <= now
  const mins = Math.round((e.start - now) / MIN)
  const when = live ? `Now · until ${fmtTime(e.end)}` : mins <= 90 ? `In ${hm(e.start - now)} · until ${fmtTime(e.end)}` : `Until ${fmtTime(e.end)}`
  // Longer events stand taller, up to a limit, so the day's shape shows at a glance.
  const size = Math.min(3, Math.max(0, (e.end - e.start) / (60 * MIN) - 0.5))
  return (
    <li class={`tl-row tl-event ${first ? 'next' : ''} ${live ? 'live' : ''} ${mins <= 15 && !live ? 'soon' : ''}`} style={{ '--cal': e.color, '--size': size }}>
      <span class="tl-time">{live ? 'Now' : fmtTime(e.start)}</span>
      <span class="tl-rail"><i /></span>
      <span class="tl-block">
        <span class="tl-title">{e.title}</span>
        <span class="tl-meta">{when}{e.location ? ` · ${e.location}` : ''}</span>
      </span>
    </li>
  )
}

function Pills({ items }) {
  if (!items.length) return null
  return (
    <ul class="pills" aria-label="All day">
      {items.map((p) => <li class="pill" key={p.key} style={p.color ? { '--cal': p.color } : null}>{p.title}{p.note && <span class="muted"> · {p.note}</span>}</li>)}
    </ul>
  )
}

// Tomorrow: the same blocks as today, with start time, end and place; no Now mark.
function Tomorrow({ events }) {
  if (!events.length) return <p class="tl-empty">Nothing planned yet</p>
  return (
    <ol class="timeline" aria-label="Tomorrow">
      {events.map((e) => {
        const size = Math.min(3, Math.max(0, (e.end - e.start) / (60 * MIN) - 0.5))
        return (
          <li class="tl-row tl-event" key={`${e.calendar}${e.start}${e.title}`} style={{ '--cal': e.color, '--size': size }}>
            <span class="tl-time">{fmtTime(e.start)}</span>
            <span class="tl-rail"><i /></span>
            <span class="tl-block">
              <span class="tl-title">{e.title}</span>
              <span class="tl-meta">Until {fmtTime(e.end)} · {hm(e.end - e.start)}{e.location ? ` · ${e.location}` : ''}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
