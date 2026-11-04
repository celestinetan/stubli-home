const Svg = ({ children, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const Play = (p) => <Svg {...p}><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></Svg>
export const Pause = (p) => <Svg {...p}><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></Svg>
export const Next = (p) => <Svg {...p}><path d="M5 5v14l10-7z" fill="currentColor" stroke="none" /><path d="M19 5v14" /></Svg>
export const Prev = (p) => <Svg {...p}><path d="M19 5v14L9 12z" fill="currentColor" stroke="none" /><path d="M5 5v14" /></Svg>
export const Shuffle = (p) => <Svg {...p}><path d="M16 4h4v4M4 20L20 4M20 16v4h-4M15 15l5 5M4 4l5 5" /></Svg>
export const Speaker = (p) => <Svg {...p}><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></Svg>
export const Museum = (p) => <Svg {...p}><path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></Svg>
export const Palette = (p) => <Svg {...p}><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8l-.4-.8c-.5-1 .2-2.4 1.4-2.4H17a4 4 0 0 0 4-4c0-4.4-4-9-9-9z" /><circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="10" cy="7.2" r="1" fill="currentColor" /><circle cx="14.5" cy="7.2" r="1" fill="currentColor" /></Svg>
export const Star = (p) => <Svg {...p}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" /></Svg>
export const Book = (p) => <Svg {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" /></Svg>
export const Tree = (p) => <Svg {...p}><path d="M12 3l5 6h-3l4 5h-3l4 5H5l4-5H6l4-5H7z" /><path d="M12 19v2" /></Svg>
export const Camera = (p) => <Svg {...p}><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>
export const ChevronDown = (p) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>
export const ChevronLeft = (p) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>
export const ChevronRight = (p) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>

// One line icon for an event kind or a saved item's emoji, so the screen keeps one icon style.
const BY_EMOJI = { '🏛️': Museum, '🏛': Museum, '🎄': Tree, '🎉': Star, '🏫': Book, '📷': Camera, '🎵': Music, '🎶': Music, '🎨': Palette }
export function ItemIcon({ kind, emoji, size = 18 }) {
  const I = kind === 'Music' ? Music : kind === 'Art' ? Palette : kind === 'Exhibition' && !emoji ? Museum : BY_EMOJI[emoji] ?? (kind === 'Exhibition' ? Museum : Star)
  return <span class="item-icon" aria-hidden="true"><I size={size} /></span>
}
export const ChevronUp = (p) => <Svg {...p}><path d="M6 15l6-6 6 6" /></Svg>
export const Close = (p) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
export const Gear = (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>
export const Bulb = (p) => <Svg {...p}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></Svg>
export const Power = (p) => <Svg {...p}><path d="M12 3v9" /><path d="M6.3 7.3a8 8 0 1 0 11.4 0" /></Svg>
export const Music = (p) => <Svg {...p}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></Svg>
export const External = (p) => <Svg {...p}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>
export const Qr = (p) => <Svg {...p}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></Svg>
