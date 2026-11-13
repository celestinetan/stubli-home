import config from './config'

// One structured-JSON request to Gemini (free tier), used for news.
// Streamed, so the connection stays busy: a long single answer gets cut off after ~100 s.
// When the main model is busy (it often is), the answer is slow or never comes, so each try has a
// time limit; a timeout, an overload or a dropped connection moves on to the lighter model once.
// An answer cut off part way still gives the stories it finished.

const LIMIT_MS = 90_000
const RETRY = new Set([429, 500, 502, 503, 504, 520, 522, 524])
const MIN_SALVAGED = 10 // fewer complete stories than this from a cut-off answer isn't worth keeping

export async function geminiJSON(key: string, prompt: string, schema: object, opts: { thinking?: boolean; fallback?: boolean } = {}): Promise<any> {
  const generationConfig: any = { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema }
  // Grouping and summarising headlines doesn't need extended reasoning, and it makes calls much slower.
  if (!opts.thinking) generationConfig.thinkingConfig = { thinkingBudget: 0 }
  const model = opts.fallback ? config.news.gemini.fallbackModel : config.news.gemini.model
  const canFallBack = !opts.fallback && !!config.news.gemini.fallbackModel
  const next = (why: string) => {
    if (canFallBack) return geminiJSON(key, prompt, schema, { ...opts, fallback: true })
    throw new Error(why)
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), LIMIT_MS)
  let res: Response
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
      signal: ctrl.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    return next(`Gemini ${model}: ${ctrl.signal.aborted ? 'no answer within 90 s' : e instanceof Error ? e.message : e}`)
  }
  if (!res.ok) {
    clearTimeout(timer)
    const text = (await res.text()).replace(/\s+/g, ' ').slice(0, 700)
    // Some models refuse a zero thinking budget (often with a vague message); retry once with their default.
    if (res.status === 400 && !opts.thinking) return geminiJSON(key, prompt, schema, { ...opts, thinking: true })
    if (RETRY.has(res.status)) return next(`Gemini ${res.status}: ${text}`)
    throw new Error(`Gemini ${res.status}: ${text}`)
  }

  // Read the stream as it arrives, so a time limit or a dropped connection still leaves what came.
  let raw = '', buffer = '', cut = false
  const take = (line: string) => {
    if (!line.startsWith('data:')) return
    try {
      const chunk = JSON.parse(line.slice(5))
      raw += chunk.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? ''
    } catch { /* a partial line at the very end */ }
  }
  try {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(take)
    }
    take(buffer)
  } catch {
    cut = true
  }
  clearTimeout(timer)

  try {
    return JSON.parse(raw || 'null')
  } catch {
    const saved = salvage(raw)
    if (saved.length >= MIN_SALVAGED && !canFallBack) return saved
    if (canFallBack) {
      // The lighter model may do better; if it fails too, what the first answer finished will do.
      try { return await next('') } catch (e) { if (saved.length >= MIN_SALVAGED) return saved; throw e }
    }
    throw new Error(`Gemini ${model}: ${cut || ctrl.signal.aborted ? 'answer cut off' : 'unreadable answer'} after ${raw.length} characters`)
  }
}

// The complete objects at the start of a JSON array that was cut off part way.
export function salvage(raw: string): any[] {
  const start = raw.indexOf('[')
  if (start < 0) return []
  let depth = 0, inString = false, escaped = false, lastEnd = -1
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 1 && ch === '}') lastEnd = i
    }
  }
  if (lastEnd < 0) return []
  try { return JSON.parse(raw.slice(start, lastEnd + 1) + ']') } catch { return [] }
}
