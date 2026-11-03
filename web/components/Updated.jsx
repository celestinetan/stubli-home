import { ago } from '../lib.js'

// Small "updated X ago" note; turns amber when a source is well overdue.
export function Updated({ slot }) {
  if (!slot?.updatedAt) return null
  const age = Date.now() - slot.updatedAt
  const stale = age > slot.every * 3 * 60_000
  if (!stale && !slot.error) return null
  return <span class={`updated ${stale ? 'stale' : ''}`}>· updated {ago(slot.updatedAt)}</span>
}
