import { useEffect, useRef, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { Pause, Play, Next, Close, Music } from './icons.jsx'
import { Dancers } from './Dancers.jsx'

// Music on this tablet: YouTube or YouTube Music links play here, through YouTube's own embedded
// player (its official IFrame API: no account or key). YouTube's rules say the player must stay
// visible while it plays, so it sits as a card in the Your day column (or floats if that's off).
// Nothing from YouTube loads until someone taps a link to play.

let apiReady
function loadApi() {
  apiReady ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT)
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  })
  return apiReady
}

export function useTabletMusic() {
  const [item, setItem] = useState(null) // the saved link that's playing
  const [state, setState] = useState({ playing: false, title: '' })
  const player = useRef(null)
  const skips = useRef(0)

  const stop = () => { try { player.current?.destroy() } catch {} player.current = null; setItem(null); setState({ playing: false, title: '' }) }
  const control = {
    item, ...state,
    play: (it) => { if (player.current) stop(); skips.current = 0; setItem(it) },
    toggle: () => { const p = player.current; if (!p) return; state.playing ? p.pauseVideo() : p.playVideo() },
    next: () => { const p = player.current; if (!p) return; item?.list ? p.nextVideo() : p.seekTo(0) },
    stop,
    // The card calls this once its box is on screen, so YouTube has somewhere to draw.
    mount: async (el) => {
      if (!el || !item || player.current) return
      const YT = await loadApi()
      player.current = new YT.Player(el, {
        width: '100%', height: '100%',
        ...(item.video ? { videoId: item.video } : {}),
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, ...(item.list ? { listType: 'playlist', list: item.list } : {}) },
        events: {
          onReady: (e) => e.target.playVideo(),
          onStateChange: (e) => setState({ playing: e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING, title: e.target.getVideoData?.().title ?? '' }),
          // 101/150: the owner doesn't allow playing outside YouTube. In a playlist, skip that song.
          onError: (e) => {
            if (item.list && skips.current++ < 5) { e.target.nextVideo(); return }
            setState({ playing: false, title: [101, 150].includes(e.data) ? "This one can't play here: its owner only allows it on YouTube itself. Try another link." : "This didn't load. Check the link, or try again in a moment." })
          },
        },
      })
    },
  }
  return control
}

// The player card. Stays visible while playing, as YouTube requires.
export function MusicCard({ music, floating }) {
  const box = useRef(null)
  useEffect(() => { music.mount(box.current) }, [music.item])
  if (!music.item) return null
  return (
    <div class={`yt-card ${floating ? 'floating' : ''}`} role="region" aria-label="Music on this tablet">
      <div class="yt-frame"><div ref={box} /></div>
      <div class="yt-controls">
        <span class="yt-title">{music.title || music.item.name}</span>
        <button class="icon-btn" onClick={music.toggle} aria-label={music.playing ? 'Pause' : 'Play'}>{music.playing ? <Pause /> : <Play />}</button>
        <button class="icon-btn" onClick={music.next} aria-label={music.item.list ? 'Next song' : 'Start again'}><Next /></button>
        <button class="icon-btn" onClick={music.stop} aria-label="Stop music"><Close size={18} /></button>
      </div>
    </div>
  )
}

// The bottom bar's part: pick something to play, or show what's playing.
export function TabletMusicBar({ music, links }) {
  const [open, setOpen] = useState(false)
  if (!links?.length) return null
  return (
    <div class="np tablet-np">
      {music.item ? (
        <>
          <Dancers on={music.playing} />
          <span class="np-text"><span class="np-title">{music.title || music.item.name}</span><span class="np-room">{music.playing ? '' : 'Paused · '}YouTube Music · on this tablet</span></span>
          <button class="icon-btn big" aria-label={music.playing ? 'Pause' : 'Play'} onClick={music.toggle}>{music.playing ? <Pause /> : <Play />}</button>
          <button class="icon-btn" aria-label="Choose something else" onClick={() => setOpen(true)}><Music size={20} /></button>
        </>
      ) : (
        <button class="btn" onClick={() => setOpen(true)}><Music size={20} /> Play YouTube Music</button>
      )}
      {/* Drawn at page level, so it sits above the ticker and every panel. */}
      {open && createPortal(
        <div class="overlay" onClick={() => setOpen(false)}>
          <div class="sheet music-pick" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Play music">
            <button class="icon-btn close" onClick={() => setOpen(false)} aria-label="Close"><Close /></button>
            <h2>Play on this tablet</h2>
            <ul class="pick-list">
              {links.map((l, i) => (
                <li key={`${l.list ?? l.video}${i}`}>
                  <button class="pick" onClick={() => { music.play(l); setOpen(false) }}>{l.name}<span class="muted">{l.list ? 'Playlist' : 'Song or video'}</span></button>
                </li>
              ))}
            </ul>
            <p class="muted small">Plays through YouTube on this tablet, or on a speaker it's connected to by Bluetooth or AirPlay. YouTube may show ads. Add more in Settings → Music.</p>
          </div>
        </div>,
        document.getElementById('root'),
      )}
    </div>
  )
}
