import type { Env } from './store'
import { getToken, saveExtra, type Provider, type Token } from './oauth'

// Philips Hue Remote API (cloud), using the bridge's v2 ("CLIP v2") resources.
// Docs: https://developers.meethue.com/develop/hue-api/remote-authentication-oauth/

export const hueProvider: Provider = {
  id: 'hue',
  authorizeUrl: 'https://api.meethue.com/v2/oauth2/authorize',
  tokenUrl: 'https://api.meethue.com/v2/oauth2/token',
  clientId: (env) => env.HUE_CLIENT_ID,
  clientSecret: (env) => env.HUE_CLIENT_SECRET,
}

const ROUTE = 'https://api.meethue.com/route'

// After sign-in the bridge must also issue an "application key" (done once, remotely).
export async function hueRegisterApp(env: Env, tok: Token) {
  const auth = { authorization: `Bearer ${tok.access}`, 'content-type': 'application/json' }
  await fetch(`${ROUTE}/api/0/config`, { method: 'PUT', headers: auth, body: JSON.stringify({ linkbutton: true }) })
  const res = await fetch(`${ROUTE}/api`, { method: 'POST', headers: auth, body: JSON.stringify({ devicetype: 'wall-dashboard#ipad' }) })
  const d: any = await res.json()
  const username = d?.[0]?.success?.username
  if (!username) throw new Error(`Hue app registration failed: ${JSON.stringify(d).slice(0, 200)}`)
  return saveExtra(env, hueProvider, tok, { username })
}

async function clip(env: Env, path: string, init?: RequestInit) {
  const tok = await getToken(env, hueProvider)
  if (!tok?.extra?.username) throw new Error('not_connected')
  const res = await fetch(`${ROUTE}/clip/v2/resource${path}`, {
    ...init,
    headers: { authorization: `Bearer ${tok.access}`, 'hue-application-key': tok.extra.username, 'content-type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Hue ${res.status} ${path}: ${(await res.text()).slice(0, 160)}`)
  return res.json<any>()
}

export async function hueState(env: Env) {
  if (!env.HUE_CLIENT_ID) return { configured: false, connected: false }
  const tok = await getToken(env, hueProvider)
  if (!tok?.extra?.username) return { configured: true, connected: false }
  const [rooms_, lights, scenes, home] = await Promise.all([
    clip(env, '/room'), clip(env, '/grouped_light'), clip(env, '/scene'), clip(env, '/bridge_home'),
  ])
  const light = new Map<string, any>(lights.data.map((l: any) => [l.id, l]))
  const glOf = (svcs: any[]) => svcs?.find((s: any) => s.rtype === 'grouped_light')?.rid
  const homeLight = light.get(glOf(home.data?.[0]?.services))
  const activeMood = homeLight?.on?.on ? await env.KV.get('hue:mood') : null
  return {
    activeMood,
    configured: true,
    connected: true,
    allOffId: homeLight?.id ?? null, // the "whole home" light group
    homeOn: homeLight?.on?.on ?? false,
    homeBrightness: homeLight?.dimming?.brightness ?? null,
    presets: HOME_PRESETS.map((p) => {
      // The gallery scene this mood uses, and how many rooms have it.
      const first = p.colour ? p.scenes.slice(0, -1).find((n) => scenes.data.some((s: any) => (s.metadata?.name ?? '').toLowerCase() === n.toLowerCase())) : null
      const rooms = first ? rooms_.data.length : 0 // missing rooms get the scene's colours copied over
      return { id: p.id, name: p.name, icon: p.icon, tint: p.tint ?? null, scene: first ?? null, rooms }
    }),
    rooms: rooms_.data
      .map((r: any) => {
        const gl = light.get(glOf(r.services))
        const roomScenes = scenes.data.filter((s: any) => s.group?.rid === r.id)
        return {
          id: r.id,
          name: r.metadata?.name ?? 'Room',
          lightId: gl?.id ?? null,
          on: gl?.on?.on ?? false,
          brightness: gl?.dimming?.brightness ?? null,
          scenes: roomScenes
            .map((s: any) => ({ id: s.id, name: s.metadata?.name ?? 'Scene', active: s.status?.active && s.status.active !== 'inactive' }))
            .sort((a: any, b: any) => a.name.localeCompare(b.name)),
        }
      })
      .sort((a: any, b: any) => a.name.localeCompare(b.name)),
  }
}

// Whole-home presets: recall the first matching scene in every room, so one tap sets the house.
// Whole-home moods: each recalls the first matching scene in every room. White moods use Hue's
// standard scenes; colour moods use Hue app gallery scenes, renamed by feeling. Rooms that don't
// have that gallery scene yet fall back to a calm white (add the scene to the room in the Hue app).
type Mood = { id: string; name: string; icon: string; scenes: string[]; colour?: boolean; tint?: string }
export const HOME_PRESETS: Mood[] = [
  { id: 'energised', name: 'Energised', icon: '☀️', scenes: ['Energize', 'Bright', 'Concentrate'] },
  { id: 'focused', name: 'Focused', icon: '🎯', scenes: ['Concentrate', 'Read', 'Bright'] },
  { id: 'relaxed', name: 'Relaxed', icon: '🛋️', scenes: ['Relax', 'Rest'] },
  { id: 'cosy', name: 'Cosy', icon: '🕯️', scenes: ['Dimmed', 'Rest', 'Nightlight'] },
  { id: 'sleepy', name: 'Sleepy', icon: '🌛', scenes: ['Nightlight', 'Rest'] },
  { id: 'cheerful', name: 'Cheerful', icon: '🌸', colour: true, tint: '#e98bb0', scenes: ['Spring blossom', 'Fairfax', 'Relax'] },
  { id: 'calm', name: 'Calm', icon: '🌊', colour: true, tint: '#4fa3c7', scenes: ['Arctic aurora', 'Relax'] },
  { id: 'romantic', name: 'Romantic', icon: '🌹', colour: true, tint: '#e0703a', scenes: ['Savanna sunset', 'Relax'] },
  { id: 'dreamy', name: 'Dreamy', icon: '🌙', colour: true, tint: '#6a5bd6', scenes: ['Galaxy', 'Tropical twilight', 'Relax'] },
  { id: 'playful', name: 'Playful', icon: '🎉', colour: true, tint: '#c64fb8', scenes: ['Fairfax', 'Indie Mood', 'Colorful Relax', 'Energize'] },
]

async function homePreset(env: Env, presetId: string) {
  const preset = HOME_PRESETS.find((p) => p.id === presetId)
  if (!preset) throw new Error(`Unknown preset ${presetId}`)
  const [rooms, scenes, devices] = await Promise.all([clip(env, '/room'), clip(env, '/scene'), clip(env, '/device')])
  const named = (name: string) => scenes.data.filter((s: any) => (s.metadata?.name ?? '').toLowerCase() === name.toLowerCase())
  const sceneIn = (roomId: string, names: string[]) => {
    for (const n of names) { const hit = named(n).find((s: any) => s.group?.rid === roomId); if (hit) return hit }
    return null
  }
  // Colour moods: the gallery scene (e.g. Galaxy) wherever it exists, and its colours to copy elsewhere.
  const gallery = preset.colour ? preset.scenes.slice(0, -1).map((n) => named(n)[0]).find(Boolean) : null
  const palette = gallery ? sceneColours(gallery) : []
  const lightsOf = (room: any) => (room.children ?? [])
    .filter((c: any) => c.rtype === 'device')
    .flatMap((c: any) => devices.data.find((d: any) => d.id === c.rid)?.services ?? [])
    .filter((sv: any) => sv.rtype === 'light')
    .map((sv: any) => sv.rid as string)

  const calls: Promise<any>[] = []
  for (const room of rooms.data) {
    const own = sceneIn(room.id, preset.colour ? preset.scenes.slice(0, -1) : preset.scenes)
    if (own) { calls.push(recall(env, own.id)); continue }
    if (palette.length) {
      // No such scene in this room: give each of its lights one of the gallery scene's colours.
      lightsOf(room).forEach((lightId: string, i: number) => {
        const c = palette[i % palette.length]
        calls.push(clip(env, `/light/${encodeURIComponent(lightId)}`, { method: 'PUT', body: JSON.stringify({ on: { on: true }, dimming: { brightness: c.bri }, color: { xy: c.xy } }) })
          // White-only bulbs reject colour; give them a warm white at the same brightness.
          .catch(() => clip(env, `/light/${encodeURIComponent(lightId)}`, { method: 'PUT', body: JSON.stringify({ on: { on: true }, dimming: { brightness: c.bri }, color_temperature: { mirek: 400 } }) })))
      })
      continue
    }
    const fallback = sceneIn(room.id, preset.scenes.slice(-1))
    if (fallback) calls.push(recall(env, fallback.id))
  }
  await Promise.all(calls)
}

const recall = (env: Env, sceneId: string) =>
  clip(env, `/scene/${encodeURIComponent(sceneId)}`, { method: 'PUT', body: JSON.stringify({ recall: { action: 'active' } }) })

// The colours a scene uses: its palette if it has one, otherwise the colours set on its lights.
function sceneColours(scene: any): { xy: { x: number; y: number }; bri: number }[] {
  const fromPalette = (scene.palette?.color ?? []).map((c: any) => ({ xy: c.color?.xy, bri: c.dimming?.brightness ?? scene.palette?.dimming?.[0]?.brightness ?? 60 }))
  const fromActions = (scene.actions ?? []).filter((a: any) => a.action?.color?.xy).map((a: any) => ({ xy: a.action.color.xy, bri: a.action.dimming?.brightness ?? 60 }))
  return (fromPalette.length ? fromPalette : fromActions).filter((c: any) => c.xy)
}

export async function hueAction(env: Env, action: string, id: string, body: any) {
  // Any manual change means the house is no longer in a named mood.
  if (action !== 'preset') await env.KV.delete('hue:mood')
  const put = (path: string, data: any) => clip(env, path, { method: 'PUT', body: JSON.stringify(data) })
  const gl = encodeURIComponent(id)
  switch (action) {
    case 'power': return put(`/grouped_light/${gl}`, { on: { on: !!body.on } })
    case 'brightness': {
      const b = Math.max(1, Math.min(100, Number(body.brightness)))
      return put(`/grouped_light/${gl}`, { on: { on: true }, dimming: { brightness: b } })
    }
    case 'scene': return put(`/scene/${gl}`, { recall: { action: 'active' } })
    case 'preset': {
      await homePreset(env, id)
      await env.KV.put('hue:mood', id) // remembered so the dashboard can show which mood is on
      return
    }
    default: throw new Error(`Unknown Hue action ${action}`)
  }
}
