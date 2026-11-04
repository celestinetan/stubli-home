import type { LocalItem } from './local'

// Regular free museum days, by country (ISO code). They show in What's on when your city is in
// that country; turn them off in Settings → What's on. Museums change these rules now and then,
// so each item links to where it's published. Last checked: November 2026. Only places within
// config.events.radiusKm of your city show.
// `weekdays`: 0 = Sunday. `nth`: 1 = only the first of those weekdays in the month.

type FreeDay = LocalItem & { city: string; lat: number; lon: number; free: true }

const CH: FreeDay[] = [
  { title: 'Free entry to the Kunsthaus collection', place: 'Kunsthaus Zürich', city: 'Zürich', lat: 47.3769, lon: 8.5417, weekdays: [3], note: 'Collection only; special exhibitions are paid', url: 'https://www.kunsthaus.ch/en/besuch-planen/tickets', icon: '🏛️', free: true },
  { title: 'Free Thursday evening', place: 'Museum für Gestaltung (both sites)', city: 'Zürich', lat: 47.3769, lon: 8.5417, weekdays: [4], time: '17:00–20:00', url: 'https://museum-gestaltung.ch', icon: '🏛️', free: true },
  { title: 'Free Wednesday evening', place: 'Fotomuseum Winterthur', city: 'Winterthur', lat: 47.4997, lon: 8.7241, weekdays: [3], time: '17:00–20:00', url: 'https://www.fotomuseum.ch', icon: '📷', free: true },
  { title: 'Free first Sunday in Basel museums', place: 'Kunstmuseum, Historisches Museum, Museum der Kulturen, Naturhistorisches Museum', city: 'Basel', lat: 47.5596, lon: 7.5886, weekdays: [0], nth: 1, url: 'https://www.museenbasel.ch', icon: '🏛️', free: true },
  { title: 'Free first Sunday: Kunstmuseum Luzern', place: 'Kunstmuseum Luzern', city: 'Luzern', lat: 47.0502, lon: 8.3093, weekdays: [0], nth: 1, url: 'https://www.kunstmuseumluzern.ch', icon: '🏛️', free: true },
  { title: 'Free first Sunday in Geneva city museums', place: 'MAH, Ariana, MEG, Muséum', city: 'Genève', lat: 46.2044, lon: 6.1432, weekdays: [0], nth: 1, note: 'Temporary exhibitions free; the collections are free every day', url: 'https://www.geneve.ch/themes/culture/acces-culture/mesures-tarifaires', icon: '🏛️', free: true },
  { title: 'Free first Saturday at Plateforme 10', place: 'MCBA, mudac, Photo Elysée', city: 'Lausanne', lat: 46.5197, lon: 6.6323, weekdays: [6], nth: 1, url: 'https://www.mcba.ch/en/general-information/', icon: '🏛️', free: true },
  { title: 'Free Wednesday in Neuchâtel museums', place: "Muséum d'histoire naturelle, Musée d'ethnographie", city: 'Neuchâtel', lat: 46.99, lon: 6.9293, weekdays: [3], icon: '🏛️', free: true },
  { title: 'Free first Thursday evening at MASI', place: 'MASI Lugano', city: 'Lugano', lat: 46.0037, lon: 8.9511, weekdays: [4], nth: 1, time: '18:00–20:00', url: 'https://www.masilugano.ch', icon: '🏛️', free: true },
]

export const FREE_DAYS: Record<string, FreeDay[]> = { CH }
