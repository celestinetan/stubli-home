export interface Env {
  KV: KVNamespace
  ASSETS: Fetcher
  CALENDAR_FEEDS?: string // JSON: [{ "name": "Personal", "url": "https://calendar.proton.me/..." }]
  GEMINI_API_KEY?: string
  SONOS_CLIENT_ID?: string
  SONOS_CLIENT_SECRET?: string
  HUE_CLIENT_ID?: string
  HUE_CLIENT_SECRET?: string
  PAIRING_SECRET?: string // optional: a pairing code chosen at deploy time (else the first visitor picks one)
  ACCESS_PROTECTED?: string // 'true' when Cloudflare Access guards the dashboard, so no pairing is needed
  SETTINGS_PIN?: string // optional: a PIN needed to save settings, e.g. on a tablet guests can touch
}

// Each data source is stored as one KV entry: the last good data plus refresh status.
export interface Slot<T> {
  data: T | null
  updatedAt: number | null // last successful refresh
  attemptedAt: number
  error?: string
}

export async function readSlot<T>(env: Env, key: string): Promise<Slot<T> | null> {
  return env.KV.get<Slot<T>>(key, 'json')
}

// Runs `fetcher`; on failure keeps the previous data and records the error.
export async function refreshSlot<T>(env: Env, key: string, fetcher: (prev: T | null) => Promise<T>) {
  const prev = await readSlot<T>(env, key)
  const now = Date.now()
  try {
    const data = await fetcher(prev?.data ?? null)
    await env.KV.put(key, JSON.stringify({ data, updatedAt: now, attemptedAt: now } satisfies Slot<T>))
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await env.KV.put(key, JSON.stringify({ data: prev?.data ?? null, updatedAt: prev?.updatedAt ?? null, attemptedAt: now, error }))
    await logError(env, 'server', `${key}: ${error}`)
  }
}

const MAX_ERRORS = 40

export async function logError(env: Env, source: string, message: string) {
  const list = (await env.KV.get<any[]>('errors', 'json')) ?? []
  list.unshift({ at: Date.now(), source, message: message.slice(0, 500) })
  await env.KV.put('errors', JSON.stringify(list.slice(0, MAX_ERRORS)))
}

export async function recentErrors(env: Env) {
  return (await env.KV.get<any[]>('errors', 'json')) ?? []
}

export async function fetchText(url: string, init?: RequestInit) {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': 'Mozilla/5.0 (wall-dashboard)', ...(init?.headers ?? {}) },
    })
  } catch (e) {
    // Never echo the URL: calendar links are secrets.
    throw new Error(e instanceof TypeError && /Invalid URL/i.test(e.message) ? 'Invalid link' : 'Network error')
  }
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`)
  return res.text()
}
