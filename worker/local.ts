import config from './config'

// Your curated list (config.local.events) plus public and school holidays from the free
// OpenHolidays API (mostly European countries; elsewhere only your own items show). The dashboard decides what is "today", so it switches at midnight.

export interface LocalItem {
  title: string
  place?: string
  note?: string
  time?: string
  url?: string
  icon: string
  from?: string // YYYY-MM-DD, inclusive
  to?: string
  weekdays?: number[] // 0 = Sunday … 6 = Saturday
}

const API = 'https://openholidaysapi.org'

export async function fetchLocal() {
  const today = new Date().toISOString().slice(0, 10)
  const until = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10)
  const q = (kind: string) =>
    `${API}/${kind}?countryIsoCode=${config.location.country}${config.local.subdivision ? `&subdivisionCode=${config.local.subdivision}` : ''}&languageIsoCode=EN&validFrom=${today}&validTo=${until}`
  if (!config.location.country) return { items: [...config.local.events] as LocalItem[] }
  const [pub, school] = await Promise.all([
    fetch(q('PublicHolidays')).then((r) => (r.ok ? r.json() : [])).catch(() => []) as Promise<any[]>,
    fetch(q('SchoolHolidays')).then((r) => (r.ok ? r.json() : [])).catch(() => []) as Promise<any[]>,
  ])
  // Without a region, only nationwide holidays: regional ones may not apply where you live.
  const inArea = (h: any) => h.nationwide || (!!config.local.subdivision && (h.subdivisions ?? []).some((s: any) => s.code === config.local.subdivision))
  const name = (h: any) => h.name?.find((n: any) => n.language === 'EN')?.text ?? h.name?.[0]?.text ?? 'Holiday'

  const holidays: LocalItem[] = pub.filter(inArea).map((h) => ({
    title: name(h), note: 'Public holiday — shops and offices mostly closed', icon: '🎉', from: h.startDate, to: h.endDate,
  }))
  const seen = new Set<string>()
  const schools: LocalItem[] = school.filter(inArea).flatMap((h) => {
    const key = `${name(h)}|${h.startDate}|${h.endDate}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ title: `School holidays: ${name(h)}`, note: `Until ${h.endDate}`, icon: '🏫', from: h.startDate, to: h.endDate }]
  })
  return { items: [...holidays, ...schools, ...config.local.events] as LocalItem[] }
}
