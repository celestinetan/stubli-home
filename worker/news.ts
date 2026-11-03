import config from './config'
import { fetchText, logError, type Env } from './store'
import { geminiJSON } from './gemini'

// Collects headlines from the configured feeds, groups articles about the same story and
// summarises each story. Only the headline and the short description each feed publishes are
// used — full articles are never copied; the dashboard links to the originals.

interface Item { id: number; source: string; region: string; lang: string; categories: string[]; title: string; desc: string; link: string; published: number }

export interface Story {
  id: string
  headline: string
  summary: string
  differences: string
  region: string
  published: number
  ai: boolean
  categories: string[]
  impact: number // 1-5
  kind: 'news' | 'analysis' | 'opinion' | 'feature'
  score: number
  reasons: string[]
  sources: { name: string; title: string; link: string; published: number; translated?: boolean }[]
}

interface NewsData { stories: Story[]; feeds: { name: string; url: string; ok: boolean }[]; aiAt: number | null; fingerprint: string }

// The free plan allows ~50 outbound requests per run, so feeds are collected in two halves by
// separate scheduled runs; the second run merges both halves and builds the stories.
const BATCHES = 2
type Batch = { at: number; items: Omit<Item, 'id'>[]; feeds: NewsData['feeds'] }

export async function collectNewsBatch(env: Env, batch: number) {
  const feeds = config.news.feeds.filter((_, i) => i % BATCHES === batch)
  const results = await Promise.allSettled(feeds.map((f) => fetchText(f.url)))
  const cutoff = Date.now() - config.news.maxAgeHours * 3600_000
  const items: Batch['items'] = []
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    const f = feeds[i]
    for (const it of parseFeed(r.value, config.news.perSourceCap)) {
      if (it.published < cutoff) continue
      items.push({ ...it, source: f.name, region: f.region, lang: f.lang ?? 'en', categories: f.category ? [f.category] : [] })
    }
  })
  const out: Batch = { at: Date.now(), items, feeds: feeds.map((f, i) => ({ name: f.name, url: f.url, ok: results[i].status === 'fulfilled' })) }
  await env.KV.put(`news-batch:${batch}`, JSON.stringify(out))
  return out
}

export async function fetchNews(env: Env, prev: NewsData | null): Promise<NewsData> {
  // This run collects the last half itself and reads the others from storage.
  const batches: (Batch | null)[] = []
  for (let b = 0; b < BATCHES - 1; b++) batches.push(await env.KV.get<Batch>(`news-batch:${b}`, 'json'))
  batches.push(await collectNewsBatch(env, BATCHES - 1))

  const block = config.news.blockKeywords.map((k) => k.toLowerCase())
  const seen = new Map<string, Item>()
  const items: Item[] = []
  for (const it of batches.flatMap((b) => b?.items ?? [])) {
    const dup = seen.get(it.link)
    if (dup) { for (const c of it.categories) if (!dup.categories.includes(c)) dup.categories.push(c); continue }
    const hay = `${it.title} ${it.desc}`.toLowerCase()
    if (block.some((k) => hay.includes(k))) continue
    const item = { ...it, categories: [...it.categories], id: items.length }
    seen.set(it.link, item)
    items.push(item)
  }
  const feedStatus = batches.flatMap((b) => b?.feeds ?? [])
  if (!items.length) throw new Error('No news items from any feed')
  items.sort((a, b) => b.published - a.published)

  // Ask Gemini only when enough has changed and not too often (free-tier quota).
  const fingerprint = items.slice(0, 60).map((i) => i.link).sort().join('|')
  const changed = !prev || prev.fingerprint !== fingerprint
  const due = !prev?.aiAt || Date.now() - prev.aiAt > config.news.gemini.minMinutesBetweenCalls * 60_000
  const prevAi = prev?.stories.some((s) => s.ai) && Date.now() - (prev.aiAt ?? 0) < 6 * 3600_000
  const geminiKey = (await env.KV.get('secret:gemini')) ?? env.GEMINI_API_KEY
  if (geminiKey && due && (changed || !prevAi)) {
    try {
      const stories = await summariseWithGemini(geminiKey, items)
      return { stories, feeds: feedStatus, aiAt: Date.now(), fingerprint }
    } catch (e) {
      console.error('Gemini failed', e)
      await logError(env, 'server', `Gemini: ${e instanceof Error ? e.message : e}`)
    }
  }
  // Keep recent AI summaries until the next call is allowed (or Gemini is back).
  if (prevAi) return { ...prev!, feeds: feedStatus }
  return { stories: groupBasic(items), feeds: feedStatus, aiAt: prev?.aiAt ?? null, fingerprint }
}

// ---------- feed parsing (RSS 2.0, RSS 1.0/RDF, Atom) ----------

const entities = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[e as 'amp'])

// Some feeds (e.g. the Guardian) escape their HTML, so strip tags both before and after decoding.
const decode = (s: string) =>
  entities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function tag(block: string, name: string) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block)
  return m ? m[1] : ''
}

export function parseFeed(xml: string, limit: number) {
  // Stop after `limit` items: some feeds carry hundreds, and CPU time is tight on the free plan.
  const blocks: string[] = []
  const re = /<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi
  for (let m; blocks.length < limit && (m = re.exec(xml)); ) blocks.push(m[0])
  return blocks.map((b) => {
    const atomLink = /<link[^>]*href="([^"]+)"/i.exec(b)?.[1]
    const date = tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'updated') || tag(b, 'published')
    let desc = decode(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'))
    if (desc.length > 280) desc = desc.slice(0, 277).replace(/\s\S*$/, '') + '…'
    return {
      title: decode(tag(b, 'title')),
      link: decode(tag(b, 'link')) || atomLink || '',
      desc,
      published: Date.parse(decode(date)) || Date.now(),
    }
  }).filter((i) => i.title && /^https?:\/\//.test(i.link))
}

// ---------- Gemini (free tier) ----------

async function summariseWithGemini(key: string, items: Item[]): Promise<Story[]> {
  const cats = config.news.categories
  // Up to 6 newest per feed, so prolific outlets don't crowd out the rest.
  const perFeed = new Map<string, number>()
  const pick = items.filter((i) => {
    const k = `${i.source}|${i.categories[0] ?? ''}`
    const n = perFeed.get(k) ?? 0
    perFeed.set(k, n + 1)
    return n < 6
  }).slice(0, 260)
  const list = pick.map((i) => `${i.id} | ${i.source}${i.lang !== 'en' ? ` [${i.lang}]` : ''} | ${i.categories.join(',') || '-'} | ${i.title} | ${i.desc.slice(0, 90)}`).join('\n')
  const prompt = `You curate a news display for a reader in ${config.location.name}${config.location.country ? ` (${config.location.country})` : ''}.
Below are recent articles, one per line: "id | outlet | feed section hint | headline | description".

1. Group articles that report the SAME story (same event), across outlets.
2. Choose up to ${config.news.maxStories} stories, so that EVERY category below gets its 4-6 most important
   stories where available. Favour stories covered by several outlets, but include notable single-outlet
   stories, especially local ones.
3. For each story write:
   - headline: neutral, factual, max 12 words
   - summary: 2-3 neutral sentences using ONLY facts present in the given headlines/descriptions
   - differences: one sentence on how outlets' framing or facts differ, or "" if they agree or only one outlet
   - region: "Local" (about ${config.location.country || 'the reader\'s country'}) or "World"
   - categories: 1 or 2 of: ${cats.map((c) => `"${c.id}" (${c.name})`).join(', ')}.
     Use "world" for international stories that fit no regional category. The section hint helps but may be wrong.
   - impact: 1-5, how many people are affected and how seriously. 5 = major war, disaster, election result,
     global market shock; 4 = significant national/international policy or economic news; 3 = notable regional news;
     2 = minor news; 1 = celebrity, quirky or trivial. Judge the event, not how dramatic the headline sounds.
   - kind: "news" (reports an event), "analysis" (explainer), "opinion" (comment, column) or "feature" (lifestyle, profile, review)
   - itemIds: ids of all articles in the group
   - translations: for each article in the group marked [de] (or any non-English article), its headline
     translated into natural English: { id, title }. Empty list if all are English.
Never invent facts. Write everything in English, translating non-English sources faithfully.

${list}`

  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        headline: { type: 'STRING' },
        summary: { type: 'STRING' },
        differences: { type: 'STRING' },
        region: { type: 'STRING', enum: ['Local', 'World'] },
        categories: { type: 'ARRAY', items: { type: 'STRING', enum: cats.map((c) => c.id) } },
        impact: { type: 'INTEGER' },
        kind: { type: 'STRING', enum: ['news', 'analysis', 'opinion', 'feature'] },
        itemIds: { type: 'ARRAY', items: { type: 'INTEGER' } },
        translations: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: { id: { type: 'INTEGER' }, title: { type: 'STRING' } }, required: ['id', 'title'] },
        },
      },
      required: ['headline', 'summary', 'differences', 'region', 'categories', 'impact', 'kind', 'itemIds'],
    },
  }
  const parsed = (await geminiJSON(key, prompt, schema)) ?? []
  const byId = new Map(items.map((i) => [i.id, i]))
  const stories: Story[] = (parsed as any[])
    .map((s) => {
      const english = new Map<number, string>((s.translations ?? []).map((t: any) => [t.id, t.title]))
      const members = ([...new Set<number>(s.itemIds)].map((id) => byId.get(id)).filter(Boolean) as Item[])
        .map((m) => (english.has(m.id) ? { ...m, title: english.get(m.id)!, translated: true } : m))
      return members.length ? toStory(members, s.headline, s.summary, s.differences, s.region, true, s.categories, s.impact, s.kind) : null
    })
    .filter(Boolean) as Story[]
  if (!stories.length) throw new Error('Gemini returned no stories')
  return rank(stories)
}

// ---------- fallback: group by shared headline words ----------

const STOP = new Set('about after against again amid among also back been before being between could during first from have into just more most news over says said says than that their them then there these they this those through under were what when where which while with would year years your after live update updates video watch'.split(' '))

function words(title: string) {
  return new Set(title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g)?.filter((w) => !STOP.has(w)) ?? [])
}

function groupBasic(items: Item[]): Story[] {
  const pool = items.slice(0, 300).map((i) => ({ item: i, w: words(i.title) }))
  const groups: (typeof pool)[] = []
  for (const p of pool) {
    const g = groups.find((g) => {
      const w = g[0].w
      let shared = 0
      for (const x of p.w) if (w.has(x)) shared++
      return shared >= 3 || (shared >= 2 && shared / Math.min(w.size, p.w.size) >= 0.5)
    })
    if (g) { if (!g.some((x) => x.item.source === p.item.source)) g.push(p) }
    else groups.push([p])
  }
  const ranked = rank(groups.map((g) => {
    const lead = g[0].item
    return toStory(g.map((x) => x.item), lead.title, lead.desc, '', lead.region, false)
  }))
  // Keep the best few per category so every card has something, plus the overall leaders.
  const keep = new Set(ranked.slice(0, 8))
  for (const c of config.news.categories) ranked.filter((s) => s.categories.includes(c.id)).slice(0, 6).forEach((s) => keep.add(s))
  return ranked.filter((s) => keep.has(s))
}

function toStory(
  members: Item[], headline: string, summary: string, differences: string, region: string, ai: boolean,
  aiCategories?: string[], aiImpact?: number, aiKind?: Story['kind'],
): Story {
  const sorted = [...members].sort((a, b) => b.published - a.published)
  const valid = new Set(config.news.categories.map((c) => c.id))
  let categories = (aiCategories ?? []).filter((c) => valid.has(c))
  if (!categories.length) categories = [...new Set(members.flatMap((m) => m.categories))].filter((c) => valid.has(c))
  if (!categories.length) categories = [(region || sorted[0].region) === 'Local' && valid.has('local') ? 'local' : 'world']
  return {
    id: sorted[sorted.length - 1].link,
    headline,
    summary,
    differences: differences ?? '',
    region: region || sorted[0].region,
    published: sorted[0].published,
    ai,
    categories,
    // Without AI: assume ordinary news; wider coverage hints at a bigger story.
    impact: Math.max(1, Math.min(5, Math.round(aiImpact ?? (new Set(members.map((m) => m.source)).size >= 3 ? 3 : 2)))),
    kind: aiKind ?? (categories.includes('lifestyle') ? 'feature' : 'news'),
    score: 0,
    reasons: [],
    sources: sorted.map((m) => ({ name: m.source, title: m.title, link: m.link, published: m.published, translated: (m as any).translated || undefined })),
  }
}

// Importance score: impact, independent coverage, momentum and relevance to you, faded by age.
// Weights live in config.news.ranking.
function rank(stories: Story[]) {
  const r = config.news.ranking
  const now = Date.now()
  for (const s of stories) {
    const outlets = new Set(s.sources.map((x) => x.name))
    const regions = new Set([...outlets].map((o) => r.outletRegions[o] ?? o))
    const recent = new Set(s.sources.filter((x) => now - x.published < 2 * 3600_000).map((x) => x.name)).size
    const breaking = recent >= r.breakingOutlets
    const ageH = Math.max(0, (now - s.published) / 3600_000)
    const text = `${s.headline} ${s.summary}`.toLowerCase()
    const relevance =
      s.categories.reduce((sum, c) => sum + (r.categoryBoost[c] ?? 0), 0) +
      (r.keywordBoost.some((k) => text.includes(k.toLowerCase())) ? r.weights.keyword : 0)

    const raw =
      s.impact * r.weights.impact +
      Math.log2(1 + outlets.size) * r.weights.coverage +
      (regions.size - 1) * r.weights.regionDiversity +
      (breaking ? r.weights.breaking : 0) +
      relevance -
      (s.kind === 'opinion' || s.kind === 'feature' ? r.weights.softPenalty : 0)
    s.score = Math.round(raw * Math.pow(0.5, ageH / r.halfLifeHours) * 100) / 100

    s.reasons = [
      breaking && 'Breaking',
      s.impact >= 4 && (s.impact === 5 ? 'Major story' : 'High impact'),
      outlets.size > 1 && `${outlets.size} outlets${regions.size > 1 ? ` across ${regions.size} regions` : ''}`,
      s.categories.includes('local') && 'Local',
      s.kind !== 'news' && s.kind[0].toUpperCase() + s.kind.slice(1),
    ].filter(Boolean) as string[]
  }
  return stories.sort((a, b) => b.score - a.score)
}
