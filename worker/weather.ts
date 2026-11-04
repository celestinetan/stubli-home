import config from './config'

// Forecast: in Switzerland, MeteoSwiss's own local forecast (the feed behind the MeteoSwiss app:
// unofficial, by postcode), with its warnings. Elsewhere, or for a Swiss place without a postcode,
// Open-Meteo (free, worldwide). Both are turned into the same shape for the dashboard.

const WARN_TYPES: Record<number, string> = {
  0: 'Wind', 1: 'Thunderstorms', 2: 'Rain', 3: 'Snow', 4: 'Slippery roads', 5: 'Frost',
  6: 'Flooding', 7: 'Heat', 8: 'Avalanches', 9: 'Earthquake', 10: 'Forest fire', 11: 'Flooding',
}

type Current = { temp: number; feels: number; code: number; isDay: boolean; wind: number; gusts: number; humidity: number | null }
type Hour = { t: number; temp: number; pop: number; precip: number; code: number; isDay: boolean; feels: number; gusts: number; uv: number | null }
type Slot = { t: number; mm: number } // rain in the next 15 minutes from t (ms)

export async function fetchWeather() {
  const { latitude, longitude, meteoswissPoint } = config.location
  if (latitude == null || longitude == null) throw new Error('Choose your city in Settings')
  const f = config.location.country === 'CH' && meteoswissPoint ? await fromMeteoSwiss(meteoswissPoint) : await fromOpenMeteo(latitude, longitude)
  return {
    current: f.current,
    hourly: f.hourly,
    daily: f.daily,
    rain: rainAlert(f.nowcast, f.hourly),
    advice: advice(f.current, f.nowcast, f.hourly),
    warnings: f.warnings,
    source: f.source,
  }
}

// MeteoSwiss app feed: hourly temperature, rain and wind; 3-hourly icons and rain chances;
// rain in 10-minute steps for the next hours; daily summaries. It has no humidity or UV, and
// "feels like" is worked out here from temperature and wind (the wind-chill formula).
async function fromMeteoSwiss(point: string) {
  const res = await fetch(`https://app-prod-ws.meteoswiss-app.ch/v1/plzDetail?plz=${point}`, {
    headers: { 'User-Agent': 'MeteoSwissApp-2.16-Android', 'Accept-Language': 'en' },
  })
  if (!res.ok) throw new Error(`MeteoSwiss ${res.status}`)
  const d: any = await res.json()
  const g = d.graph
  const H = 3600_000
  const now = Date.now()
  const at = Math.max(0, Math.floor((now - g.start) / H)) // index of the current hour
  const icon = (i: number) => fromMsIcon(g.weatherIcon3h[Math.floor(i / 3)] ?? 4)
  const hourAt = (i: number): Hour => {
    const ic = icon(i)
    const temp = g.temperatureMean1h[i]
    return {
      t: g.start + i * H, temp, feels: windChill(temp, g.windSpeed1h[i]), code: ic.code, isDay: ic.isDay,
      pop: g.precipitationProbability3h[Math.floor(i / 3)] ?? 0, precip: g.precipitation1h[i] ?? 0, gusts: g.gustSpeed1h[i] ?? 0, uv: null,
    }
  }
  const hourly = Array.from({ length: 12 }, (_, k) => at + k).filter((i) => g.temperatureMean1h[i] != null).map(hourAt)
  const cur = fromMsIcon(d.currentWeather?.icon ?? g.weatherIcon3h[Math.floor(at / 3)])
  const temp = d.currentWeather?.temperature ?? g.temperatureMean1h[at]
  const current: Current = { temp, feels: windChill(temp, g.windSpeed1h[at]), code: cur.code, isDay: cur.isDay, wind: g.windSpeed1h[at], gusts: g.gustSpeed1h[at], humidity: null }
  const dayStart = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
  const daily = (d.forecast as any[]).slice(0, 5).map((f, i) => {
    // The day's highest 3-hour rain chance, where the feed has one.
    const from = Math.floor((dayStart(f.dayDate) - dayStart(d.forecast[0].dayDate)) / (3 * H))
    const pops = g.precipitationProbability3h.slice(from, from + 8)
    return {
      t: dayStart(f.dayDate), code: fromMsIcon(f.iconDay).code, max: f.temperatureMax, min: f.temperatureMin,
      pop: pops.length ? Math.max(...pops) : null, precip: f.precipitation, sunrise: g.sunrise[i] ?? null, sunset: g.sunset[i] ?? null,
    }
  })
  // 10-minute rain amounts, as 15-minute ones like Open-Meteo's (mm per 15 min).
  const nowcast: Slot[] = (g.precipitation10m as number[]).map((mm, i) => ({ t: g.start + i * 600_000, mm: mm * 1.5 }))
  return { current, hourly, daily, nowcast, warnings: warningsFrom(d), source: 'MeteoSwiss' }
}

async function fromOpenMeteo(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    // MeteoSwiss's model only covers Switzerland and its surroundings; elsewhere Open-Meteo picks the best model.
    ...(config.location.country === 'CH' ? { models: 'meteoswiss_icon_ch2' } : {}),
    timezone: config.timezone,
    forecast_days: '5',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_gusts_10m',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,is_day,wind_gusts_10m,uv_index',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset',
    minutely_15: 'precipitation',
    forecast_minutely_15: '12', // next 3 hours, for the rain alert
    timeformat: 'unixtime',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  const d: any = await res.json()

  const nowSec = Date.now() / 1000
  const h = d.hourly
  const first = Math.max(0, h.time.findIndex((t: number) => t + 3600 > nowSec))
  const hourly: Hour[] = h.time.slice(first, first + 12).map((t: number, i: number) => ({
    t: t * 1000,
    temp: h.temperature_2m[first + i],
    pop: h.precipitation_probability[first + i],
    precip: h.precipitation[first + i],
    code: h.weather_code[first + i],
    isDay: h.is_day[first + i] === 1,
    feels: h.apparent_temperature[first + i],
    gusts: h.wind_gusts_10m[first + i],
    uv: h.uv_index[first + i],
  }))
  const daily = d.daily.time.map((t: number, i: number) => ({
    t: t * 1000,
    code: d.daily.weather_code[i],
    max: d.daily.temperature_2m_max[i],
    min: d.daily.temperature_2m_min[i],
    pop: d.daily.precipitation_probability_max[i],
    precip: d.daily.precipitation_sum[i],
    sunrise: d.daily.sunrise[i] * 1000,
    sunset: d.daily.sunset[i] * 1000,
  }))
  const c = d.current
  const current: Current = {
    temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, isDay: c.is_day === 1,
    wind: c.wind_speed_10m, gusts: c.wind_gusts_10m, humidity: c.relative_humidity_2m,
  }
  const m = d.minutely_15
  const nowcast: Slot[] = (m?.time ?? []).map((t: number, i: number) => ({ t: t * 1000, mm: m.precipitation[i] ?? 0 }))
  const warnings = config.location.meteoswissPoint ? await fetchWarnings().catch(() => []) : []
  return { current, hourly, daily, nowcast, warnings, source: 'Open-Meteo' }
}

// Wind chill (as MeteoSwiss and most weather services use it): only below 10° with some wind.
function windChill(t: number, kmh: number) {
  if (t == null) return t
  if (t > 10 || !(kmh > 4.8)) return t
  const v = Math.pow(kmh, 0.16)
  return 13.12 + 0.6215 * t - 11.37 * v + 0.3965 * t * v
}

// MeteoSwiss's weather icons (1–42 by day, 101–142 the same by night) as the WMO codes the
// dashboard's icons use: clear, partly cloudy, cloudy, fog, rain or showers, sleet, snow, storms.
function fromMsIcon(n: number) {
  const isDay = n < 100
  const k = n % 100
  const code =
    k === 1 ? 0 : k === 2 || k === 26 ? 1 : k === 3 ? 2 : [4, 5, 35].includes(k) ? 3 : [27, 28].includes(k) ? 45 :
    [12, 13, 23, 24, 25, 36, 37, 38, 39].includes(k) ? 95 :
    [8, 11, 16, 19, 22, 30, 34, 41].includes(k) ? 73 :
    [7, 10, 15, 18, 21, 31, 42].includes(k) ? 66 :
    [6, 9, 29, 32].includes(k) ? 80 : k === 14 ? 51 : [17, 20, 33, 40].includes(k) ? 63 : 3
  return { code, isDay }
}

// One short line for the header, e.g. "Rain likely in about 30 min" or "Rain easing in about 45 min".
function rainAlert(slotsAll: Slot[], hourly: { t: number; pop: number }[]) {
  const WET = 0.1 // mm per 15 min
  const now = Date.now()
  const slots = slotsAll.filter((x) => x.t + 900_000 > now).slice(0, 18)
  const mins = (t: number) => Math.max(15, Math.round((t - now) / 60_000 / 15) * 15)
  if (slots.length) {
    if (slots[0].mm >= WET) {
      const dry = slots.find((x) => x.mm < WET)
      return dry ? { kind: 'easing', text: `Rain easing in about ${mins(dry.t)} min` } : { kind: 'now', text: 'Rain for the next few hours' }
    }
    const wet = slots.find((x) => x.mm >= WET)
    if (wet) return { kind: 'soon', text: `Rain likely in about ${mins(wet.t)} min` }
    return null
  }
  const h = hourly.slice(0, 3).find((x) => (x.pop ?? 0) >= 60)
  return h ? { kind: 'soon', text: 'Rain likely within 3 hours' } : null
}

// "Before you go": what to bring and wear for the next ~2 hours. Plain rules, no AI, so it's
// instant and always available. Thresholds are deliberately cautious.
function advice(cur: Current, nowcast: Slot[], hourly: Hour[]) {
  const now = Date.now()
  const next = hourly.filter((h) => h.t < now + 2 * 3600_000 + 1)
  const feelsNow = cur.feels
  const feelsMin = Math.min(feelsNow, ...next.map((h) => h.feels).filter((x) => x != null))
  const gusts = Math.max(cur.gusts ?? 0, ...next.map((h) => h.gusts ?? 0))
  const uv = Math.max(0, ...next.map((h) => h.uv ?? 0))
  const snowy = [cur.code, ...next.map((h) => h.code)].some((c) => (c >= 71 && c <= 77) || c === 85 || c === 86)
  const wetSlot = nowcast.find((x) => x.t + 900_000 > now && x.t < now + 2 * 3600_000 && x.mm >= 0.1)
  const likelyWet = next.some((h) => (h.pop ?? 0) >= 50)
  const hhmm = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t)
  const items: { icon: string; text: string }[] = []

  if (snowy) items.push({ icon: '❄️', text: 'Snow: boots with grip' })
  else if (wetSlot) items.push({ icon: '☂️', text: wetSlot.t <= now ? 'Umbrella: raining now' : `Umbrella from ${hhmm(wetSlot.t)}` })
  else if (likelyWet) items.push({ icon: '☂️', text: 'Umbrella: showers possible' })

  const layer =
    feelsMin < 0 ? 'Coat, hat, gloves' :
    feelsMin < 6 ? 'Warm coat, scarf' :
    feelsMin < 12 ? 'Warm jacket' :
    feelsMin < 17 ? 'Light jacket' :
    feelsMin < 23 ? 'Light layer' : 'T-shirt weather'
  items.push({ icon: feelsMin < 12 ? '🧥' : feelsMin < 23 ? '👕' : '😎', text: `${layer} · feels ${Math.round(feelsMin)}°` })

  if (feelsNow - feelsMin >= 4) items.push({ icon: '🧣', text: 'Getting colder: extra layer' })
  if (gusts >= 50) items.push({ icon: '💨', text: `Gusts ${Math.round(gusts)} km/h: hood, not umbrella` })
  if (feelsMin <= 1 && (wetSlot || likelyWet) && !snowy) items.push({ icon: '⚠️', text: 'Possible ice: watch your step' })
  if (uv >= 6) items.push({ icon: '🕶️', text: `UV ${Math.round(uv)}: sunglasses, sunscreen` })
  return items.slice(0, 3)
}

async function fetchWarnings() {
  const res = await fetch(`https://app-prod-ws.meteoswiss-app.ch/v1/plzDetail?plz=${config.location.meteoswissPoint}`, {
    headers: { 'User-Agent': 'MeteoSwissApp-2.16-Android', 'Accept-Language': 'en' },
  })
  return res.ok ? warningsFrom(await res.json()) : []
}

function warningsFrom(d: any) {
  return ((d.warnings ?? []) as any[])
    .filter((w) => (w.warnLevel ?? 0) >= 2) // level 1 = minimal or no danger
    .map((w) => ({
      type: WARN_TYPES[w.warnType] ?? 'Weather warning',
      level: w.warnLevel as number,
      text: String(w.text ?? w.htmlText ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      from: w.validFrom ?? null,
      to: w.validTo ?? null,
    }))
}
