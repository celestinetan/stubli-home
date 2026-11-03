import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import config from './config'
import { type Env, readSlot, refreshSlot, logError, recentErrors } from './store'
import { fetchWeather } from './weather'
import { fetchCalendar, feedUrl } from './calendar'
import { fetchLocal } from './local'
import { fetchEvents } from './events'
import { fetchNews, collectNewsBatch, parseFeed } from './news'
import { startUrl, finish, type Provider } from './oauth'
import { sonosProvider, sonosState, sonosAction } from './sonos'
import { hueProvider, hueState, hueAction, hueRegisterApp } from './hue'
import { applySettings, readSaved, saveSettings, resetSettings, canEdit, DEFAULTS, type Saved } from './settings'

// Each data source belongs to a module; a switched-off module stops fetching.
const SOURCES = {
  weather: { every: 15, module: 'weather', run: (env: Env) => refreshSlot(env, 'weather', () => fetchWeather()) },
  calendar: { every: 15, module: 'yourDay', run: (env: Env) => refreshSlot(env, 'calendar', () => fetchCalendar(env)) },
  events: { every: 60, module: 'whatsOn', run: (env: Env) => refreshSlot(env, 'events', () => fetchEvents(env)) },
  local: { every: 360, module: 'yourDay', run: (env: Env) => refreshSlot(env, 'local', () => fetchLocal()) },
  news: { every: 15, module: 'news', run: (env: Env) => refreshSlot(env, 'news', (prev: any) => fetchNews(env, prev)) },
} as const
const enabled = (k: SourceKey) => config.modules[SOURCES[k].module] !== false
type SourceKey = keyof typeof SOURCES

const app = new Hono<{ Bindings: Env }>()

// ---------- device pairing ----------
// A new dashboard is locked: each tablet or phone is paired once with a code. The code is either
// the PAIRING_SECRET set at deploy time or, if none, chosen by whoever opens the new dashboard
// first. Owners who put Cloudflare Access in front set ACCESS_PROTECTED=true instead.

const PAIR_COOKIE = 'dash_pair'

function sameSecret(a: string, b: string) {
  const enc = new TextEncoder()
  const x = enc.encode(a), y = enc.encode(b)
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y)
}

const pairingCode = async (env: Env) => env.PAIRING_SECRET || (await env.KV.get('pairing:code')) || ''
const isPaired = async (c: any) => {
  const code = await pairingCode(c.env)
  return !!code && sameSecret(getCookie(c, PAIR_COOKIE) ?? '', code)
}

// Saved settings overlay the defaults before anything else runs.
app.use('*', async (c, next) => {
  await applySettings(c.env)
  return next()
})

app.use('*', async (c, next) => {
  if (c.env.ACCESS_PROTECTED === 'true' || c.req.path === '/pair' || c.req.path === '/health') return next()
  if (await isPaired(c)) return next()
  return c.req.path.startsWith('/api/') ? c.json({ error: 'not_paired' }, 401) : c.redirect('/pair')
})

app.get('/pair', async (c) => {
  if (c.env.ACCESS_PROTECTED === 'true') return c.redirect('/')
  if (!(await pairingCode(c.env))) return c.html(page('Set up Stubli Home', `
  <p>Choose a pairing code. You'll type it once on each tablet or phone that should show this dashboard.</p>
  <form method="post"><label for="code">New pairing code (at least 8 characters)</label>
  <input id="code" name="code" autocomplete="new-password" minlength="8" required autofocus>
  <input type="hidden" name="setup" value="1">
  <button>Save and pair this device</button></form>
  <p><small>Keep it somewhere safe. Anyone with the code can open your dashboard.</small></p>`))
  return c.html(page('Pair this device', `
  <p>Type the pairing code chosen when this Stubli Home was set up.</p>
  <form method="post"><label for="code">Pairing code</label>
  <input id="code" name="code" autocomplete="off" autocapitalize="off" autofocus>
  <button>Pair device</button></form>
  ${FORGOT}`))
})

// Locked out, or someone else chose the code first: a PAIRING_SECRET set in Cloudflare always wins.
const FORGOT = `<details><summary>Forgot the code?</summary><p>Sign in at dash.cloudflare.com, then open Workers and Pages, your
Stubli Home, Settings, Variables and Secrets. Add a secret named <b>PAIRING_SECRET</b> with a new code of at least 8 characters,
and save. It replaces the old code within a minute; pair each tablet again with the new one.</p></details>`

app.post('/pair', async (c) => {
  const body = await c.req.parseBody()
  const code = String(body.code ?? '').trim()
  let current = await pairingCode(c.env)
  if (!current && body.setup) {
    // First visit to a new dashboard: this person sets the code.
    if (code.length < 8) return c.html(page('Set up Stubli Home', '<p>Use at least 8 characters, then try again.</p><a href="/pair">Choose a code</a>'), 400)
    await c.env.KV.put('pairing:code', code)
    current = code
  }
  if (!current || !sameSecret(code, current)) {
    return c.html(page('Pair this device', `<p>That code didn't match. Check for a typo (capitals count) and try again.</p><a href="/pair">Try again</a>${FORGOT}`), 401)
  }
  setCookie(c, PAIR_COOKIE, code, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 400 * 86400, path: '/' })
  return c.redirect('/')
})

// ---------- dashboard data ----------

app.get('/api/dashboard', async (c) => {
  const keys = Object.keys(SOURCES) as SourceKey[]
  const slots = await Promise.all(keys.map((k) => readSlot<any>(c.env, k)))
  const out: Record<string, unknown> = {}
  keys.forEach((k, i) => {
    const s = slots[i]
    // First run, or the scheduled refresh hasn't happened for a while: refresh in the background.
    const stale = !s || Date.now() - s.attemptedAt > SOURCES[k].every * 2 * 60_000
    if (stale && enabled(k)) c.executionCtx.waitUntil(SOURCES[k].run(c.env))
    out[k] = { data: s?.data ?? null, updatedAt: s?.updatedAt ?? null, error: s?.error ?? null, every: SOURCES[k].every }
  })
  return c.json({
    ...out,
    settings: {
      sleep: config.display.sleep, nightlyReload: config.display.nightlyReload, theme: config.display.theme, paper: config.display.paper, eventSources: config.events.kulturZueri,
      barScenes: config.home.barScenes, newsCategories: config.news.categories, tabletMusic: config.tabletMusic,
      timezone: config.timezone, location: config.location.name, modules: config.modules, columns: config.columns,
    },
  })
})

app.post('/api/refresh/news-a', async (c) => {
  await collectNewsBatch(c.env, 0)
  return c.json({ ok: true })
})

app.post('/api/refresh/:key', async (c) => {
  const k = c.req.param('key') as SourceKey
  if (!(k in SOURCES)) return c.json({ error: 'unknown' }, 404)
  await SOURCES[k].run(c.env)
  return c.json({ ok: true })
})

// ---------- settings (read by anyone who can open the dashboard; saving needs Access or the PIN) ----------

app.get('/api/settings', async (c) => {
  const calendars = JSON.parse((await c.env.KV.get('secret:calendars')) ?? c.env.CALENDAR_FEEDS ?? '[]') as { name: string }[]
  return c.json({
    saved: await readSaved(c.env),
    effective: {
      location: { ...config.location, timezone: config.timezone, subdivision: config.local.subdivision },
      modules: config.modules, columns: config.columns, theme: config.display.theme, paper: config.display.paper,
      feeds: config.news.feeds, categories: config.news.categories, eventKinds: config.events.kinds, kulturZueri: config.events.kulturZueri, tabletMusic: config.tabletMusic,
      hiddenCalendars: config.calendar.hidden, localEvents: config.local.events,
    },
    // Hidden cards included; the Local card carries your country's name.
    allCategories: DEFAULTS.news.categories.map((d) => config.news.categories.find((c) => c.id === d.id) ?? d),
    // Names only: links and keys never leave the server.
    keys: {
      calendars: calendars.map((x) => x.name),
      gemini: !!((await c.env.KV.get('secret:gemini')) ?? c.env.GEMINI_API_KEY),
      sonos: !!c.env.SONOS_CLIENT_ID, hue: !!c.env.HUE_CLIENT_ID,
    },
    canEdit: canEdit(c.req.raw, c.env),
    pinSet: !!c.env.SETTINGS_PIN,
  })
})

app.post('/api/settings', async (c) => {
  if (!canEdit(c.req.raw, c.env)) return c.json({ error: 'locked' }, 403)
  const body = await c.req.json<Saved & { reset?: boolean }>()
  if (body.reset) { await resetSettings(c.env); return c.json({ ok: true }) }
  try {
    const saved = await saveSettings(c.env, body)
    // Location or feeds changed: refresh what depends on them right away.
    // Waited for, so the dashboard shows the new place's weather as soon as it reloads.
    if (body.location) await Promise.allSettled([SOURCES.weather.run(c.env), SOURCES.local.run(c.env)])
    return c.json({ ok: true, saved })
  } catch (e) { return c.json({ error: String(e instanceof Error ? e.message : e) }, 400) }
})

// Calendar links and the Gemini key can be set from Settings (write-only; never read back).
app.post('/api/secrets/:name', async (c) => {
  if (!canEdit(c.req.raw, c.env)) return c.json({ error: 'locked' }, 403)
  const name = c.req.param('name')
  const body = await c.req.json<any>()
  if (name === 'calendars') {
    const list = (body.calendars ?? []).filter((x: any) => x?.name && /^(https?|webcals?):\/\//i.test(x.url ?? '')).map((x: any) => ({ name: String(x.name).slice(0, 40), url: String(x.url).trim() }))
    // Open each new link once before saving, so a wrong or public-only link is caught now.
    for (const cal of list) {
      const problem = await checkCalendar(cal.url)
      if (problem) return c.json({ error: problem }, 400)
    }
    // Keep existing links for names sent without a new URL.
    const prev = JSON.parse((await c.env.KV.get('secret:calendars')) ?? c.env.CALENDAR_FEEDS ?? '[]') as any[]
    const keep = (body.keep ?? []).map(String)
    const merged = [...prev.filter((p) => keep.includes(p.name)), ...list]
    await c.env.KV.put('secret:calendars', JSON.stringify(merged))
    c.executionCtx.waitUntil(SOURCES.calendar.run(c.env))
    return c.json({ ok: true, calendars: merged.map((x) => x.name) })
  }
  if (name === 'gemini') {
    const key = String(body.key ?? '').trim()
    if (!key) { await c.env.KV.delete('secret:gemini'); return c.json({ ok: true }) }
    const problem = await checkGemini(key)
    if (problem) return c.json({ error: problem }, 400)
    await c.env.KV.put('secret:gemini', key)
    return c.json({ ok: true })
  }
  return c.json({ error: 'unknown' }, 404)
})

// Checks behind the saving above and the news sources in Settings. Their messages say what to do
// next in plain words, and never repeat a link (calendar links are private).
const withTimeout = (ms: number) => { const a = new AbortController(); setTimeout(() => a.abort(), ms); return a.signal }

async function checkCalendar(raw: string) {
  let text = ''
  try {
    const res = await fetch(feedUrl(raw), { signal: withTimeout(10_000), headers: { 'User-Agent': 'Mozilla/5.0 (Stubli Home)' } })
    if (res.status >= 400 && res.status < 500) return "That calendar link doesn't open. Check it was copied whole, or make a new share link in your calendar app and paste it again."
    if (!res.ok) return "The calendar didn't answer just now. Check the link, or try again in a minute."
    text = await res.text()
  } catch { return "That doesn't look like a calendar link. Copy the whole private iCal link again (it starts with https:// or webcal://)." }
  if (!text.includes('BEGIN:VCALENDAR')) {
    return /<html/i.test(text)
      ? "That link opens a web page, not a calendar. Look for the private address in iCal (.ics) format instead."
      : "That link didn't return a calendar. Copy the private iCal (.ics) link again."
  }
  return ''
}

async function checkGemini(key: string) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`, { signal: withTimeout(10_000) })
    if (res.ok) return ''
    if (res.status === 400 || res.status === 403) return "Google didn't accept that key. Copy it again from aistudio.google.com (Get API key)."
    return "Google didn't answer just now. Try again in a minute."
  } catch { return "Google didn't answer just now. Try again in a minute." }
}

// A news source: an RSS or Atom feed, or a website's home page, where the feed is found for you.
app.get('/api/check-feed', async (c) => {
  if (!canEdit(c.req.raw, c.env)) return c.json({ error: 'locked' }, 403)
  let url = (c.req.query('url') ?? '').trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`
  const get = async (u: string) => {
    const res = await fetch(u, { signal: withTimeout(10_000), headers: { 'User-Agent': 'Mozilla/5.0 (Stubli Home)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/html;q=0.8' } })
    if (!res.ok) throw new Error(String(res.status))
    return { text: await res.text(), final: res.url || u }
  }
  try {
    let { text, final } = await get(url)
    if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(text)) {
      // A web page: follow its <link rel="alternate" type="application/rss+xml"> if it has one.
      const tag = [...text.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => /rel=["']?alternate/i.test(t) && /(rss|atom)\+xml/i.test(t))
      const href = tag && /href=["']([^"']+)["']/i.exec(tag)?.[1]
      if (!href) return c.json({ error: "No news feed found there. Try the outlet's RSS link: it often ends in /rss, /feed or .xml." }, 400)
      ;({ text, final } = await get(new URL(href.replace(/&amp;/g, '&'), final).toString()))
    }
    const items = parseFeed(text, 5)
    if (!items.length) return c.json({ error: 'That feed has no stories in it right now. Try another link from the same outlet.' }, 400)
    const title = /<title>(?:<!\[CDATA\[)?([^<\]]+)/i.exec(text)?.[1]?.trim() ?? ''
    return c.json({ ok: true, url: final, title: title.slice(0, 40), sample: items[0].title })
  } catch { return c.json({ error: "That address didn't open. Check it for a typo, or try the outlet's RSS link." }, 400) }
})

// City search for the location setting (Open-Meteo's free geocoder).
app.get('/api/geocode', async (c) => {
  const q = c.req.query('q') ?? ''
  if (q.length < 2) return c.json({ results: [] })
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json`)
  const d: any = await r.json()
  // Big cities first, so "Lisbon" finds Portugal before Lisbon, Ohio.
  const results = (d.results ?? []).sort((a: any, b: any) => (b.population ?? 0) - (a.population ?? 0)).slice(0, 6)
  return c.json({ results: results.map((x: any) => ({
    name: x.name, admin: x.admin1 ?? '', country: x.country_code, countryName: x.country,
    latitude: x.latitude, longitude: x.longitude, timezone: x.timezone, postcode: x.postcodes?.[0] ?? '',
  })) })
})

app.post('/api/log', async (c) => {
  const body = await c.req.json<{ message?: string }>().catch(() => ({ message: undefined }))
  if (body.message) await logError(c.env, 'ipad', body.message)
  return c.json({ ok: true })
})

app.get('/health', async (c) => {
  const keys = Object.keys(SOURCES) as SourceKey[]
  const slots = await Promise.all(keys.map((k) => readSlot<any>(c.env, k)))
  const sources = Object.fromEntries(keys.map((k, i) => [k, {
    updatedAt: slots[i]?.updatedAt ? new Date(slots[i]!.updatedAt!).toISOString() : null,
    error: slots[i]?.error ?? null,
  }]))
  // Errors only (no calendar or news content) so this page is safe to leave reachable.
  return c.json({ now: new Date().toISOString(), sources, errors: await recentErrors(c.env) })
})

// ---------- Sonos & Hue ----------

const fail = (c: any, e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  return c.json({ error: msg }, msg === 'not_connected' ? 409 : 502)
}

app.get('/api/sonos', async (c) => { if (config.modules.music === false) return c.json({ configured: false, connected: false }); try { return c.json(await sonosState(c.env)) } catch (e) { return fail(c, e) } })
app.post('/api/sonos/:group/:action', async (c) => {
  try {
    await sonosAction(c.env, c.req.param('group'), c.req.param('action'), await c.req.json().catch(() => ({})))
    return c.json({ ok: true })
  } catch (e) { return fail(c, e) }
})

app.get('/api/hue', async (c) => { if (config.modules.lights === false) return c.json({ configured: false, connected: false }); try { return c.json(await hueState(c.env)) } catch (e) { return fail(c, e) } })
app.post('/api/hue/:action/:id', async (c) => {
  try {
    await hueAction(c.env, c.req.param('action'), c.req.param('id'), await c.req.json().catch(() => ({})))
    return c.json({ ok: true })
  } catch (e) { return fail(c, e) }
})

const providers: Record<string, Provider> = { sonos: sonosProvider, hue: hueProvider }

app.get('/auth/:svc/start', async (c) => {
  const p = providers[c.req.param('svc')]
  if (!p?.clientId(c.env)) return c.html(page('Not set up', '<p>Add the developer client id and secret first (see SETUP.md).</p>'), 400)
  return c.redirect(await startUrl(c.env, p, new URL(c.req.url).origin))
})

app.get('/auth/:svc/callback', async (c) => {
  const p = providers[c.req.param('svc')]
  const { code, state, error } = c.req.query()
  if (!p || error || !code || !state) return c.html(page('Sign-in cancelled', `<p>${esc(error ?? 'No code received')}.</p><a href="/">Back to dashboard</a>`), 400)
  try {
    const tok = await finish(c.env, p, new URL(c.req.url).origin, code, state)
    if (p.id === 'hue') await hueRegisterApp(c.env, tok)
    return c.html(page('Connected', `<p>${p.id === 'hue' ? 'Philips Hue' : 'Sonos'} is connected.</p><a href="/">Back to dashboard</a>`))
  } catch (e) {
    await logError(c.env, 'server', `oauth ${p.id}: ${e}`)
    return c.html(page('Sign-in failed', `<p>${esc(String(e))}</p><a href="/auth/${p.id}/start">Try again</a>`), 500)
  }
})

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

// The pairing pages, in the dashboard's own look (Stubli's colours and Figtree), light and dark.
function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
@font-face{font-family:Figtree;src:url('/fonts/Figtree-Variable.woff2') format('woff2');font-weight:300 900;font-display:swap}
:root{--bg:#efede9;--card:#fbfaf8;--ink:#22201d;--muted:#625d57;--line:#e2ddd4;--accent:#4f6a4a;--accent-ink:#fff;--field:#e6e1d8}
@media (prefers-color-scheme:dark){:root{--bg:#1c1916;--card:#28231e;--ink:#ece4d8;--muted:#aa9e90;--line:#352d25;--accent:#a8bf98;--accent-ink:#1c1916;--field:#3a2f26}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--bg);color:var(--ink);font:17px/1.45 Figtree,-apple-system,system-ui,sans-serif}
main{width:100%;max-width:30rem;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:32px}
h1{margin:0 0 12px;font-size:1.6rem;font-weight:650;letter-spacing:-0.01em}p{margin:0 0 16px;color:var(--muted)}small{color:var(--muted)}
label{display:block;font-weight:600;margin:8px 0 6px}
input{font:inherit;display:block;width:100%;padding:14px 16px;border-radius:12px;border:1px solid var(--line);background:var(--field);color:var(--ink)}
input:focus{outline:3px solid var(--accent);outline-offset:1px}
button{font:inherit;font-weight:600;display:block;width:100%;min-height:52px;margin:16px 0;border:0;border-radius:999px;background:var(--accent);color:var(--accent-ink);cursor:pointer}
a{color:var(--accent);font-weight:600}
details{margin-top:8px;color:var(--muted)}summary{cursor:pointer;font-weight:600;color:var(--ink);min-height:44px;display:flex;align-items:center}
.brand{display:flex;align-items:baseline;gap:.3em;margin:0 0 20px;font-size:1.5rem;font-weight:600;letter-spacing:-0.035em;color:var(--accent)}
.brand svg{width:.56em;height:.75em;transform:translateY(.04em)}.brand small{font-size:1rem;letter-spacing:0;color:var(--muted);font-weight:500;margin-left:.2em}
.wink{transform-box:fill-box;transform-origin:center;animation:wink .4s ease-in-out .9s 1}@keyframes wink{50%{transform:scaleY(.1)}}
@media (prefers-reduced-motion:reduce){.wink{animation:none}}
</style></head><body><main>
<p class="brand" role="img" aria-label="Stubli Home"><span aria-hidden="true">st<svg viewBox="0 0 60 80"><path d="M10.5 35.5V52a19.5 19.5 0 0 0 39 0V35.5" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round"/><circle cx="19" cy="15" r="6.2" fill="currentColor"/><circle class="wink" cx="41" cy="15" r="6.2" fill="currentColor"/></svg>bli</span><small aria-hidden="true">Home</small></p>
<h1>${title}</h1>${body}</main></body></html>`
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    await applySettings(env)
    if (event.cron === '*/15 * * * *' && !enabled('news')) return
    // News is collected in two halves (see news.ts): first half at :00/:15/:30/:45, rest + stories two minutes later.
    if (event.cron === '*/15 * * * *') return ctx.waitUntil(collectNewsBatch(env, 0).then(() => {}))
    const which: SourceKey | undefined =
      event.cron === '2,17,32,47 * * * *' ? 'news' : event.cron === '5,20,35,50 * * * *' ? 'calendar' : event.cron === '10,25,40,55 * * * *' ? 'weather' : undefined
    if (which && enabled(which)) ctx.waitUntil(SOURCES[which].run(env))
    // Events ride along with the calendar run once an hour (the free plan allows only a few schedules).
    if (event.cron === '5,20,35,50 * * * *' && new Date().getUTCMinutes() === 20) if (enabled('events')) ctx.waitUntil(SOURCES.events.run(env))
  },
} satisfies ExportedHandler<Env>
