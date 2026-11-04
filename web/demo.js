// Demo mode: open the dashboard with ?demo (or build it with VITE_DEMO=1) to see it filled with
// made-up sample data, without a server, accounts or keys. Nothing is saved and nothing is sent
// anywhere. Every person, outlet and story here is invented; the demo bar says so on screen.

export const DEMO = typeof location !== 'undefined' &&
  (new URLSearchParams(location.search).has('demo') || import.meta.env.VITE_DEMO === '1')

export const PROJECT_URL = 'https://github.com/celestinetan/stubli-home'

const H = 3600_000
const DAY = 24 * H
const ZONE = 'Europe/Lisbon'
const iso = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(t)
// Today at a given local hour (Lisbon is UTC+0 in winter, UTC+1 in summer; close enough for a demo).
const at = (days, hour, min = 0) => {
  const d = new Date(Date.now() + days * DAY)
  d.setUTCHours(hour - lisbonOffset(), min, 0, 0)
  return d.getTime()
}
const lisbonOffset = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: 'numeric', hourCycle: 'h23' }).format(new Date())
  return (+p - new Date().getUTCHours() + 24) % 24
}

function weather() {
  const now = Date.now()
  const top = Math.ceil(now / H) * H
  const codes = [2, 2, 1, 0, 0, 1, 2, 3, 61, 61, 3, 2]
  const hourly = codes.map((code, i) => {
    const hour = new Date(top + i * H).getUTCHours() + lisbonOffset()
    const temp = 17 + 4 * Math.sin(((hour - 9) / 24) * 2 * Math.PI)
    return { t: top + i * H, temp, feels: temp - 1, pop: code === 61 ? 70 : 10, precip: code === 61 ? 0.8 : 0, code, isDay: hour >= 7 && hour < 18, gusts: 22, uv: 3 }
  })
  const daily = [0, 1, 2, 3].map((d) => ({
    t: at(d, 0), code: [2, 0, 61, 1][d], max: [21, 23, 18, 20][d], min: [12, 13, 11, 12][d], pop: [10, 0, 80, 20][d], precip: 0,
    sunrise: at(d, 7, 32), sunset: at(d, 17, 34),
  }))
  return {
    current: { temp: 19, feels: 18, code: 2, isDay: true, wind: 14, humidity: 64 },
    hourly, daily,
    rain: { kind: 'soon', text: 'Rain likely this evening' },
    advice: [{ icon: '☂️', text: 'Take an umbrella for later: rain from about 20:00' }],
    warnings: [],
  }
}

function calendar() {
  const ev = (calendar, color, title, start, end, location = '', allDay = false) => ({ calendar, color, title, location, allDay, start, end })
  return {
    configured: true,
    calendars: [{ name: 'Home', color: '#4f6a4a' }, { name: 'Work', color: '#3b82f6' }],
    events: [
      ev('Work', '#3b82f6', 'Team catch-up', Date.now() + 40 * 60_000, Date.now() + 70 * 60_000, 'Video call'),
      ev('Home', '#4f6a4a', 'Pick up the bread order', at(0, 17, 30), at(0, 17, 45), 'Corner bakery'),
      ev('Home', '#4f6a4a', 'Dinner with Ben and Cleo', at(0, 19, 30), at(0, 22, 0), 'At home'),
      ev('Work', '#3b82f6', 'Design review', at(1, 10, 0), at(1, 11, 0)),
      ev('Home', '#4f6a4a', 'Yoga', at(1, 18, 30), at(1, 19, 30), 'Studio Luz'),
      ev('Home', '#4f6a4a', "Ana's birthday", at(2, 0), at(3, 0), '', true),
    ],
  }
}

const OUTLETS = ['Daily Example', 'Sample Times', 'The Placeholder', 'Demo Wire', 'World Specimen']
function news() {
  const now = Date.now()
  const story = (headline, summary, categories, outlets, minsAgo, impact = 3, reasons = []) => ({
    id: `demo-${headline}`, headline, summary, differences: outlets > 1 ? 'Outlets agree on the facts; one adds more local reaction.' : '',
    region: categories.includes('local') ? 'Local' : 'World', published: now - minsAgo * 60_000, ai: true,
    categories, impact, kind: 'news', score: 10 - minsAgo / 60, reasons: [...reasons, outlets > 1 && `${outlets} outlets`].filter(Boolean),
    sources: OUTLETS.slice(0, outlets).map((name, i) => ({ name, title: headline, link: PROJECT_URL, published: now - (minsAgo + i * 7) * 60_000 })),
  })
  return {
    stories: [
      story('Sample story: city opens a new riverside park', 'A made-up example of a local story, as it would appear on your dashboard. Several outlets reported it, so it ranks high.', ['local'], 4, 25, 3, ['Local']),
      story('Sample story: ministers agree a new climate plan', 'An invented example of a major world story, summarised in two or three neutral sentences.', ['world', 'europe'], 5, 50, 4, ['High impact']),
      story('Sample story: markets steady ahead of a rate decision', 'An invented business story. Tap any story to see who reported it and how their accounts differ.', ['business'], 3, 80),
      story('Sample story: a new telescope sends its first pictures', 'An invented science story, shown in the Tech and science card.', ['tech-science'], 2, 120),
      story('Sample story: elections draw a record turnout', 'An invented story for the US card.', ['us', 'world'], 4, 140, 4),
      story('Sample story: high-speed rail line reaches a milestone', 'An invented story for the Asia card.', ['china-asia'], 2, 160),
      story('Sample story: the slow-food café trend spreads', 'An invented lifestyle story.', ['lifestyle'], 1, 200, 2),
      story('Sample story: harbour festival returns this weekend', 'Another made-up local story.', ['local'], 2, 230),
    ],
  }
}

function events() {
  const d = (days) => iso(Date.now() + days * DAY)
  const e = (title, venue, days, time, kind, free = false, nearby = false) => ({ source: 'Sample events', title, venue, city: nearby ? 'Cascais' : 'Lisbon', date: d(days), time, kind, url: PROJECT_URL, nearby, free, teaser: 'A made-up event, to show how listings look.' })
  return {
    events: [
      e('Lunchtime organ concert', 'Sample Cathedral', 0, '12:30', 'Music', true),
      e('Jazz trio by the river', 'Demo Jazz Club', 0, '21:00', 'Music'),
      e('Guided tour: tiles and their stories', 'Example Museum', 1, '11:00', 'Art'),
      e('Fado night', 'Sample Tavern', 1, '21:30', 'Music', false, true),
      e('Open studios weekend', 'Artists Quarter', 3, '14:00', 'Art', true),
      { ...e('Light and water', 'Example Gallery', 9, '', 'Exhibition'), teaser: 'A made-up exhibition.' },
      { ...e('A century of posters', 'Sample Design Museum', 25, '', 'Exhibition', true), teaser: 'A made-up exhibition.' },
    ],
    sources: [{ name: 'Sample events', ok: true }],
  }
}

function local() {
  const wd = new Date().getDay()
  return { items: [
    { title: 'Free entry to the city museums', place: 'Example Museum', icon: '🏛️', weekdays: [wd], free: true, note: 'A made-up example of your own free day' },
  ] }
}

// Real YouTube links, so the demo's "On this tablet" music plays for real (nothing is saved).
const TABLET_MUSIC = [
  { name: 'Pop hits playlist', list: 'RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs' },
]

const CATEGORIES = [
  { id: 'local', name: 'Portugal', color: '#d52b1e' }, { id: 'world', name: 'World', color: '#3b6fb6' },
  { id: 'us', name: 'US', color: '#5b5fc7' }, { id: 'china-asia', name: 'China & Asia', color: '#c2410c' },
  { id: 'europe', name: 'Europe', color: '#1d4ed8' }, { id: 'business', name: 'Business', color: '#0f766e' },
  { id: 'tech-science', name: 'Tech & Science', color: '#7c3aed' }, { id: 'lifestyle', name: 'Lifestyle', color: '#be185d' },
]

function dashboard() {
  const slot = (data, every = 15) => ({ data, updatedAt: Date.now() - 4 * 60_000, error: null, every })
  return {
    weather: slot(weather()), calendar: slot(calendar()), news: slot(news()), events: slot(events(), 60), local: slot(local(), 360),
    settings: {
      sleep: null, nightlyReload: '03:00', theme: 'auto', paper: false, eventSources: true, barScenes: [], newsCategories: CATEGORIES,
      timezone: ZONE, location: 'Lisbon', modules: { weather: true, yourDay: true, news: true, whatsOn: true, music: true, lights: true, tablet: true },
      columns: ['yourDay', 'news', 'whatsOn'], tabletMusic: TABLET_MUSIC,
    },
  }
}

const hue = {
  configured: true, connected: true, activeMood: 'relaxed', allOffId: 'all', homeOn: true, homeBrightness: 60,
  presets: [['energised', 'Energised', '☀️'], ['focused', 'Focused', '🎯'], ['relaxed', 'Relaxed', '🛋️'], ['cosy', 'Cosy', '🕯️'], ['sleepy', 'Sleepy', '🌛'],
    ['galaxy', 'Galaxy', '🌌', '#6a5bd6'], ['fairfax', 'Fairfax', '🌺', '#c64fb8'], ['soho', 'Soho', '🏙️', '#d8546a'], ['dreamy-dusk', 'Dreamy Dusk', '🌙', '#9a6ad0'], ['savanna-sunset', 'Savannah Sunset', '🌅', '#e0703a']]
    .map(([id, name, icon, tint]) => ({ id, name, icon, tint: tint ?? null, scene: tint ? name : null, rooms: tint ? 3 : 0 })),
  rooms: ['Living room', 'Kitchen', 'Bedroom'].map((name, i) => ({ id: `r${i}`, name, lightId: `l${i}`, on: i < 2, brightness: [70, 45, 0][i], scenes: [] })),
}
const sonos = {
  configured: true, connected: true,
  groups: [{ id: 'g1', name: 'Living room', state: 'PLAYBACK_STATE_PLAYING', title: 'Morning light', artist: 'The Example Ensemble', album: 'Sample Sessions', art: '', volume: 22, muted: false, source: 'Favourite', position: 64_000, duration: 212_000, next: { title: 'Window seat', artist: 'The Example Ensemble' }, shuffle: false, canShuffle: true }],
  favorites: ['Sunday jazz', 'Focus piano', 'Radio Example'].map((name, i) => ({ id: `f${i}`, name, image: '', description: 'Sample favourite' })),
  playlists: [],
}

// Answers the dashboard's requests from the sample data above.
export async function demoApi(path, opts = {}) {
  const p = path.split('?')[0]
  if ((opts.method ?? 'GET') !== 'GET') {
    window.dispatchEvent(new CustomEvent('toast', { detail: "This is the demo: nothing was changed." }))
    return { ok: true }
  }
  if (p === '/api/dashboard') return dashboard()
  if (p === '/api/sonos') return sonos
  if (p === '/api/hue') return hue
  if (p === '/api/geocode') return { results: [] }
  if (p === '/api/settings') {
    return {
      demo: true, canEdit: false, pinSet: false, saved: {},
      effective: {
        location: { name: 'Lisbon', country: 'PT', latitude: 38.72, longitude: -9.14, timezone: ZONE },
        modules: dashboard().settings.modules, columns: ['yourDay', 'news', 'whatsOn'], theme: 'auto', paper: false,
        feeds: OUTLETS.map((name) => ({ name, url: 'https://example.com/feed', region: 'World' })), categories: CATEGORIES,
        eventKinds: { music: true, art: true, exhibitions: true }, kulturZueri: false, tabletMusic: TABLET_MUSIC, hiddenCalendars: [], localEvents: local().items,
      },
      allCategories: CATEGORIES, keys: { calendars: ['Home', 'Work'], gemini: true, sonos: true, hue: true },
    }
  }
  return {}
}
