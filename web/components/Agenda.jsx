import { fmtTime, fmtDayLong, fmtDay, dayKey, isoDay, weekdayOf, activeOn } from '../lib.js'
import { Updated } from './Updated.jsx'

const DAY = 86_400_000

// Your day: next up, today's events, the next 3 days at a glance, and local holidays.
export function Agenda({ now, calendar, local, place = '', extra }) {
  const c = calendar?.data
  const today = isoDay(now)

  let yourDay
  if (!c) yourDay = <p class="muted">{calendar?.error ? 'Your calendar didn\'t load. Check the link in Settings, or wait a moment.' : 'Loading calendar…'}</p>
  else if (!c.configured) yourDay = <p class="muted">No calendars yet. Add one in Settings → Calendars &amp; keys: any iCal link from Proton, Google, iCloud or Outlook.</p>
  else {
    const upcoming = c.events.filter((e) => e.end > now)
    // Events on a day, including all-day and multi-day ones that started earlier.
    const on = (key) => upcoming.filter((e) => isoDay(e.start) === key || (isoDay(e.start) < key && isoDay(e.end - 1) >= key))
    const next = upcoming.find((e) => !e.allDay && e.start - now < 12 * 3600_000)
    const todays = on(today).filter((e) => e !== next)
    yourDay = (
      <>
        {next && <NextUp event={next} now={now} />}
        <Day label="Today" events={todays} now={now} empty={next ? 'Nothing else today' : 'Nothing scheduled'} />
        <Outlook days={[1, 2, 3].map((d) => ({ d, t: now + d * DAY, events: on(isoDay(now + d * DAY)) }))} />
        {c.calendars.filter((x) => x.error).map((x) => (
          <p class="muted small" key={x.name}>⚠ {x.name} couldn't be loaded</p>
        ))}
      </>
    )
  }

  return (
    <section class="panel agenda">
      <h2>Your day <Updated slot={calendar} /></h2>
      <div class="scroll">
        {yourDay}
        <LocalToday now={now} items={local?.data?.items} place={place} />
      </div>
      {extra}
    </section>
  )
}

function Day({ label, events, now, empty, showDay }) {
  return (
    <div class="agenda-day">
      <h3>{label}</h3>
      {events.length === 0 ? <p class="muted">{empty}</p> : (
        <ul>
          {events.map((e) => {
            const live = e.start <= now && e.end > now && !e.allDay
            return (
              <li class={`event ${live ? 'live' : ''}`} key={`${e.calendar}${e.start}${e.title}`} style={{ '--cal': e.color }}>
                <span class="event-time">
                  {showDay && <span class="event-day">{fmtDayLong(e.start)}</span>}
                  {e.allDay ? 'All day' : live ? `Now – ${fmtTime(e.end)}` : `${fmtTime(e.start)} – ${fmtTime(e.end)}`}
                </span>
                <span class="event-title">{e.title}</span>
                {e.location && <span class="event-loc muted">{e.location}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// The next 3 days, one compact row each: up to 3 events, then how many more.
function Outlook({ days }) {
  return (
    <div class="agenda-day outlook">
      <h3>Next 3 days</h3>
      <ul>
        {days.map(({ d, t, events }) => (
          <li class="outlook-day" key={d}>
            <span class="outlook-label">{d === 1 ? 'Tomorrow' : fmtDay(t)}</span>
            <span class="outlook-events">
              {events.length === 0 ? <span class="muted">Nothing scheduled</span> : events.slice(0, 3).map((e) => (
                <span class="outlook-event" key={`${e.calendar}${e.start}${e.title}`} style={{ '--cal': e.color }}>
                  {!e.allDay && <span class="outlook-time">{fmtTime(e.start)}</span>}{e.title}
                </span>
              ))}
              {events.length > 3 && <span class="muted small">+{events.length - 3} more</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// The one thing that needs you soonest, readable from across the room.
function NextUp({ event, now }) {
  const mins = Math.round((event.start - now) / 60000)
  const when = event.start <= now ? `Now · until ${fmtTime(event.end)}`
    : mins < 60 ? `In ${mins} min · ${fmtTime(event.start)}`
    : `${dayKey(event.start) === dayKey(now) ? 'Today' : 'Tomorrow'} · ${fmtTime(event.start)}`
  return (
    <div class={`next-up ${mins <= 15 ? 'soon' : ''}`} style={{ '--cal': event.color }}>
      <span class="next-label">Next up</span>
      <span class="next-title">{event.title}</span>
      <span class="next-when">{when}{event.location ? ` · ${event.location}` : ''}</span>
    </div>
  )
}

// Curated local events and holidays happening today, plus what starts in the next 7 days.
function LocalToday({ now, items, place }) {
  if (!items?.length) return null
  const DAY = 86_400_000
  const today = isoDay(now)
  const wd = weekdayOf(now)
  // Free items are listed in What's on instead.
  const todays = items.filter((it) => !it.free && activeOn(it, today, wd)).slice(0, 3)
  const soon = items
    .filter((it) => !it.free && it.from && it.from > today && it.from <= isoDay(now + 7 * DAY))
    .sort((a, b) => a.from.localeCompare(b.from))
    .slice(0, 2)
  if (!todays.length && !soon.length) return null
  const dayName = (iso) => fmtDay(Date.parse(`${iso}T12:00:00Z`))
  return (
    <div class="agenda-day local">
      <h3>{place ? `Today in ${place}` : 'Today'}</h3>
      <ul>
        {todays.map((it) => (
          <li class="local-item" key={it.title}>
            <span class="local-icon" aria-hidden="true">{it.icon}</span>
            <span class="local-text">
              <span class="event-title">{it.title}</span>
              <span class="event-loc muted">{[it.time, it.place, it.note].filter(Boolean).join(' · ')}</span>
            </span>
          </li>
        ))}
        {soon.map((it) => (
          <li class="local-item upcoming" key={it.title}>
            <span class="local-icon" aria-hidden="true">{it.icon}</span>
            <span class="local-text">
              <span class="event-title">{it.title} <span class="muted">· from {dayName(it.from)}</span></span>
              {it.place && <span class="event-loc muted">{it.place}</span>}
            </span>
          </li>
        ))}
      </ul>
      {!todays.length && <p class="muted small">Nothing special today</p>}
    </div>
  )
}
