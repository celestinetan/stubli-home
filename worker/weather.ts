import config from './config'

// Forecast: Open-Meteo (free, worldwide); in Switzerland it uses MeteoSwiss's ICON-CH2 model.
// Swiss warnings: the (unofficial) feed behind the MeteoSwiss app. If it breaks, only warnings disappear.

const WARN_TYPES: Record<number, string> = {
  0: 'Wind', 1: 'Thunderstorms', 2: 'Rain', 3: 'Snow', 4: 'Slippery roads', 5: 'Frost',
  6: 'Flooding', 7: 'Heat', 8: 'Avalanches', 9: 'Earthquake', 10: 'Forest fire', 11: 'Flooding',
}

export async function fetchWeather() {
  const { latitude, longitude } = config.location
  if (latitude == null || longitude == null) throw new Error('Choose your city in Settings')
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
  const hourly = h.time.slice(first, first + 12).map((t: number, i: number) => ({
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

  return {
    current: {
      temp: d.current.temperature_2m,
      feels: d.current.apparent_temperature,
      code: d.current.weather_code,
      isDay: d.current.is_day === 1,
      wind: d.current.wind_speed_10m,
      humidity: d.current.relative_humidity_2m,
    },
    hourly,
    daily,
    rain: rainAlert(d.minutely_15, hourly),
    advice: advice(d.current, d.minutely_15, hourly),
    warnings: config.location.meteoswissPoint ? await fetchWarnings().catch(() => []) : [],
  }
}

// One short line for the header, e.g. "Rain likely in about 30 min" or "Rain easing in about 45 min".
function rainAlert(m: any, hourly: { t: number; pop: number }[]) {
  const WET = 0.1 // mm per 15 min
  const now = Date.now() / 1000
  const slots: { t: number; mm: number }[] = (m?.time ?? [])
    .map((t: number, i: number) => ({ t, mm: m.precipitation[i] ?? 0 }))
    .filter((x: { t: number }) => x.t + 900 > now)
  const mins = (t: number) => Math.max(15, Math.round((t - now) / 60 / 15) * 15)
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
function advice(cur: any, m: any, hourly: any[]) {
  const now = Date.now()
  const next = hourly.filter((h) => h.t < now + 2 * 3600_000 + 1)
  const feelsNow = cur.apparent_temperature as number
  const feelsMin = Math.min(feelsNow, ...next.map((h) => h.feels).filter((x) => x != null))
  const gusts = Math.max(cur.wind_gusts_10m ?? 0, ...next.map((h) => h.gusts ?? 0))
  const uv = Math.max(0, ...next.map((h) => h.uv ?? 0))
  const snowy = [cur.weather_code, ...next.map((h) => h.code)].some((c) => (c >= 71 && c <= 77) || c === 85 || c === 86)
  const wetSlot = (m?.time ?? [])
    .map((t: number, i: number) => ({ t: t * 1000, mm: m.precipitation[i] ?? 0 }))
    .find((x: { t: number; mm: number }) => x.t + 900_000 > now && x.t < now + 2 * 3600_000 && x.mm >= 0.1)
  const likelyWet = next.some((h) => (h.pop ?? 0) >= 50)
  const hhmm = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t)
  const items: { icon: string; text: string }[] = []

  if (snowy) items.push({ icon: '❄️', text: 'Snow — wear boots with grip' })
  else if (wetSlot) items.push({ icon: '☂️', text: wetSlot.t <= now ? 'Take an umbrella — raining now' : `Take an umbrella — rain from about ${hhmm(wetSlot.t)}` })
  else if (likelyWet) items.push({ icon: '☂️', text: 'Umbrella advised — showers possible' })

  const layer =
    feelsMin < 0 ? 'Winter coat, hat and gloves' :
    feelsMin < 6 ? 'Warm coat and a scarf' :
    feelsMin < 12 ? 'Warm jacket' :
    feelsMin < 17 ? 'Light jacket or jumper' :
    feelsMin < 23 ? 'A light layer is enough' : 'T-shirt weather'
  items.push({ icon: feelsMin < 12 ? '🧥' : feelsMin < 23 ? '👕' : '😎', text: `${layer} — feels like ${Math.round(feelsMin)}°` })

  if (feelsNow - feelsMin >= 4) items.push({ icon: '🧣', text: 'Getting colder — bring an extra layer' })
  if (gusts >= 50) items.push({ icon: '💨', text: `Gusts to ${Math.round(gusts)} km/h — a hood beats an umbrella` })
  if (feelsMin <= 1 && (wetSlot || likelyWet) && !snowy) items.push({ icon: '⚠️', text: 'Possible ice — watch your step' })
  if (uv >= 6) items.push({ icon: '🕶️', text: `UV ${Math.round(uv)} — sunglasses and sunscreen` })
  return items.slice(0, 3)
}

async function fetchWarnings() {
  const res = await fetch(`https://app-prod-ws.meteoswiss-app.ch/v1/plzDetail?plz=${config.location.meteoswissPoint}`, {
    headers: { 'User-Agent': 'MeteoSwissApp-2.16-Android', 'Accept-Language': 'en' },
  })
  if (!res.ok) return []
  const d: any = await res.json()
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
