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
      id: x.id, name: x.name, image: x.imageUrl ?? x.images?.[0]?.url ?? null, description: x.description ?? x.service?.name ?? '',
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
      art: track?.imageUrl ?? track?.images?.[0]?.url ?? meta.container?.imageUrl ?? meta.container?.images?.[0]?.url ?? null,
      volume: vol.volume ?? null,
      muted: vol.muted ?? false,
      source: meta.container?.name ?? track?.service?.name ?? '',
      position: pb.positionMillis ?? null,
      duration: track?.durationMillis ?? null,
      next: next ? { title: next.name ?? '', artist: next.artist?.name ?? '' } : null,
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
    case 'volume': return post(`/groups/${g}/groupVolume`, { volume: Math.max(0, Math.min(100, Math.round(body.volume))) })
    case 'favorite': return post(`/groups/${g}/favorites`, { favoriteId: String(body.id), playOnCompletion: true, action: 'REPLACE' })
    case 'playlist': return post(`/groups/${g}/playlists`, { playlistId: String(body.id), playOnCompletion: true, action: 'REPLACE' })
    default: throw new Error(`Unknown Sonos action ${action}`)
  }
}
