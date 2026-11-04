import { useEffect, useRef, useState, useCallback } from 'preact/hooks'
import { api, report, store } from '../lib.js'
import { Play, Pause, Next, Prev, Close, Bulb, Power, Music, Shuffle } from './icons.jsx'

// ---------- data ----------

function usePoll(path, everyMs) {
  const [state, setState] = useState(null)
  const timer = useRef()
  const load = useCallback(async () => {
    try { setState(await api(path)) }
    catch (e) { if (e.status !== 409) report(`${path}: ${e.message}`); setState((s) => s ?? { error: e.message }) }
  }, [path])
  useEffect(() => {
    load()
    timer.current = setInterval(() => { if (!document.hidden) load() }, everyMs)
    return () => clearInterval(timer.current)
  }, [load, everyMs])
  return [state, load, setState]
}

export function useHome(sheetOpen) {
  const [sonos, reloadSonos, setSonos] = usePoll('/api/sonos', sheetOpen ? 5000 : 15000)
  const [hue, reloadHue, setHue] = usePoll('/api/hue', sheetOpen ? 10000 : 30000)
  const [groupId, setGroupId] = useState(() => store.get('sonosGroup', null))
  const groups = sonos?.groups ?? []
  const group = groups.find((g) => g.id === groupId) ?? groups.find((g) => g.state === 'PLAYBACK_STATE_PLAYING') ?? groups[0]
  const pick = (id) => { setGroupId(id); store.set('sonosGroup', id) }

  // `pending` holds the key of each control waiting for the cloud, so it can show it's working.
  const [pending, setPending] = useState({})
  const run = async (key, path, body, label, reload) => {
    setPending((p) => ({ ...p, [key]: true }))
    try { await api(path, { method: 'POST', body }) }
    catch (e) {
      report(`${path}: ${e.message}`)
      window.dispatchEvent(new CustomEvent('toast', { detail: `Couldn't reach ${label}. Try again in a moment.` }))
    }
    setPending((p) => { const n = { ...p }; delete n[key]; return n })
    setTimeout(reload, 700)
  }
  const sonosDo = (gid, action, body, optimistic) => {
    if (optimistic) setSonos((s) => ({ ...s, groups: s.groups.map((g) => (g.id === gid ? { ...g, ...optimistic } : g)) }))
    return run(`${gid}:${action}`, `/api/sonos/${encodeURIComponent(gid)}/${action}`, body, 'Sonos', reloadSonos)
  }
  const hueDo = (action, id, body, optimistic, homePatch) => {
    if (action !== 'preset') homePatch = { ...homePatch, activeMood: null }
    if (optimistic || homePatch) setHue((h) => ({ ...h, ...homePatch, rooms: optimistic ? h.rooms.map(optimistic) : h.rooms }))
    return run(`${action}:${id}`, `/api/hue/${action}/${encodeURIComponent(id)}`, body, 'Hue', reloadHue)
  }
  const busy = (key) => (pending[key] ? 'pending' : '')

  // Recently played: Sonos doesn't share its own history with other apps, so this tablet keeps one:
  // what you start here, and any favourite or Sonos playlist it sees playing (by name). Kept only
  // in this tablet's storage, newest first.
  const [recents, setRecents] = useState(() => store.get('sonosRecents', []))
  const remember = (kind, x) => setRecents((r) => {
    const next = [{ kind, id: x.id, name: x.name, image: x.image ?? null, description: x.description ?? '', at: Date.now() }, ...r.filter((y) => !(y.kind === kind && y.id === x.id))].slice(0, 12)
    store.set('sonosRecents', next)
    return next
  })
  const source = group?.source?.toLowerCase()
  useEffect(() => {
    if (!source || !playing(group)) return
    const fav = sonos?.favorites?.find((f) => f.name.toLowerCase() === source)
    const list = !fav && sonos?.playlists?.find((p) => p.name.toLowerCase() === source)
    if (fav) remember('favorite', fav)
    else if (list) remember('playlist', { ...list, image: group.art, description: 'Sonos playlist' })
  }, [source, group?.state])
  // Opening the music panel fetches favourites and playlists afresh (see worker/sonos.ts).
  const refreshSonos = () => api('/api/sonos?fresh=1').then(setSonos).catch(() => {})
  return { sonos, hue, group, groups, pick, sonosDo, hueDo, busy, recents, remember, refreshSonos }
}

const playing = (g) => g?.state === 'PLAYBACK_STATE_PLAYING' || g?.state === 'PLAYBACK_STATE_BUFFERING'

// ---------- bottom bar ----------

export function HomeBar({ home, barScenes, onMusic, onLights, tablet }) {
  const { sonos, hue, group, sonosDo, hueDo, busy } = home
  const quick = resolveScenes(hue, barScenes)
  // Modules that aren't set up take no space; with none, there's no bar at all.
  // Without Sonos, music on the tablet itself (YouTube) takes its place.
  if (sonos && hue && !sonos.configured && !hue.configured && !tablet) return null
  return (
    <footer class="bar">
      <div class="np">
        {!sonos?.configured ? tablet ?? null
          : !sonos.connected ? <a class="btn" href="/auth/sonos/start"><Music size={20} /> Connect Sonos</a>
          : group ? (
            <>
              {/* The whole now-playing area opens the music panel. */}
              <button class="np-open" onClick={onMusic} aria-label="Open music">
                <Art group={group} />
                <span class="np-text">
                  <span class="np-title-row"><Eq on={playing(group)} /><Marquee class="np-title" text={group.title || 'Nothing playing'} /></span>
                  <span class="np-room">{group.artist ? `${group.artist} · ` : ''}{group.name}</span>
                </span>
              </button>
              <button class={`icon-btn big ${busy(`${group.id}:toggle`)}`} aria-label={playing(group) ? 'Pause' : 'Play'}
                onClick={() => sonosDo(group.id, 'toggle', null, { state: playing(group) ? 'PLAYBACK_STATE_PAUSED' : 'PLAYBACK_STATE_PLAYING' })}>
                {playing(group) ? <Pause /> : <Play />}
              </button>
              <button class="icon-btn" aria-label="Next track" onClick={() => sonosDo(group.id, 'next')}><Next /></button>
            </>
          ) : <span class="muted small">No speakers found</span>}
      </div>

      <div class="quick">
        {!hue?.configured ? null
          : !hue.connected ? <a class="btn" href="/auth/hue/start"><Bulb size={20} /> Connect Hue</a>
          : (
            <>
              {/* Room scenes from config if set; otherwise the whole-home presets. */}
              {!quick.length && (hue.presets ?? []).filter((p) => BAR_MOODS.includes(p.id)).map((p) => (
                <button class={`chip ${hue.activeMood === p.id ? 'on' : ''} ${busy(`preset:${p.id}`)}`} aria-pressed={hue.activeMood === p.id} key={p.id} onClick={() => hueDo('preset', p.id, null, (r) => ({ ...r, on: true }), { activeMood: p.id, homeOn: true })}>
                  <span aria-hidden="true">{p.icon}</span> {p.name}
                </button>
              ))}
              {quick.map((q) => (
                <button class={`chip ${q.scene.active ? 'on' : ''} ${busy(`scene:${q.scene.id}`)}`} key={q.scene.id} onClick={() => hueDo('scene', q.scene.id, null)} aria-label={`${q.scene.name} in ${q.room.name}`}>
                  {q.room.name} {q.scene.name}
                </button>
              ))}
              {hue.allOffId && (
                <button class={`chip ${busy(`power:${hue.allOffId}`)}`} onClick={() => hueDo('power', hue.allOffId, { on: false }, (r) => ({ ...r, on: false }))}><Power size={18} /> Off</button>
              )}
            </>
          )}
      </div>

      {hue?.connected && <button class="btn home-btn" onClick={onLights}><Bulb size={20} /> Lights</button>}
    </footer>
  )
}

const BAR_MOODS = ['relaxed', 'cosy', 'sleepy'] // whole-home moods on the bottom bar

function resolveScenes(hue, barScenes) {
  if (!hue?.rooms) return []
  return (barScenes ?? []).map(({ room, scene }) => {
    const r = hue.rooms.find((x) => x.name.toLowerCase() === room.toLowerCase())
    const s = r?.scenes.find((x) => x.name.toLowerCase() === scene.toLowerCase())
    return r && s ? { room: r, scene: s } : null
  }).filter(Boolean)
}

const mmss = (ms) => (ms == null ? '' : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`)

// ---------- music: now playing on the left, "play something" with search on the right ----------

// tablet: music that plays on the tablet itself (YouTube links from Settings → Music), offered as a
// third tab beside the Sonos favourites and playlists.
export function MusicSheet({ home, onClose, closing, tablet, tabletLinks = [] }) {
  const { sonos, group, groups, pick, sonosDo, busy, recents, remember, refreshSonos } = home
  useEffect(() => { refreshSonos() }, [])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(() => (recents.length ? 'recent' : 'favourites'))
  const q = query.trim().toLowerCase()
  const match = (x) => !q || `${x.name} ${x.description ?? ''}`.toLowerCase().includes(q)
  const favs = (sonos?.favorites ?? []).filter(match)
  // Sonos playlists aren't a tab of their own: they turn up in Recently played once played, and in search.
  const lists = (sonos?.playlists ?? []).map((p) => ({ ...p, kind: 'playlist', description: 'Sonos playlist' })).filter(match)
  const recent = recents.filter(match)
  const onTablet = tabletLinks.map((l, i) => ({ ...l, id: `yt${i}`, description: l.list ? 'Playlist' : 'Song or video' })).filter(match)
  const items = tab === 'tablet' ? onTablet : tab === 'recent' ? recent
    : q ? [...favs.map((f) => ({ ...f, kind: 'favorite' })), ...lists] : favs.map((f) => ({ ...f, kind: 'favorite' }))
  const play = (x) => {
    if (tab === 'tablet') {
      tablet.play(x); onClose()
      window.dispatchEvent(new CustomEvent('toast', { detail: `Playing ${x.name} on this tablet` }))
      return
    }
    sonosDo(group.id, x.kind, { id: x.id })
    remember(x.kind, x)
    window.dispatchEvent(new CustomEvent('toast', { detail: `Playing ${x.name} in ${group.name}` }))
  }

  return (
    <div class={`overlay slide ${closing ? 'closing' : ''}`} onClick={onClose}>
      <div class="sheet music-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Music">
        <button class="icon-btn close" onClick={onClose} aria-label="Close"><Close /></button>
        {!sonos?.connected || !group ? <Connect svc="sonos" state={sonos} /> : (
          <div class="music-cols">
            <section class="now-playing">
              {groups.length > 1 && (
                <div class="segmented rooms-pick">
                  {groups.map((g) => <button key={g.id} aria-pressed={g.id === group.id} onClick={() => pick(g.id)}>{g.name}</button>)}
                </div>
              )}
              {groups.length === 1 && <p class="muted small np-where">Playing in {group.name}</p>}
              <Cover src={group.art} query={group.artQuery} title={group.title} cls="np-art" size={48} />
              <Eq on={playing(group)} big />
              <h2 class="np-big-title">{group.title || 'Nothing playing'}</h2>
              <p class="muted np-big-artist">{[group.artist, group.album].filter(Boolean).join(' · ') || group.source}</p>
              {group.duration > 0 && (
                <div class="progress" aria-label="Track progress">
                  <span style={{ width: `${Math.min(100, ((group.position ?? 0) / group.duration) * 100)}%` }} />
                </div>
              )}
              <div class="np-controls">
                <button class="icon-btn" aria-label="Previous" onClick={() => sonosDo(group.id, 'previous')}><Prev size={28} /></button>
                <button class={`icon-btn huge ${busy(`${group.id}:toggle`)}`} aria-label={playing(group) ? 'Pause' : 'Play'}
                  onClick={() => sonosDo(group.id, 'toggle', null, { state: playing(group) ? 'PLAYBACK_STATE_PAUSED' : 'PLAYBACK_STATE_PLAYING' })}>
                  {playing(group) ? <Pause size={32} /> : <Play size={32} />}
                </button>
                <button class="icon-btn" aria-label="Next" onClick={() => sonosDo(group.id, 'next')}><Next size={28} /></button>
                {group.canShuffle && (
                  <button class={`icon-btn shuffle ${group.shuffle ? 'on' : ''} ${busy(`${group.id}:shuffle`)}`} aria-label="Shuffle" aria-pressed={!!group.shuffle}
                    onClick={() => sonosDo(group.id, 'shuffle', { on: !group.shuffle }, { shuffle: !group.shuffle })}><Shuffle size={24} /></button>
                )}
              </div>
              <Slider label="Volume" value={group.volume ?? 0} onCommit={(v) => sonosDo(group.id, 'volume', { volume: v }, { volume: v })} />
              {group.next?.title && (
                <p class="up-next"><span class="muted">Up next</span> {group.next.title}{group.next.artist ? ` — ${group.next.artist}` : ''}</p>
              )}
            </section>

            <section class="library">
              <h2>Play something</h2>
              <input class="search" type="search" placeholder={tabletLinks.length ? 'Search favourites, playlists and tablet music' : 'Search favourites and playlists'} value={query}
                onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Search favourites and playlists" />
              <div class="segmented">
                <button aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>Recently played · {recent.length}</button>
                <button aria-pressed={tab === 'favourites'} onClick={() => setTab('favourites')}>Favourites · {favs.length}</button>
                {tabletLinks.length > 0 && <button aria-pressed={tab === 'tablet'} onClick={() => setTab('tablet')}>On this tablet · {onTablet.length}</button>}
              </div>
              <div class="tiles">
                {items.length === 0 && <p class="muted">{q ? `Nothing matches “${query}”.` : tab === 'tablet' ? 'Nothing yet. Add YouTube or YouTube Music links in Settings → Music.' : tab === 'recent' ? 'Nothing yet. What you play from here, and favourites you play in the Sonos app, show up here.' : 'No favourites yet. Add them in the Sonos app.'}</p>}
                {items.map((x) => (
                  <button class={`tile ${tab === 'tablet' ? '' : busy(`${group.id}:${x.kind}`)}`} key={`${x.kind}${x.id}`} onClick={() => play(x)}>
                    <Cover src={x.image} title={x.name} cls="tile-art" ph="tile-ph" />
                    <span class="tile-name">{x.name}</span>
                    {(x.description || x.tracks) && <span class="tile-sub">{x.description || `${x.tracks} tracks`}</span>}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- lights ----------

export function LightsSheet({ home, onClose, closing }) {
  const { hue, hueDo, busy } = home
  return (
    <div class={`overlay slide ${closing ? 'closing' : ''}`} onClick={onClose}>
      <div class="sheet home-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Lights">
        <button class="icon-btn close" onClick={onClose} aria-label="Close"><Close /></button>
        <h2>Lights</h2>
        {!hue?.connected ? <Connect svc="hue" state={hue} /> : (
          <>
          {hue.allOffId && (
            <div class={`card room whole-home ${hue.homeOn ? 'on' : ''}`}>
              <button class={`room-toggle ${busy(`power:${hue.allOffId}`)}`} aria-pressed={hue.homeOn}
                onClick={() => hueDo('power', hue.allOffId, { on: !hue.homeOn }, (x) => ({ ...x, on: !hue.homeOn }), { homeOn: !hue.homeOn })}>
                <span class="card-title">Whole home</span>
                <span class="switch" aria-hidden="true"><span /></span>
              </button>
              <Slider label="Whole home brightness" value={hue.homeOn ? Math.round(hue.homeBrightness ?? 100) : 0} min={1}
                onCommit={(v) => hueDo('brightness', hue.allOffId, { brightness: v }, (x) => ({ ...x, on: true }), { homeOn: true, homeBrightness: v })} />
              <h3 class="moods-title">Moods · whole home <span class="muted">· top row white, bottom row colour scenes from your Hue app</span></h3>
              <div class="presets">
                {(hue.presets ?? []).map((p) => (
                  <button class={`preset ${p.tint ? 'colour' : ''} ${hue.activeMood === p.id ? 'active' : ''} ${busy(`preset:${p.id}`)}`} aria-pressed={hue.activeMood === p.id} style={p.tint ? { '--tint': p.tint } : null} key={p.id} onClick={() => hueDo('preset', p.id, null, (x) => ({ ...x, on: true }), { homeOn: true, activeMood: p.id })}>
                    <span class="preset-icon" aria-hidden="true">{p.icon}</span>{p.name}
                    {p.tint && !p.scene && <span class="preset-scene">Add scene in Hue app</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <h3>Rooms</h3>
          <div class="rooms">
            {hue.rooms.map((r) => (
              <div class={`card room ${r.on ? 'on' : ''}`} key={r.id}>
                <button class={`room-toggle ${busy(`power:${r.lightId}`)}`} disabled={!r.lightId} aria-pressed={r.on}
                  onClick={() => hueDo('power', r.lightId, { on: !r.on }, (x) => (x.id === r.id ? { ...x, on: !r.on } : x))}>
                  <span class="card-title">{r.name}</span>
                  <span class="switch" aria-hidden="true"><span /></span>
                </button>
                {r.lightId && (
                  <Slider label={`${r.name} brightness`} value={r.on ? Math.round(r.brightness ?? 100) : 0} min={1}
                    onCommit={(v) => hueDo('brightness', r.lightId, { brightness: v }, (x) => (x.id === r.id ? { ...x, on: true, brightness: v } : x))} />
                )}
              </div>
            ))}
          </div>
          </>
        )}
      </div>
    </div>
  )
}

function Connect({ svc, state }) {
  const name = svc === 'hue' ? 'Philips Hue' : 'Sonos'
  if (!state) return <p class="muted">Loading…</p>
  if (state.error) return <p class="muted">{name} is unreachable right now.</p>
  if (!state.configured) return <p class="muted">{name} isn't set up yet (see SETUP.md).</p>
  return <a class="btn" href={`/auth/${svc}/start`}>Connect {name}</a>
}

// Covers come as https links or through this dashboard's own /api/art (see worker/sonos.ts).
// Without one, the tablet looks the song or album up in Apple's free iTunes Search; failing that
// (YouTube mixes, radio), it draws a cover from the title: soft colours and its first letter.
const safeArt = (src) => (src && (src.startsWith('https://') || src.startsWith('/api/art')) ? src : null)

const fold = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const tidy = (s) => (s ?? '').replace(/\s*[([][^)\]]*[)\]]/g, '').split(/\s+[|·•–-]\s+/)[0].trim()
const looked = store.get('coverLookups', {}) // query → cover link ('' = none found), kept on this tablet
function useLookup(q) {
  const key = q ? `${fold(q.artist)}|${fold(q.album || q.title)}` : null
  const [url, setUrl] = useState(key ? looked[key] : undefined)
  useEffect(() => {
    if (!key) return setUrl(undefined)
    if (key in looked) return setUrl(looked[key])
    setUrl(undefined)
    const entity = q.album ? 'album' : 'song'
    const term = [tidy(q.artist), tidy(q.album || q.title)].filter(Boolean).join(' ')
    if (!term) return
    let live = true
    fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term, media: 'music', entity, limit: '3' })}`)
      .then((r) => r.json())
      .then((d) => {
        // Only a match by the same artist counts, so a wrong cover never shows.
        const a = fold(tidy(q.artist))
        const hit = (d.results ?? []).find((x) => !a || fold(x.artistName).includes(a) || a.includes(fold(x.artistName)))
        looked[key] = hit?.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/600x600bb.') ?? ''
        const keys = Object.keys(looked)
        if (keys.length > 200) delete looked[keys[0]]
        store.set('coverLookups', looked)
        if (live) setUrl(looked[key])
      })
      .catch(() => {})
    return () => { live = false }
  }, [key])
  return url
}

function Drawn({ title, cls, size }) {
  const t = (title ?? '').trim()
  let h = 0
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 360
  const letter = [...tidy(t).replace(/^(the|a|an)\s+/i, '')].find((c) => /\p{L}|\p{N}/u.test(c))
  return (
    <span class={`${cls} drawn`} style={{ '--h1': h, '--h2': (h + 50) % 360 }} aria-hidden="true">
      {letter ? <span class="drawn-letter" style={{ fontSize: `${size * 1.6}px` }}>{letter.toUpperCase()}</span> : <Music size={size} />}
    </span>
  )
}

function Cover({ src, query, title, cls, ph = 'placeholder', size = 22 }) {
  const [failed, setFailed] = useState(null)
  const found = useLookup(safeArt(src) && failed !== src ? null : query)
  const url = safeArt(src) && failed !== src ? src : found
  if (url && failed !== url) return <img class={cls} src={url} alt="" onError={() => setFailed(url)} />
  return title ? <Drawn title={title} cls={cls} size={size} /> : <span class={`${cls} ${ph}`}><Music size={size} /></span>
}
const Art = ({ group }) => <Cover src={group.art} query={group.artQuery} title={group.title} cls="art" />

// A visual equaliser: bars that move while music plays. Sonos doesn't share the sound itself,
// so the bars are a gentle animation, not a reading of the music; they rest when paused.
function Eq({ on, big }) {
  return <span class={`eq ${on ? 'on' : ''} ${big ? 'big' : ''}`} aria-hidden="true"><i /><i /><i /><i />{big && <><i /><i /><i /></>}</span>
}

// Range slider that updates on screen while dragging and sends once on release.
function Slider({ value, onCommit, label, min = 0 }) {
  const [local, setLocal] = useState(null)
  const hold = useRef(0)
  useEffect(() => { if (Date.now() > hold.current) setLocal(null) }, [value])
  const shown = local ?? value
  return (
    <label class="slider">
      <span class="sr">{label}</span>
      <input type="range" min={min} max="100" value={shown} style={{ '--p': `${shown}%` }}
        onInput={(e) => setLocal(+e.currentTarget.value)}
        onChange={(e) => { hold.current = Date.now() + 4000; onCommit(+e.currentTarget.value) }} />
      <span class="slider-val">{shown}</span>
    </label>
  )
}

// Text that slowly scrolls back and forth only when it doesn't fit (e.g. long song titles).
function Marquee({ text, class: cls }) {
  const box = useRef(null)
  const inner = useRef(null)
  const [shift, setShift] = useState(0)
  useEffect(() => {
    const measure = () => {
      const over = (inner.current?.scrollWidth ?? 0) - (box.current?.clientWidth ?? 0)
      setShift(over > 4 ? over : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [text])
  return (
    <span class={`${cls} marquee`} ref={box} title={text}>
      <span ref={inner} class={shift ? 'scrolling' : ''} style={shift ? { '--shift': `-${shift}px`, '--dur': `${Math.max(6, shift / 12)}s` } : null}>{text}</span>
    </span>
  )
}
