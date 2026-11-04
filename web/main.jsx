import { render } from 'preact'
import { useEffect, useState, useCallback } from 'preact/hooks'
import { api, report, store, minutesNow, toMinutes, inWindow, fmtTime, setTimezone } from './lib.js'
import { useTabletMusic, MusicCard, TabletMusicBar } from './components/TabletMusic.jsx'
import { Setup } from './components/Setup.jsx'
import { DEMO, PROJECT_URL } from './demo.js'
import { Ticker } from './components/Ticker.jsx'
import { Header, AdviceStrip } from './components/Header.jsx'
import { Agenda } from './components/Agenda.jsx'
import { WhatsOn } from './components/WhatsOn.jsx'
import { Settings } from './components/Settings.jsx'
import { News, StoryPanel, CategoryPanel } from './components/News.jsx'
import { HomeBar, MusicSheet, LightsSheet, useHome } from './components/Home.jsx'
import './styles.css'

function useNow(ms) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

// The layout relies on container queries (iPadOS 16, Chrome 105). Older browsers get a plain note.
const OLD_BROWSER = !(window.CSS?.supports?.('container-type: inline-size'))

function App() {
  const now = useNow(15_000)
  const [dash, setDash] = useState(null)
  const [story, setStory] = useState(null)
  const [category, setCategory] = useState(null)
  const [toast, setToast] = useState(null)
  const [sheet, setSheet] = useState(null) // 'music' | 'lights' | null
  // The music and lights panels slide down before they go (see .overlay.slide in styles.css).
  const [closing, setClosing] = useState(false)
  const closeSheet = () => {
    if (closing) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setSheet(null)
    setClosing(true)
    setTimeout(() => { setSheet(null); setClosing(false) }, 260)
  }
  const [settings, setSettings] = useState(false)
  const [online, setOnline] = useState(true)
  const [textSize, setTextSize] = useState(() => store.get('textSize', 'm'))
  const [wokenUntil, setWokenUntil] = useState(0)
  const [forceSleep, setForceSleep] = useState(false)
  const home = useHome(sheet)
  const [setup, setSetup] = useState(false)
  const music = useTabletMusic()

  const load = useCallback(async () => {
    try {
      const d = await api('/api/dashboard')
      setTimezone(d.settings?.timezone) // before rendering, so every time shown is local to the dashboard's place
      setDash(d)
    } catch (e) { report(`dashboard: ${e.message}`) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60_000)
    const vis = () => { if (!document.hidden) load() }
    const conn = (e) => setOnline(e.detail)
    let toastTimer
    const onToast = (e) => { setToast(e.detail); clearTimeout(toastTimer); toastTimer = setTimeout(() => setToast(null), 4000) }
    // Escape closes whichever panel is open (handy with a keyboard).
    const esc = (e) => { if (e.key === 'Escape') { setStory(null); setCategory(null); setSheet(null); setSettings(false) } }
    window.addEventListener('keydown', esc)
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('connection', conn)
    window.addEventListener('toast', onToast)
    return () => {
      clearInterval(t); clearTimeout(toastTimer); window.removeEventListener('keydown', esc)
      document.removeEventListener('visibilitychange', vis); window.removeEventListener('connection', conn); window.removeEventListener('toast', onToast)
    }
  }, [load])

  // A new dashboard opens on the setup steps until a city is chosen (or setup was finished once).
  useEffect(() => {
    if (dash && !DEMO && !dash.settings?.location && !store.get('setup-done', false)) setSetup(true)
  }, [dash])

  // Reload once a night so a page that never closes stays healthy.
  useEffect(() => {
    const at = toMinutes(dash?.settings?.nightlyReload ?? '03:00')
    if (minutesNow(now) === at && performance.now() > 120_000) location.reload()
  }, [now])

  useEffect(() => { document.documentElement.dataset.text = textSize; store.set('textSize', textSize) }, [textSize])

  // Day/night theme: automatic from today's sunrise and sunset, or fixed in Settings.
  const today = dash?.weather?.data?.daily?.[0]
  const themeSetting = dash?.settings?.theme ?? 'auto'
  const night = themeSetting === 'dark' || (themeSetting === 'auto' && (today ? now < today.sunrise || now > today.sunset : false))
  const paper = !!dash?.settings?.paper
  useEffect(() => {
    document.documentElement.dataset.theme = night ? 'night' : 'day'
    document.documentElement.dataset.look = paper ? 'paper' : 'plain'
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', night ? '#1c1916' : paper ? '#ece3d6' : '#efede9')
  }, [night, paper])

  // Modules switched off in Settings disappear; the remaining columns share the width.
  const mods = dash?.settings?.modules ?? {}
  const place = dash?.settings?.location ?? ''
  const columns = (dash?.settings?.columns ?? ['yourDay', 'news', 'whatsOn']).filter((c) => mods[c] !== false)

  const sleepCfg = dash?.settings?.sleep
  const sleeping = (forceSleep || (sleepCfg && inWindow(minutesNow(now), toMinutes(sleepCfg.start), toMinutes(sleepCfg.end)))) && Date.now() > wokenUntil
  const wake = () => { setForceSleep(false); setWokenUntil(Date.now() + (sleepCfg?.wakeMinutes ?? 3) * 60_000) }

  return (
    <div class="app">
      {OLD_BROWSER && (
        <div class="old-browser" role="note">
          This browser is older than Stubli Home needs (iPadOS 16 or Chrome 105), so some parts may look wrong. Updating the tablet's software usually fixes it.
        </div>
      )}
      {DEMO && (
        <div class="demo-bar" role="note">
          <span><b>Demo</b> · made-up sample data, only in your browser</span>
          <a href={PROJECT_URL}>Make your own Stubli Home ›</a>
        </div>
      )}
      <Header now={now} weather={mods.weather !== false ? dash?.weather : null} hideWeather={mods.weather === false} location={place} onSettings={() => setSettings(true)} />
      {mods.weather !== false && <AdviceStrip weather={dash?.weather} />}
      {!online && (
        <button class="offline" onClick={() => location.reload()}>
          Stubli Home can't reach its server right now. It keeps trying by itself; if this stays, tap here to sign in again.
        </button>
      )}
      <main class="main" style={{ '--cols': columns.length || 1 }}>
        {columns.map((c) =>
          c === 'yourDay' ? <Agenda key={c} now={now} calendar={dash?.calendar} local={dash?.local} place={place} extra={<MusicCard music={music} />} />
          : c === 'news' ? <News key={c} now={now} news={dash?.news} categories={dash?.settings?.newsCategories} onOpenCategory={setCategory} />
          : <WhatsOn key={c} now={now} events={dash?.events} local={dash?.local} place={place} eventSources={!!dash?.settings?.eventSources} onOpen={setStory} />)}
      </main>
      {mods.news !== false && <Ticker news={dash?.news} weather={mods.weather !== false ? dash?.weather : null} onOpen={setStory} />}
      {!columns.includes('yourDay') && <MusicCard music={music} floating />}
      <HomeBar home={home} barScenes={dash?.settings?.barScenes} onMusic={() => setSheet('music')} onLights={() => setSheet('lights')}
        tablet={mods.tablet !== false && dash?.settings?.tabletMusic?.length ? <TabletMusicBar music={music} links={dash.settings.tabletMusic} /> : null} />

      {category && <CategoryPanel card={category} now={now} onOpen={setStory} onClose={() => setCategory(null)} />}
      {story && <StoryPanel story={story} now={now} onClose={() => setStory(null)} />}
      {toast && <div class="toast" role="status">{toast}</div>}
      {sheet === 'music' && <MusicSheet home={home} closing={closing} onClose={closeSheet} tablet={music} tabletLinks={mods.tablet !== false ? dash?.settings?.tabletMusic ?? [] : []} />}
      {sheet === 'lights' && <LightsSheet home={home} closing={closing} onClose={closeSheet} />}
      {setup && <Setup onSaved={load} onDone={() => { setSetup(false); load() }} />}
      {settings && <Settings onClose={() => setSettings(false)} onSaved={load} textSize={textSize} setTextSize={setTextSize} />}
      {sleeping && (
        <button class="sleep" onClick={wake} aria-label="Wake screen">
          <span>{fmtTime(now)}</span>
        </button>
      )}
    </div>
  )
}

render(<App />, document.getElementById('root'))
