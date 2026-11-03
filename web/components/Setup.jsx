import { useState } from 'preact/hooks'
import { api, store } from '../lib.js'
import { CitySearch } from './Settings.jsx'
import { Wordmark } from './Wordmark.jsx'

// First-run setup: shown on a new dashboard until a city is chosen. Four short steps, one question
// each; everything after the city can be skipped and changed later in Settings.

const STEPS = ['Your city', 'Your calendar', 'News summaries', 'Ready']

export function Setup({ onDone, onSaved }) {
  const [step, setStep] = useState(0)
  const [note, setNote] = useState('')
  const [cal, setCal] = useState({ name: 'Personal', url: '' })
  const [key, setKey] = useState('')
  const [skipped, setSkipped] = useState([])
  const next = () => { setNote(''); setStep((s) => s + 1) }
  const skip = () => { setSkipped((x) => [...x, step]); next() }
  const [busy, setBusy] = useState(false)
  const post = async (path, body) => {
    setBusy(true)
    try { await api(path, { method: 'POST', body, headers: pinHeader() }); onSaved?.(); return true }
    catch (e) {
      setNote(e.status === 403 ? 'This dashboard has a settings PIN. Close this and enter it in Settings first.'
        : e.status === 400 ? e.message : "That didn't save. Check your connection and try again.")
      return false
    } finally { setBusy(false) }
  }

  return (
    <div class="overlay setup-overlay">
      <div class="sheet setup" role="dialog" aria-label="Set up Stubli Home">
        <p class="setup-brand"><Wordmark /> <span class="muted">Home</span></p>
        <ol class="stops" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} class={i < step ? `done${skipped.includes(i) ? ' skipped' : ''}` : i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined}>
              <span class="stop">{i < step ? (skipped.includes(i) ? '–' : '✓') : i + 1}</span><span class="stop-name">{s}</span>
            </li>
          ))}
        </ol>
        <p class="muted small">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>

        {step === 0 && <>
          <h2>Where is this dashboard?</h2>
          <p class="muted">Weather, the time, public holidays and your local news follow this place.</p>
          <CitySearch autoFocus onPick={async (loc) => { if (await post('/api/settings', { location: loc })) next() }} />
        </>}

        {step === 1 && <>
          <h2>Add your calendar</h2>
          <p class="muted">Paste the calendar's private iCal link. Proton: Settings, Calendars, Share, "Share with anyone". Google: Settings, your calendar, "Secret address in iCal format". iCloud and Outlook offer one too.</p>
          <div class="add-feed">
            <input placeholder="Name, e.g. Personal" value={cal.name} onInput={(ev) => setCal({ ...cal, name: ev.currentTarget.value })} />
            <input type="password" autoComplete="off" placeholder="Calendar link (starts with https:// or webcal://)" value={cal.url} onInput={(ev) => setCal({ ...cal, url: ev.currentTarget.value })} />
          </div>
          <p class="muted small">The link stays on your own server and is never shown again. Treat it like a password.</p>
          <div class="setup-actions">
            <button class="btn" onClick={skip}>Skip for now</button>
            <button class="btn primary" disabled={busy || !cal.name || !/^(https?|webcals?):\/\//i.test(cal.url.trim())}
              onClick={async () => { if (await post('/api/secrets/calendars', { calendars: [cal], keep: [] })) next() }}>{busy ? 'Checking the link…' : 'Add calendar'}</button>
          </div>
        </>}

        {step === 2 && <>
          <h2>Clearer news, in English</h2>
          <p class="muted">Optional. With a free Google AI Studio key, stories from different outlets are grouped, summarised and translated. Without one, the news still works, just plainer.</p>
          <p class="small">Get a key at <b>aistudio.google.com</b> (sign in with a Google account, then "Get API key").</p>
          <input type="password" autoComplete="off" placeholder="Paste your key" value={key} onInput={(ev) => setKey(ev.currentTarget.value)} />
          <div class="setup-actions">
            <button class="btn" onClick={skip}>Skip for now</button>
            <button class="btn primary" disabled={busy || key.trim().length < 20} onClick={async () => { if (await post('/api/secrets/gemini', { key: key.trim() })) next() }}>{busy ? 'Checking the key…' : 'Save key'}</button>
          </div>
        </>}

        {step === 3 && <>
          <h2>Your Stubli Home is ready</h2>
          <p class="muted">A few things make a tablet a calm wall display:</p>
          <ul class="setup-tips">
            <li><b>Add it to the home screen.</b> iPad: Share, then Add to Home Screen. Android: the Chrome menu, then Add to Home screen. Open it from the new icon; on an iPad it asks for the pairing code once more, because the home-screen app keeps its own sign-in.</li>
            <li><b>Keep the screen on.</b> iPad: Display and Brightness, Auto-Lock: Never. Android: Display, the longest screen timeout.</li>
            <li><b>Quiet notifications</b> with Do Not Disturb.</li>
          </ul>
          <p class="muted small">Everything here can be changed any time with the gear in the top corner.</p>
          <div class="setup-actions">
            <button class="btn primary" onClick={() => { store.set('setup-done', true); onDone() }}>Open my dashboard</button>
          </div>
        </>}

        {note && <p class="settings-msg" role="status">{note}</p>}
      </div>
    </div>
  )
}

function pinHeader() {
  const pin = store.get('settings-pin', '')
  return pin ? { 'x-settings-pin': pin } : {}
}
