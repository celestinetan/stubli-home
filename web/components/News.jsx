import { useMemo, useState } from 'preact/hooks'
import { renderSVG } from 'uqr'
import { ago } from '../lib.js'
import { Close, External, Qr, ChevronLeft, ChevronRight } from './icons.jsx'
import { Updated } from './Updated.jsx'

const outlets = (s) => [...new Set(s.sources.map((x) => x.name))]

// Builds the cards: "Top stories" first, then one per configured category. Each headline shows
// on only one card (the first it fits), so the column never repeats itself; opening a card still
// lists everything in it.
export function buildCards(stories, categories) {
  if (!stories) return []
  // Stories arrive sorted by importance score; Top skips opinion and feature pieces.
  const hard = stories.filter((s) => !s.kind || s.kind === 'news' || s.kind === 'analysis')
  const shown = new Set()
  const take = (list) => { const out = list.filter((s) => !shown.has(s.id)).slice(0, 2); out.forEach((s) => shown.add(s.id)); return out }
  const cards = [{ id: 'top', name: 'Top stories', stories: take(hard), all: hard.slice(0, 15) }]
  for (const c of categories ?? []) {
    const inCat = stories.filter((s) => (s.categories ?? []).includes(c.id))
    cards.push({ ...c, stories: take(inCat), all: inCat })
  }
  return cards
}
const useCards = (stories, categories) => useMemo(() => buildCards(stories, categories), [stories, categories])

// One column: "Top stories" first, then a card per category; the column scrolls.
export function News({ now, news, categories, onOpenCategory }) {
  const cards = useCards(news?.data?.stories, categories)
  return (
    <section class="panel news">
      <h2>News <Updated slot={news} /></h2>
      {!news?.data ? <p class="muted">{news?.error ? 'The news didn\'t load this time. Trying again shortly.' : 'Loading news…'}</p> : (
        <div class="cat-list scroll">
          {cards.map((c) => (
            <button class="cat-card" key={c.id} onClick={() => onOpenCategory(c)}>
              <span class="cat-name">{c.name}<span class="cat-count">{c.all.length || ''}</span></span>
              {c.stories.length === 0 ? <span class="muted">{c.id === 'local' && !c.all.length ? `Add news outlets from ${c.name} in Settings → News, with the ${c.name} category.` : c.all.length ? 'Already shown above · tap for all' : 'No recent stories'}</span> : c.stories.map((s) => {
                const n = outlets(s).length
                return (
                  <span class="cat-story" key={s.id}>
                    <span class="cat-headline">{s.headline}</span>
                    <span class="cat-meta">{n > 1 ? <span class="badge">{n} sources</span> : <span>{outlets(s)[0]}</span>} · {ago(s.published, now)}</span>
                  </span>
                )
              })}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export function CategoryPanel({ card, now, onOpen, onClose }) {
  return (
    <div class="overlay" onClick={onClose}>
      <div class="sheet category-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={card.name}>
        <button class="icon-btn close" onClick={onClose} aria-label="Close"><Close /></button>
        <h2 class="cat-title">{card.name}</h2>
        {card.all.length === 0 ? <p class="muted">{card.id === 'local' ? `No ${card.name} outlets yet. Add one in Settings → News: paste its RSS link and pick the ${card.name} category. Any language works with a Gemini key.` : 'No recent stories in this category.'}</p> : (
          <ul class="stories">
            {card.all.map((s) => {
              const names = outlets(s)
              return (
                <li key={s.id}>
                  <button class="story" onClick={() => onOpen(s, card.all)}>
                    <span class="story-headline">{s.headline}</span>
                    {s.summary && <span class="story-summary">{s.summary}</span>}
                    <span class="story-meta">
                      {names.length > 1
                        ? <span class="badge">{names.length} sources</span>
                        : <span class="badge single">Single source · {names[0]}</span>}
                      <span>{ago(s.published, now)}</span>
                      {(s.reasons ?? []).filter((r) => !/outlets/.test(r)).map((r) => <span class="tag" key={r}>{r}</span>)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export function StoryPanel({ story, list = [], now, onOpen, onClose }) {
  const [qr, setQr] = useState(null)
  const names = outlets(story)
  const at = list.findIndex((s) => s.id === story.id)
  const go = (d) => { setQr(null); onOpen(list[at + d], list) }
  return (
    <div class="overlay" onClick={onClose}>
      <article class="sheet story-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={story.headline}>
        <button class="icon-btn close" onClick={onClose} aria-label="Close"><Close /></button>
        <p class="story-kicker">
          {names.length > 1 ? `${names.length} sources` : names[0]} · {ago(story.published, now)}
          {(story.reasons ?? []).filter((r) => !/outlets/.test(r)).map((r) => <span class="tag" key={r}>{r}</span>)}
        </p>
        <h2 class="story-title">{story.headline}</h2>
        {story.summary && <p class="story-full">{story.summary}</p>}
        {story.differences && <p class="differences"><strong>Where they differ</strong> {story.differences}</p>}
        <p class="muted small story-note">
          {story.ai ? `AI summary of headlines from ${names.join(', ')}` : names.length > 1 ? `Reported by ${names.join(', ')}` : `Reported only by ${names[0]}`}
        </p>

        {story.sources?.length > 0 && <h3>Read it yourself</h3>}
        <ul class="sources">
          {story.sources.map((s) => (
            <li key={s.link}>
              <div class="source-text">
                <span class="source-name">{s.name} <span class="muted">· {ago(s.published, now)}{s.translated ? ' · translated' : ''}</span></span>
                <span class="source-title">{s.title}</span>
              </div>
              <a class="btn" href={s.link} target="_blank" rel="noopener noreferrer"><External size={20} /> Open</a>
              <button class="btn" onClick={() => setQr(qr === s.link ? null : s.link)} aria-pressed={qr === s.link}><Qr size={20} /> On phone</button>
              {qr === s.link && (
                <div class="qr" dangerouslySetInnerHTML={{ __html: renderSVG(s.link, { border: 2 }) }} />
              )}
            </li>
          ))}
        </ul>

        {list.length > 1 && at >= 0 && (
          <nav class="story-nav" aria-label="More stories">
            <button class="btn" disabled={at === 0} onClick={() => go(-1)}><ChevronLeft size={20} /> Previous</button>
            <span class="muted">{at + 1} of {list.length}</span>
            <button class="btn" disabled={at === list.length - 1} onClick={() => go(1)}>Next <ChevronRight size={20} /></button>
          </nav>
        )}
      </article>
    </div>
  )
}
