import { useEffect, useState } from 'preact/hooks'
import { api, store } from '../lib.js'
import { Close } from './icons.jsx'
import { Wordmark } from './Wordmark.jsx'
import { PROJECT_URL } from '../demo.js'

// Settings screen: everything a person needs to make the dashboard theirs without editing code.
// Changes are saved on the server (Cloudflare storage) and apply to every screen showing the dashboard.
// Links and keys are write-only: the server only ever sends back names.

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'layout', label: 'Layout' },
  { id: 'news', label: 'News' },
  { id: 'events', label: "What's on" },
  { id: 'music', label: 'Music' },
  { id: 'accounts', label: 'Calendars & keys' },
]
const MODULE_LABELS = { weather: 'Weather', yourDay: 'Your day', news: 'News', whatsOn: "What's on", music: 'Music (Sonos)', lights: 'Lights (Hue)', tablet: 'Music on this tablet (YouTube)' }
const COLUMN_LABELS = { yourDay: 'Your day', news: 'News', whatsOn: "What's on" }
const TEXT_SIZES = [{ id: 'm', label: 'Comfortable' }, { id: 'l', label: 'Large' }, { id: 'xl', label: 'Extra large' }]
// Swiss cantons, so a Swiss location also gets its own public holidays.
const CANTONS = { Zurich: 'ZH', Bern: 'BE', Lucerne: 'LU', Uri: 'UR', Schwyz: 'SZ', Obwalden: 'OW', Nidwalden: 'NW', Glarus: 'GL', Zug: 'ZG', Fribourg: 'FR', Solothurn: 'SO', 'Basel-City': 'BS', 'Basel-Landschaft': 'BL', Schaffhausen: 'SH', 'Appenzell Ausserrhoden': 'AR', 'Appenzell Innerrhoden': 'AI', 'Saint Gallen': 'SG', Grisons: 'GR', Aargau: 'AG', Thurgau: 'TG', Ticino: 'TI', Vaud: 'VD', Valais: 'VS', Neuchâtel: 'NE', Geneva: 'GE', Jura: 'JU' }

// "Canton of Zurich" → CH-ZH (the geocoder words admin areas in English).
function canton(admin = '') {
  const n = admin.replace(/^(Canton of|Kanton|Canton)\s+/i, '').replace('Zürich', 'Zurich').trim()
  return CANTONS[n] ? `CH-${CANTONS[n]}` : ''
}

export function Settings({ onClose, onSaved, textSize, setTextSize }) {
  const [tab, setTab] = useState('general')
  const [data, setData] = useState(null)
  const [pin, setPin] = useState(() => store.get('settings-pin', ''))
  const [msg, setMsg] = useState(null)

  const headers = pin ? { 'x-settings-pin': pin } : {}
  const load = async () => {
    try { setData(await api('/api/settings', { headers })) } catch (e) { setMsg(`Couldn't load settings: ${e.message}`) }
  }
  useEffect(() => { load() }, [pin])

  const save = async (patch, path = '/api/settings', note = 'Saved') => {
    try {
      await api(path, { method: 'POST', body: patch, headers })
      setMsg(note)
      await load()
      onSaved?.()
    } catch (e) { setMsg(e.status === 403 ? 'Locked: enter the settings PIN first.' : `Couldn't save: ${e.message}`) }
  }

  const locked = data && !data.canEdit
  const e = data?.effective
  return (
    <div class="overlay" onClick={onClose}>
      <div class="sheet settings-sheet" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label="Settings">
        <button class="icon-btn close" onClick={onClose} aria-label="Close"><Close /></button>
        <h2>Settings</h2>
        <div class="segmented tabs">{TABS.map((t) => <button key={t.id} aria-pressed={tab === t.id} onClick={() => { setTab(t.id); setMsg(null) }}>{t.label}</button>)}</div>

        {locked && (
          <div class="notice">
            {data.pinSet ? (
              <>
                <label class="field"><span>Settings PIN</span>
                  <input type="password" inputMode="numeric" autoComplete="off" placeholder="Enter PIN to make changes"
                    onChange={(ev) => { const v = ev.currentTarget.value.trim(); store.set('settings-pin', v); setPin(v) }} />
                </label>
                <p class="muted small">Viewing only until the PIN is entered. It's remembered on this device.</p>
              </>
            ) : data.demo ? <p class="small">This is the demo: have a look around. Changes aren't saved.</p>
              : <p class="small">Settings are read-only here. Sign in through Cloudflare Access, or set a <code>SETTINGS_PIN</code> secret (see README).</p>}
          </div>
        )}
        {msg && <p class="settings-msg" role="status">{msg}</p>}
        {!data ? <p class="muted">Loading…</p> : (
          <div class={`settings-body ${locked ? 'is-locked' : ''}`}>
            {tab === 'general' && <General e={e} save={save} textSize={textSize} setTextSize={setTextSize} />}
            {tab === 'layout' && <Layout e={e} save={save} />}
            {tab === 'news' && <NewsSettings e={e} all={data.allCategories} save={save} headers={headers} />}
            {tab === 'events' && <EventSettings e={e} save={save} headers={headers} />}
            {tab === 'music' && <MusicSettings e={e} save={save} />}
            {tab === 'accounts' && <Accounts keys={data.keys} save={save} />}
          </div>
        )}
        <p class="made-with muted small">Stubli Home · made with <Wordmark /></p>
      </div>
    </div>
  )
}

// The city search, shared by Settings and the first-run setup. onPick gets the saved-settings shape.
export function CitySearch({ onPick, autoFocus }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const search = async () => {
    const r = await api(`/api/geocode?q=${encodeURIComponent(q)}`).catch(() => ({ results: [] }))
    setResults(r.results)
  }
  const pick = (r) => {
    setResults(null); setQ('')
    onPick({ name: r.name, latitude: r.latitude, longitude: r.longitude, timezone: r.timezone, country: r.country, postcode: r.postcode,
      subdivision: r.country === 'CH' ? canton(r.admin) : '' })
  }
  return (
    <>
      <div class="row">
        <input class="search" placeholder="Search a city…" value={q} autoFocus={autoFocus} onInput={(ev) => setQ(ev.currentTarget.value)} onKeyDown={(ev) => ev.key === 'Enter' && search()} />
        <button class="btn" disabled={q.trim().length < 2} onClick={search}>Search</button>
      </div>
      {results?.length > 0 && (
        <ul class="pick-list">
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}><button class="pick" onClick={() => pick(r)}>{r.name}<span class="muted">{[r.admin, r.countryName].filter(Boolean).join(', ')}</span></button></li>
          ))}
        </ul>
      )}
      {results?.length === 0 && <p class="muted small">No place found by that name. Try the nearest bigger town.</p>}
    </>
  )
}

function General({ e, save, textSize, setTextSize }) {
  return (
    <>
      <h3>Location</h3>
      {e.location.name
        ? <p>{e.location.name}{e.location.country ? `, ${e.location.country}` : ''} <span class="muted small">· {e.location.timezone}</span></p>
        : <p class="muted">No city yet. Search for yours below.</p>}
      <CitySearch onPick={(loc) => save({ location: loc }, undefined, `Location set to ${loc.name}`)} />
      <p class="muted small">Weather, time zone, public holidays and the local news card follow this place.{e.location.country === 'CH' ? ' In Switzerland the forecast and warnings come from MeteoSwiss.' : ''}</p>

      <h3>Daytime look</h3>
      <div class="segmented">
        {[[false, 'Light'], [true, 'Paper']].map(([id, label]) => (
          <button key={label} aria-pressed={!!e.paper === id} onClick={() => save({ paper: id })}>{label}</button>
        ))}
      </div>
      <p class="muted small">Paper is warmer, with a serif for headlines and stories.</p>

      <h3>Dark mode</h3>
      <div class="segmented">
        {[['auto', 'At night'], ['light', 'Never'], ['dark', 'Always']].map(([id, label]) => (
          <button key={id} aria-pressed={e.theme === id} onClick={() => save({ theme: id })}>{label}</button>
        ))}
      </div>
      <p class="muted small">At night means between sunset and sunrise.</p>

      <h3>Text size <span class="muted small">· this screen only</span></h3>
      <div class="segmented">{TEXT_SIZES.map((s) => <button key={s.id} aria-pressed={textSize === s.id} onClick={() => setTextSize(s.id)}>{s.label}</button>)}</div>

      <div class="settings-actions">
        <button class="btn" onClick={() => location.reload()}>Reload dashboard</button>
        <a class="btn" href="/health" target="_blank" rel="noopener">Health & errors</a>
        <a class="btn" href={`${PROJECT_URL}#if-something-isnt-working`} target="_blank" rel="noopener">Help</a>
        <button class="btn danger" onClick={() => confirm('Reset all settings to the defaults? Calendars and keys are kept.') && save({ reset: true }, undefined, 'Settings reset')}>Reset to defaults</button>
      </div>
    </>
  )
}

function Layout({ e, save }) {
  const cols = e.columns
  const move = (i, d) => {
    const next = [...cols]; const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    save({ columns: next })
  }
  return (
    <>
      <h3>Modules</h3>
      <ul class="toggle-list">
        {Object.entries(MODULE_LABELS).map(([id, label]) => (
          <li key={id}>
            <button class="toggle-row" aria-pressed={e.modules[id] !== false} onClick={() => save({ modules: { ...e.modules, [id]: e.modules[id] === false } })}>
              <span>{label}</span><span class="switch" aria-hidden="true"><span /></span>
            </button>
          </li>
        ))}
      </ul>
      <p class="muted small">A module that's off disappears and stops fetching data.</p>
      <h3>Column order</h3>
      <ul class="order-list">
        {cols.map((c, i) => (
          <li key={c}>
            <span>{i + 1}. {COLUMN_LABELS[c]}</span>
            <button class="icon-btn" aria-label="Move left" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button class="icon-btn" aria-label="Move right" disabled={i === cols.length - 1} onClick={() => move(i, 1)}>↓</button>
          </li>
        ))}
      </ul>
    </>
  )
}

function NewsSettings({ e, all, save, headers }) {
  const hidden = all.filter((c) => !e.categories.some((x) => x.id === c.id)).map((c) => c.id)
  const [draft, setDraft] = useState({ name: '', url: '', category: '' })
  const [check, setCheck] = useState(null) // null | 'checking' | an error message
  // The link is opened first: a website's home page works too, its feed is found for you.
  const add = async () => {
    setCheck('checking')
    try {
      const r = await api(`/api/check-feed?url=${encodeURIComponent(draft.url)}`, { headers })
      const name = draft.name.trim() || r.title || new URL(r.url).hostname.replace(/^www\./, '')
      await save({ feeds: [...feeds, { name, url: r.url, region: draft.category === 'local' ? 'Local' : 'World', ...(draft.category ? { category: draft.category } : {}) }] }, undefined, `Added ${name}. Latest story: “${r.sample}”`)
      setDraft({ name: '', url: '', category: '' }); setCheck(null)
    } catch (err) { setCheck(err.message) }
  }
  const feeds = e.feeds
  return (
    <>
      <h3>Category cards</h3>
      <ul class="toggle-list">
        {all.map((c) => (
          <li key={c.id}>
            <button class="toggle-row" aria-pressed={!hidden.includes(c.id)} onClick={() => save({ hiddenCategories: hidden.includes(c.id) ? hidden.filter((x) => x !== c.id) : [...hidden, c.id] })}>
              <span style={{ color: c.color }}>●</span><span>{c.name}</span><span class="switch" aria-hidden="true"><span /></span>
            </button>
          </li>
        ))}
      </ul>
      <h3>Sources <span class="muted small">· {feeds.length} feeds</span></h3>
      <ul class="feed-list">
        {feeds.map((f, i) => (
          <li key={`${f.url}${i}`}>
            <span class="feed-name">{f.name}{f.lang ? ` · ${f.lang}` : ''}</span>
            <span class="feed-cat muted">{all.find((c) => c.id === f.category)?.name ?? 'Any category'}</span>
            <button class="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => save({ feeds: feeds.filter((_, j) => j !== i) }, undefined, `Removed ${f.name}`)}><Close size={18} /></button>
          </li>
        ))}
      </ul>
      <h3>Add a source</h3>
      <div class="add-feed">
        <input placeholder="The outlet's website or RSS link, e.g. lemonde.fr" inputMode="url" autoCapitalize="off" value={draft.url} onInput={(ev) => { setDraft({ ...draft, url: ev.currentTarget.value }); setCheck(null) }} />
        <input placeholder="Name (optional), e.g. Le Monde" value={draft.name} onInput={(ev) => setDraft({ ...draft, name: ev.currentTarget.value })} />
        <select value={draft.category} onChange={(ev) => setDraft({ ...draft, category: ev.currentTarget.value })}>
          <option value="">Any category (AI sorts it)</option>
          {all.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button class="btn primary" disabled={draft.url.trim().length < 4 || check === 'checking'} onClick={add}>
          {check === 'checking' ? 'Checking…' : 'Add source'}
        </button>
      </div>
      {check && check !== 'checking' && <p class="form-error" role="alert">{check}</p>}
      <p class="muted small">New sources appear after the next news refresh (up to 30 minutes).</p>
    </>
  )
}

const EVENT_KINDS = [
  { id: 'music', label: 'Concerts and live music' },
  { id: 'art', label: 'Art, design and architecture tours' },
  { id: 'exhibitions', label: 'Museums and exhibitions' },
]

function EventSettings({ e, save }) {
  const kinds = e.eventKinds ?? {}
  return (
    <>
      <h3>Event sources</h3>
      <ul class="toggle-list">
        <li>
          <button class="toggle-row" aria-pressed={!!e.kulturZueri} onClick={() => save({ kulturZueri: !e.kulturZueri })}>
            <span>Kultur Züri <span class="muted small">· Zürich area</span></span><span class="switch" aria-hidden="true"><span /></span>
          </button>
        </li>
        {(e.venueList ?? []).map((v) => {
          const on = (e.venues ?? []).includes(v.id)
          return (
            <li key={v.id}>
              <button class="toggle-row" aria-pressed={on} onClick={() => save({ venues: on ? e.venues.filter((x) => x !== v.id) : [...(e.venues ?? []), v.id] })}>
                <span>{v.name} <span class="muted small">· {v.note}, Zürich</span></span><span class="switch" aria-hidden="true"><span /></span>
              </button>
            </li>
          )
        })}
        {e.freeDaysCount > 0 && (
          <li>
            <button class="toggle-row" aria-pressed={!!e.freeDays} onClick={() => save({ freeDays: !e.freeDays })}>
              <span>Free museum days <span class="muted small">· {e.freeDaysCount} within {e.radiusKm ?? 100} km</span></span><span class="switch" aria-hidden="true"><span /></span>
            </button>
          </li>
        )}
      </ul>
      {(e.kulturZueri || e.venues?.length > 0) && <><h3>Kinds of events</h3>
      <ul class="toggle-list">
        {EVENT_KINDS.map(({ id, label }) => (
          <li key={id}>
            <button class="toggle-row" aria-pressed={kinds[id] !== false} onClick={() => save({ eventKinds: { ...kinds, [id]: kinds[id] === false } })}>
              <span>{label}</span><span class="switch" aria-hidden="true"><span /></span>
            </button>
          </li>
        ))}
      </ul>
      <p class="muted small">Listings refresh every hour. Kultur Züri covers Zürich and nearby towns; each venue adds its own programme (performances count as art, the rest as music).</p></>}

      <h3>Your free events</h3>
      <ul class="feed-list">
        {(e.localEvents ?? []).map((x, i) => (
          <li key={`${x.title}${i}`}>
            <span class="feed-name">{x.icon} {x.title}{x.free ? ' 🆓' : ''}</span>
            <span class="feed-cat muted">{x.weekdays ? `Every ${x.weekdays.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}` : [x.from, x.to].filter(Boolean).join(' – ')}</span>
            <button class="icon-btn" aria-label={`Remove ${x.title}`} onClick={() => save({ localEvents: e.localEvents.filter((_, j) => j !== i) })}><Close size={18} /></button>
          </li>
        ))}
      </ul>
      <AddLocalEvent onAdd={(ev) => save({ localEvents: [...(e.localEvents ?? []), ev] }, undefined, `Added ${ev.title}`)} />
    </>
  )
}

function AddLocalEvent({ onAdd }) {
  const [d, setD] = useState({ title: '', place: '', mode: 'weekly', weekday: '3', from: '', to: '', free: true })
  const ok = d.title && (d.mode === 'weekly' || d.from)
  return (
    <div class="add-feed">
      <input placeholder="What, e.g. Free entry to the Landesmuseum" value={d.title} onInput={(ev) => setD({ ...d, title: ev.currentTarget.value })} />
      <input placeholder="Where (optional)" value={d.place} onInput={(ev) => setD({ ...d, place: ev.currentTarget.value })} />
      <div class="row">
        <select value={d.mode} onChange={(ev) => setD({ ...d, mode: ev.currentTarget.value })}>
          <option value="weekly">Every week on…</option>
          <option value="dates">Between dates</option>
        </select>
        {d.mode === 'weekly'
          ? <select value={d.weekday} onChange={(ev) => setD({ ...d, weekday: ev.currentTarget.value })}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
          : <><input type="date" value={d.from} onInput={(ev) => setD({ ...d, from: ev.currentTarget.value })} /><input type="date" value={d.to} onInput={(ev) => setD({ ...d, to: ev.currentTarget.value })} /></>}
      </div>
      <label class="check"><input type="checkbox" checked={d.free} onChange={(ev) => setD({ ...d, free: ev.currentTarget.checked })} /> Free</label>
      <button class="btn primary" disabled={!ok} onClick={() => {
        onAdd({ title: d.title, place: d.place || undefined, icon: d.free ? '🆓' : '✨', free: d.free, ...(d.mode === 'weekly' ? { weekdays: [+d.weekday] } : { from: d.from, to: d.to || d.from }) })
        setD({ ...d, title: '', place: '', from: '', to: '' })
      }}>Add event</button>
    </div>
  )
}

function MusicSettings({ e, save }) {
  const [d, setD] = useState({ name: '', url: '' })
  const links = e.tabletMusic ?? []
  return (
    <>
      <h3>Music on this tablet</h3>
      <p class="small">Paste a link from YouTube or YouTube Music: a playlist, an album, a mix or a single song. It plays on this tablet, or on a speaker the tablet is connected to by Bluetooth or AirPlay. No account needed.</p>
      <ul class="feed-list">
        {links.map((l, i) => (
          <li key={`${l.list ?? l.video}${i}`}>
            <span class="feed-name">{l.name}</span>
            <span class="feed-cat muted">{l.list ? 'Playlist' : 'Song or video'}</span>
            <button class="icon-btn" aria-label={`Remove ${l.name}`} onClick={() => save({ tabletMusic: links.filter((_, j) => j !== i) }, undefined, `Removed ${l.name}`)}><Close size={18} /></button>
          </li>
        ))}
      </ul>
      {!links.length && <p class="muted small">Nothing here yet. In YouTube Music, open a playlist, tap Share, then Copy link, and paste it below.</p>}
      <div class="add-feed">
        <input placeholder="Link, e.g. music.youtube.com/playlist?list=…" inputMode="url" autoCapitalize="off" value={d.url} onInput={(ev) => setD({ ...d, url: ev.currentTarget.value })} />
        <input placeholder="Name, e.g. Sunday jazz" value={d.name} onInput={(ev) => setD({ ...d, name: ev.currentTarget.value })} />
        <button class="btn primary" disabled={!/youtu/i.test(d.url)}
          onClick={() => { save({ tabletMusic: [...links, { name: d.name.trim() || 'Music', url: d.url.trim() }] }, undefined, `Added ${d.name.trim() || 'your music'}. Tap Play music at the bottom.`); setD({ name: '', url: '' }) }}>Add music</button>
      </div>
      <p class="muted small">Playback uses YouTube's own player, which shows while music plays (YouTube's rules). YouTube may show ads. With Sonos, these also appear in the Music panel under "On this tablet".</p>
    </>
  )
}

function Accounts({ keys, save }) {
  const [cal, setCal] = useState({ name: '', url: '' })
  const [gemini, setGemini] = useState('')
  const names = keys.calendars
  return (
    <>
      <h3>Calendars</h3>
      <ul class="feed-list">
        {names.map((n) => (
          <li key={n}>
            <span class="feed-name">{n}</span>
            <span class="feed-cat muted">link saved</span>
            <button class="icon-btn" aria-label={`Remove ${n}`} onClick={() => confirm(`Remove the ${n} calendar?`) && save({ calendars: [], keep: names.filter((x) => x !== n) }, '/api/secrets/calendars', `Removed ${n}`)}><Close size={18} /></button>
          </li>
        ))}
      </ul>
      <div class="add-feed">
        <input placeholder="Name, e.g. Personal" value={cal.name} onInput={(ev) => setCal({ ...cal, name: ev.currentTarget.value })} />
        <input type="password" autoComplete="off" placeholder="Calendar link (iCal / .ics), e.g. Proton, Google, iCloud, Outlook" value={cal.url} onInput={(ev) => setCal({ ...cal, url: ev.currentTarget.value })} />
        <button class="btn primary" disabled={!cal.name || !/^(https?|webcals?):\/\//i.test(cal.url)}
          onClick={() => { save({ calendars: [cal], keep: names.filter((x) => x !== cal.name) }, '/api/secrets/calendars', `Saved ${cal.name}`); setCal({ name: '', url: '' }) }}>Save calendar</button>
      </div>
      <p class="muted small">Links are stored on your server only and are never shown again. Treat them like passwords.</p>

      <h3>AI summaries (Gemini)</h3>
      <p class="small">{keys.gemini ? '✓ Key saved' : 'No key: news is grouped without AI summaries.'}</p>
      <div class="row">
        <input type="password" autoComplete="off" placeholder="Paste a Google AI Studio key" value={gemini} onInput={(ev) => setGemini(ev.currentTarget.value)} />
        <button class="btn" disabled={!gemini} onClick={() => { save({ key: gemini }, '/api/secrets/gemini', 'Gemini key saved'); setGemini('') }}>Save</button>
        {keys.gemini && <button class="btn" onClick={() => save({ key: '' }, '/api/secrets/gemini', 'Gemini key removed')}>Remove</button>}
      </div>

      <h3>Sonos and Philips Hue</h3>
      <p class="small">Sonos: {keys.sonos ? <a href="/auth/sonos/start">Reconnect</a> : 'needs developer keys (see README)'} · Hue: {keys.hue ? <a href="/auth/hue/start">Reconnect</a> : 'needs developer keys (see README)'}</p>
    </>
  )
}
