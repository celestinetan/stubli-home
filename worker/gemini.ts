import config from './config'

// One structured-JSON request to Gemini (free tier), used for news.
// Streamed, so the connection stays busy: a long single answer gets cut off after ~100 s.
export async function geminiJSON(key: string, prompt: string, schema: object, opts: { thinking?: boolean; fallback?: boolean } = {}): Promise<any> {
  const generationConfig: any = { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema }
  // Grouping and summarising headlines doesn't need extended reasoning, and it makes calls much slower.
  if (!opts.thinking) generationConfig.thinkingConfig = { thinkingBudget: 0 }
  const model = opts.fallback ? config.news.gemini.fallbackModel : config.news.gemini.model
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
  })
  if (!res.ok) {
    const text = (await res.text()).replace(/\s+/g, " ").slice(0, 700)
    // Some models refuse a zero thinking budget (often with a vague message); retry once with their default.
    if (res.status === 400 && !opts.thinking) return geminiJSON(key, prompt, schema, { ...opts, thinking: true })
    // Overloaded or rate-limited: try the lighter model once.
    if ((res.status === 503 || res.status === 429) && !opts.fallback && config.news.gemini.fallbackModel) {
      return geminiJSON(key, prompt, schema, { ...opts, fallback: true })
    }
    throw new Error(`Gemini ${res.status}: ${text}`)
  }
  let raw = ''
  for (const line of (await res.text()).split('\n')) {
    if (!line.startsWith('data:')) continue
    const chunk = JSON.parse(line.slice(5))
    raw += chunk.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? ''
  }
  return JSON.parse(raw || 'null')
}
