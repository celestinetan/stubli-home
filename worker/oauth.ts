import type { Env } from './store'

// OAuth 2 "authorization code" sign-in shared by Sonos and Hue. Tokens live in KV.

export interface Provider {
  id: 'sonos' | 'hue'
  authorizeUrl: string
  tokenUrl: string
  scope?: string
  clientId: (env: Env) => string | undefined
  clientSecret: (env: Env) => string | undefined
}

export interface Token { access: string; refresh: string; expires: number; extra?: Record<string, string> }

const redirectUri = (origin: string, p: Provider) => `${origin}/auth/${p.id}/callback`

export async function startUrl(env: Env, p: Provider, origin: string) {
  const state = crypto.randomUUID()
  await env.KV.put(`oauth_state:${state}`, p.id, { expirationTtl: 600 })
  const q = new URLSearchParams({ client_id: p.clientId(env)!, response_type: 'code', state, redirect_uri: redirectUri(origin, p) })
  if (p.scope) q.set('scope', p.scope)
  return `${p.authorizeUrl}?${q}`
}

export async function finish(env: Env, p: Provider, origin: string, code: string, state: string) {
  if ((await env.KV.get(`oauth_state:${state}`)) !== p.id) throw new Error('Sign-in expired, please try again')
  await env.KV.delete(`oauth_state:${state}`)
  return saveToken(env, p, await tokenRequest(env, p, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(origin, p) }))
}

export async function getToken(env: Env, p: Provider): Promise<Token | null> {
  const tok = await env.KV.get<Token>(`token:${p.id}`, 'json')
  if (!tok) return null
  if (tok.expires - 120_000 > Date.now()) return tok
  const fresh = await tokenRequest(env, p, { grant_type: 'refresh_token', refresh_token: tok.refresh })
  return saveToken(env, p, fresh, tok.extra)
}

export async function saveExtra(env: Env, p: Provider, tok: Token, extra: Record<string, string>) {
  const next = { ...tok, extra: { ...tok.extra, ...extra } }
  await env.KV.put(`token:${p.id}`, JSON.stringify(next))
  return next
}

async function tokenRequest(env: Env, p: Provider, form: Record<string, string>) {
  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + btoa(`${p.clientId(env)}:${p.clientSecret(env)}`),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form),
  })
  if (!res.ok) throw new Error(`${p.id} token ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json<{ access_token: string; refresh_token?: string; expires_in: number }>()
}

async function saveToken(env: Env, p: Provider, t: { access_token: string; refresh_token?: string; expires_in: number }, extra?: Record<string, string>) {
  const prev = await env.KV.get<Token>(`token:${p.id}`, 'json')
  const tok: Token = {
    access: t.access_token,
    refresh: t.refresh_token ?? prev?.refresh ?? '',
    expires: Date.now() + t.expires_in * 1000,
    extra: extra ?? prev?.extra,
  }
  await env.KV.put(`token:${p.id}`, JSON.stringify(tok))
  return tok
}
