import type { LocalItem } from './local'

// Regular free museum days, by country (ISO code). They show in What's on when your city is in
// that country; turn them off in Settings → What's on. Museums change these rules now and then,
// so each item links to where it's published. Last checked: November 2026.
// `weekdays`: 0 = Sunday. `nth`: 1 = only the first of those weekdays in the month.

type FreeDay = LocalItem & { city: string; free: true }

const CH: FreeDay[] = [
  { title: 'Free entry to the Kunsthaus collection', place: 'Kunsthaus Zürich', city: 'Zürich', weekdays: [3], note: 'Collection only; special exhibitions are paid', url: 'https://www.kunsthaus.ch/en/besuch-planen/tickets', icon: '🏛️', free: true },
  { title: 'Free Thursday evening', place: 'Museum für Gestaltung (both sites)', city: 'Zürich', weekdays: [4], time: '17:00–20:00', url: 'https://museum-gestaltung.ch', icon: '🏛️', free: true },
  { title: 'Free Wednesday evening', place: 'Fotomuseum Winterthur', city: 'Winterthur', weekdays: [3], time: '17:00–20:00', url: 'https://www.fotomuseum.ch', icon: '📷', free: true },
  { title: 'Free first Sunday in Basel museums', place: 'Kunstmuseum, Historisches Museum, Museum der Kulturen, Naturhistorisches Museum', city: 'Basel', weekdays: [0], nth: 1, url: 'https://www.museenbasel.ch', icon: '🏛️', free: true },
  { title: 'Free first Sunday: Kunstmuseum Luzern', place: 'Kunstmuseum Luzern', city: 'Luzern', weekdays: [0], nth: 1, url: 'https://www.kunstmuseumluzern.ch', icon: '🏛️', free: true },
  { title: 'Free first Sunday in Geneva city museums', place: 'MAH, Ariana, MEG, Muséum', city: 'Genève', weekdays: [0], nth: 1, note: 'Temporary exhibitions free; the collections are free every day', url: 'https://www.geneve.ch/themes/culture/acces-culture/mesures-tarifaires', icon: '🏛️', free: true },
  { title: 'Free first Saturday at Plateforme 10', place: 'MCBA, mudac, Photo Elysée', city: 'Lausanne', weekdays: [6], nth: 1, url: 'https://www.mcba.ch/en/general-information/', icon: '🏛️', free: true },
  { title: 'Free Wednesday in Neuchâtel museums', place: "Muséum d'histoire naturelle, Musée d'ethnographie", city: 'Neuchâtel', weekdays: [3], icon: '🏛️', free: true },
  { title: 'Free first Thursday evening at MASI', place: 'MASI Lugano', city: 'Lugano', weekdays: [4], nth: 1, time: '18:00–20:00', url: 'https://www.masilugano.ch', icon: '🏛️', free: true },
]

export const FREE_DAYS: Record<string, FreeDay[]> = { CH }
