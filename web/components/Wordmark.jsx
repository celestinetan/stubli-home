// Stubli's wordmark: lowercase "stübli" in Figtree 600, the ü drawn as a smile (two dots and a
// round-ended u). The right eye winks once when it appears (DESIGN.md §23). Only the logo spells
// the umlaut; everything else says Stubli.

export function Wordmark({ class: cls = '' }) {
  return (
    <span class={`wordmark ${cls}`} role="img" aria-label="Stubli">
      <span aria-hidden="true">st</span>
      <svg class="wordmark-u" viewBox="0 0 60 80" aria-hidden="true" focusable="false">
        <path d="M10.5 35.5V52a19.5 19.5 0 0 0 39 0V35.5" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" />
        <circle cx="19" cy="15" r="6.2" fill="currentColor" />
        <circle class="wordmark-wink" cx="41" cy="15" r="6.2" fill="currentColor" />
      </svg>
      <span aria-hidden="true">bli</span>
    </span>
  )
}
