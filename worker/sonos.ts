import type { Env } from './store'
import { getToken, type Provider } from './oauth'

// Sonos Control API (cloud). Docs: https://docs.sonos.com/docs/control

export const sonosProvider: Provider = {
  id: 'sonos',
  authorizeUrl: 'https://api.sonos.com/login/v3/oauth',
  tokenUrl: 'https://api.sonos.com/login/v3/oauth/access',
  scope: 'playback-control-all',
  clientId: (env) => env.SONOS_CLIENT_ID,
  clientSecret: (env) => env.SONOS_CLIENT_SECRET,
}

const API = 'https://api.ws.sonos.com/control/api/v1'

async function call(env: Env, path: string, init?: RequestInit) {
  const tok = await getToken(env, sonosProvider)
  if (!tok) throw new Error('not_connected')
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${tok.access}`, 'content-type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Sonos ${res.status} ${path}: ${(await res.text()).slice(0, 160)}`)
  return res.status === 204 ? {} : res.json<any>()
}

// Album covers. Sonos often gives artwork as a link to the speaker itself (http://192.168…:1400),
// which neither a secure page nor this server can reach, or a plain http link a secure page won't
// load. So: https links are used as they are; public http links go through /api/art; for the
// rest, /api/art looks the cover up in Apple's free iTunes Search (artist and album or title).
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?fe80|.*\.local$)/i
export function artUrl(src: string | null | undefined, find: { artist?: string; album?: string; title?: string; term?: string }) {
  if (src?.startsWith('https://')) return src
  if (src?.startsWith('http://')) {
    try { if (!PRIVATE.test(new URL(src).hostname)) return `/api/art?u=${encodeURIComponent(src)}` } catch {}
  }
  const term = find.term ?? [find.artist, find.album || find.title].filter(Boolean).join(' ')
  return term.trim() ? `/api/art?${new URLSearchParams({ q: term.trim(), kind: find.term || !find.album ? 'song' : 'album' })}` : null
}

// Households and favourites rarely change; cache them in the isolate for a few minutes.
let cache: { at: number; household: string; favorites: any[]; playlists: any[] } | null = null

async function household(env: Env) {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache
  const h = await call(env, '/households')
  const id = h.households?.[0]?.id
  if (!id) throw new Error('No Sonos household found')
  const [f, p] = await Promise.all([
    call(env, `/households/${id}/favorites`),
    call(env, `/households/${id}/playlists`).catch(() => ({ playlists: [] })),
  ])
  cache = {
    at: Date.now(),
    household: id,
    favorites: (f.items ?? []).map((x: any) => ({
      id: x.id, name: x.name, image: artUrl(x.imageUrl ?? x.images?.[0]?.url, { term: x.name }), description: x.description ?? x.service?.name ?? '',
    })),
    playlists: (p.playlists ?? []).map((x: any) => ({ id: x.id, name: x.name, tracks: x.trackCount ?? null })),
  }
  return cache
}

export async function sonosState(env: Env) {
  if (!env.SONOS_CLIENT_ID) return { configured: false, connected: false }
  if (!(await getToken(env, sonosProvider))) return { configured: true, connected: false }
  const h = await household(env)
  const g = await call(env, `/households/${h.household}/groups`)
  const players = new Map<string, string>((g.players ?? []).map((p: any) => [p.id, p.name]))
  const groups = await Promise.all((g.groups ?? []).map(async (grp: any) => {
    const [meta, vol, pb] = await Promise.all([
      call(env, `/groups/${grp.id}/playbackMetadata`).catch(() => ({})),
      call(env, `/groups/${grp.id}/groupVolume`).catch(() => ({})),
      call(env, `/groups/${grp.id}/playback`).catch(() => ({})),
    ])
    const track = meta.currentItem?.track
    const next = meta.nextItem?.track
    return {
      id: grp.id,
      name: (grp.playerIds ?? []).map((id: string) => players.get(id)).filter(Boolean).join(' + ') || grp.name,
      state: grp.playbackState ?? 'PLAYBACK_STATE_IDLE', // PLAYING | PAUSED | IDLE | BUFFERING
      title: track?.name ?? meta.container?.name ?? '',
      artist: track?.artist?.name ?? '',
      album: track?.album?.name ?? '',
      art: artUrl(track?.imageUrl ?? track?.images?.[0]?.url ?? meta.container?.imageUrl ?? meta.container?.images?.[0]?.url,
        { artist: track?.artist?.name, album: track?.album?.name, title: track?.name ?? meta.container?.name }),
      volume: vol.volume ?? null,
      muted: vol.muted ?? false,
      source: meta.container?.name ?? track?.service?.name ?? '',
      position: pb.positionMillis ?? null,
      duration: track?.durationMillis ?? null,
      next: next ? { title: next.name ?? '', artist: next.artist?.name ?? '' } : null,
      shuffle: !!pb.playModes?.shuffle,
      canShuffle: pb.availablePlaybackActions?.canShuffle !== false, // radio, for one, can't shuffle
    }
  }))
  return { configured: true, connected: true, groups, favorites: h.favorites, playlists: h.playlists }
}

export async function sonosAction(env: Env, groupId: string, action: string, body: any) {
  const g = encodeURIComponent(groupId)
  const post = (path: string, data?: any) => call(env, path, { method: 'POST', body: JSON.stringify(data ?? {}) })
  switch (action) {
    case 'toggle': return post(`/groups/${g}/playback/togglePlayPause`)
    case 'next': return post(`/groups/${g}/playback/skipToNextTrack`)
    case 'previous': return post(`/groups/${g}/playback/skipToPreviousTrack`)
    case 'shuffle': return post(`/groups/${g}/playback/playMode`, { playModes: { shuffle: !!body.on } })
    case 'volume': return post(`/groups/${g}/groupVolume`, { volume: Math.max(0, Math.min(100, Math.round(body.volume))) })
    case 'favorite': return post(`/groups/${g}/favorites`, { favoriteId: String(body.id), playOnCompletion: true, action: 'REPLACE' })
    case 'playlist': return post(`/groups/${g}/playlists`, { playlistId: String(body.id), playOnCompletion: true, action: 'REPLACE' })
    default: throw new Error(`Unknown Sonos action ${action}`)
  }
}

// /api/art: a public http image passed through, or the first iTunes Search match for a search term.
const found = new Map<string, string | null>() // search term → cover link, for this isolate
export async function artResponse(u: string | undefined, q: string | undefined, kind: string | undefined) {
  const cacheFor = (s: number) => ({ 'Cache-Control': `public, max-age=${s}` })
  if (u) {
    const url = new URL(u)
    if (url.protocol !== 'http:' || PRIVATE.test(url.hostname)) return new Response(null, { status: 400 })
    const res = await fetch(url.toString())
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return new Response(null, { status: 404 })
    return new Response(res.body, { headers: { 'Content-Type': type, ...cacheFor(86400) } })
  }
  if (!q) return new Response(null, { status: 400 })
  const key = `${kind}|${q.toLowerCase()}`
  if (!found.has(key)) {
    const search = new URLSearchParams({ term: q, media: 'music', entity: kind === 'album' ? 'album' : 'song', limit: '1' })
    const r = await fetch(`https://itunes.apple.com/search?${search}`).then((x) => (x.ok ? x.json<any>() : null)).catch(() => null)
    const small: string | undefined = r?.results?.[0]?.artworkUrl100
    found.set(key, small ? small.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null)
  }
  const cover = found.get(key)
  return cover ? new Response(null, { status: 302, headers: { Location: cover, ...cacheFor(604800) } }) : new Response(null, { status: 404, headers: cacheFor(3600) })
}
