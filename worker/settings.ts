import config from './config'
import type { Env } from './store'

// Settings = the defaults in config.ts, overlaid with whatever was saved from the dashboard's
// Settings screen (KV key "settings"). The overlay is applied to the shared `config` object at the
// start of each request, so every module keeps reading `config` as before.
//
// Saving needs a paired device, a Cloudflare Access sign-in, or the SETTINGS_PIN (see canEdit).

const defaults = structuredClone(config)
export const DEFAULTS = defaults
let loadedAt = 0

export const MODULES = ['weather', 'yourDay', 'news', 'whatsOn', 'music', 'lights', 'tablet'] as const
export type ModuleId = (typeof MODULES)[number]

export interface Saved {
  location?: { name: string; latitude: number; longitude: number; timezone: string; country: string; postcode?: string; subdivision?: string }
  modules?: Partial<Record<ModuleId, boolean>>
  columns?: ('yourDay' | 'news' | 'whatsOn')[]
  theme?: 'auto' | 'light' | 'dark'
  paper?: boolean
  feeds?: typeof config.news.feeds
  hiddenCategories?: string[]
  eventKinds?: Partial<typeof config.events.kinds>
  kulturZueri?: boolean
  tabletMusic?: { name: string; list?: string; video?: string }[]
  hiddenCalendars?: string[]
  localEvents?: typeof config.local.events
}

export async function applySettings(env: Env, force = false) {
  if (!force && Date.now() - loadedAt < 30_000) return
  const saved = (await env.KV.get<Saved>('settings', 'json')) ?? {}
  // Start from the defaults every time, so removed overrides really go away.
  const fresh = structuredClone(defaults)
  if (saved.location) {
    const l = saved.location
    fresh.location = { ...fresh.location, name: l.name, latitude: l.latitude, longitude: l.longitude, country: l.country, meteoswissPoint: l.country === 'CH' && l.postcode ? `${l.postcode}00` : '' }
    fresh.timezone = l.timezone
    if (l.subdivision) fresh.local.subdivision = l.subdivision
  }
  if (saved.modules) fresh.modules = { ...fresh.modules, ...saved.modules }
  if (saved.columns?.length) fresh.columns = saved.columns
  if (saved.theme) fresh.display.theme = saved.theme
  if (saved.paper != null) fresh.display.paper = saved.paper
  if (saved.feeds) fresh.news.feeds = saved.feeds
  if (saved.hiddenCategories) fresh.news.categories = fresh.news.categories.filter((c) => !saved.hiddenCategories!.includes(c.id))
  if (saved.eventKinds) fresh.events.kinds = { ...fresh.events.kinds, ...saved.eventKinds }
  if (saved.kulturZueri != null) fresh.events.kulturZueri = saved.kulturZueri
  if (saved.tabletMusic) fresh.tabletMusic = saved.tabletMusic
  // Things that follow the location: the Local news card's name, the city as a ranking keyword,
  // and no Local card at all until a country is set.
  const country = fresh.location.country
  let countryName = ''
  try { countryName = country ? new Intl.DisplayNames(['en'], { type: 'region' }).of(country) ?? country : '' } catch { countryName = country }
  fresh.news.categories = fresh.news.categories
    .filter((c) => c.id !== 'local' || country)
    .map((c) => (c.id === 'local' ? { ...c, name: countryName } : c))
  if (fresh.location.name) fresh.news.ranking.keywordBoost = [...fresh.news.ranking.keywordBoost, fresh.location.name, fresh.location.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
  if (saved.hiddenCalendars) fresh.calendar.hidden = saved.hiddenCalendars
  if (saved.localEvents) fresh.local.events = saved.localEvents
  for (const k of Object.keys(config) as (keyof typeof config)[]) (config as any)[k] = (fresh as any)[k]
  loadedAt = Date.now()
}

export async function readSaved(env: Env) {
  return (await env.KV.get<Saved>('settings', 'json')) ?? {}
}

export async function saveSettings(env: Env, patch: Saved) {
  const current = await readSaved(env)
  const next: Saved = { ...current }
  // Only known keys, lightly validated.
  if (patch.location) {
    const l = patch.location
    if (typeof l.name !== 'string' || !isFinite(l.latitude) || !isFinite(l.longitude) || !l.timezone) throw new Error('Invalid location')
    next.location = { name: l.name.slice(0, 60), latitude: +l.latitude, longitude: +l.longitude, timezone: String(l.timezone), country: String(l.country ?? '').slice(0, 2).toUpperCase(), postcode: l.postcode ? String(l.postcode).slice(0, 10) : undefined, subdivision: l.subdivision ? String(l.subdivision).slice(0, 10) : undefined }
  }
  if (patch.modules) next.modules = Object.fromEntries(MODULES.filter((m) => m in patch.modules!).map((m) => [m, !!patch.modules![m]]))
  if (patch.columns) next.columns = patch.columns.filter((c) => ['yourDay', 'news', 'whatsOn'].includes(c)).slice(0, 3) as Saved['columns']
  if (patch.theme && ['auto', 'light', 'dark'].includes(patch.theme)) next.theme = patch.theme
  if (patch.paper != null) next.paper = !!patch.paper
  if (patch.feeds) {
    next.feeds = patch.feeds
      .filter((f) => f && typeof f.url === 'string' && /^https?:\/\//.test(f.url) && f.name)
      .slice(0, 60)
      .map((f) => ({ name: String(f.name).slice(0, 40), url: f.url, region: f.region === 'Local' || f.category === 'local' ? 'Local' : 'World', ...(f.category ? { category: String(f.category) } : {}), ...(f.lang ? { lang: String(f.lang).slice(0, 5) } : {}) }))
  }
  if (patch.hiddenCategories) next.hiddenCategories = patch.hiddenCategories.map(String).slice(0, 20)
  if (patch.kulturZueri != null) next.kulturZueri = !!patch.kulturZueri
  if (patch.tabletMusic) {
    next.tabletMusic = (patch.tabletMusic as any[]).slice(0, 24).map((m) => {
      const id = m.url ? youTubeId(String(m.url)) : { list: m.list, video: m.video }
      if (!id.list && !id.video) throw new Error("That isn't a YouTube or YouTube Music link to a song, video or playlist.")
      const ok = (s?: string) => (s && /^[\w-]{6,64}$/.test(s) ? s : undefined)
      return { name: String(m.name || 'Music').slice(0, 40), ...(ok(id.list) ? { list: ok(id.list) } : {}), ...(ok(id.video) ? { video: ok(id.video) } : {}) }
    })
  }
  if (patch.eventKinds) next.eventKinds = Object.fromEntries((['music', 'art', 'exhibitions'] as const).filter((k) => k in patch.eventKinds!).map((k) => [k, !!patch.eventKinds![k]]))
  if (patch.hiddenCalendars) next.hiddenCalendars = patch.hiddenCalendars.map(String).slice(0, 20)
  if (patch.localEvents) next.localEvents = patch.localEvents.slice(0, 50) as Saved['localEvents']
  await env.KV.put('settings', JSON.stringify(next))
  await applySettings(env, true)
  return next
}

// youtube.com/watch?v=…&list=…, youtu.be/…, music.youtube.com/playlist?list=…, /shorts/…, /live/…
export function youTubeId(raw: string): { list?: string; video?: string } {
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`) } catch { return {} }
  if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(u.hostname)) return {}
  const list = u.searchParams.get('list') ?? undefined
  let video = u.searchParams.get('v') ?? undefined
  if (u.hostname.endsWith('youtu.be')) video = u.pathname.slice(1).split('/')[0] || video
  const m = /^\/(shorts|live|embed)\/([\w-]+)/.exec(u.pathname)
  if (m) video = m[2]
  return { list, video }
}

export async function resetSettings(env: Env) {
  await env.KV.delete('settings')
  await applySettings(env, true)
}

// Who may change settings. With a SETTINGS_PIN: whoever types it. Without one: any paired device
// (pairing already let it in), or someone signed in through Cloudflare Access.
export function canEdit(req: Request, env: Env) {
  const pin = env.SETTINGS_PIN
  if (pin) return req.headers.get('x-settings-pin') === pin || !!req.headers.get('cf-access-jwt-assertion')
  if (env.ACCESS_PROTECTED === 'true') return !!req.headers.get('cf-access-jwt-assertion')
  return true
}
