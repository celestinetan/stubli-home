import { useMemo, useState } from 'preact/hooks'
import { renderSVG } from 'uqr'
import { ago } from '../lib.js'
import { Close, External, Qr } from './icons.jsx'
import { Updated } from './Updated.jsx'

const outlets = (s) => [...new Set(s.sources.map((x) => x.name))]

// Builds the cards: "Top stories" first, then one per configured category.
function useCards(stories, categories) {
  return useMemo(() => {
    if (!stories) return []
    // Stories arrive sorted by importance score; Top skips opinion and feature pieces.
    const hard = stories.filter((s) => !s.kind || s.kind === 'news' || s.kind === 'analysis')
    const top = hard.slice(0, 2) // two per card keeps every card the same height
    const cards = [{ id: 'top', name: 'Top stories', color: 'var(--ink)', stories: top, all: hard.slice(0, 15) }]
    for (const c of categories ?? []) {
      const inCat = stories.filter((s) => (s.categories ?? []).includes(c.id))
      // Preview avoids repeating what "Top stories" already shows; the full list keeps everything.
      const preview = inCat.filter((s) => !top.includes(s))
      cards.push({ ...c, stories: (preview.length >= 2 ? preview : inCat).slice(0, 2), all: inCat })
    }
    return cards
  }, [stories, categories])
}

// One column: "Top stories" first, then a card per category; the column scrolls.
export function News({ now, news, categories, onOpenCategory }) {
  const cards = useCards(news?.data?.stories, categories)
  return (
    <section class="panel news">
      <h2>News <Updated slot={news} /></h2>
      {!news?.data ? <p class="muted">{news?.error ? 'The news didn\'t load this time. Trying again shortly.' : 'Loading news…'}</p> : (
        <div class="cat-list scroll">
          {cards.map((c) => (
            <button class="cat-card" key={c.id} style={{ '--cat': c.color }} onClick={() => onOpenCategory(c)}>
              <span class="cat-name">{c.name}<span class="cat-count">{c.all.length || ''}</span></span>
              {c.stories.length === 0 ? <span class="muted">{c.id === 'local' ? `Add news outlets from ${c.name} in Settings → News, with the ${c.name} category.` : 'No recent stories'}</span> : c.stories.map((s) => {
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
      <div class="sheet category-panel" style={{ '--cat': card.color }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={card.name}>
        <button class="icon-btn close" onClick={onClose} aria-label="Close"><Close /></button>
        <h2 class="cat-title">{card.name}</h2>
        {card.all.length === 0 ? <p class="muted">{card.id === 'local' ? `No ${card.name} outlets yet. Add one in Settings → News: paste its RSS link and pick the ${card.name} category. Any language works with a Gemini key.` : 'No recent stories in this category.'}</p> : (
          <ul class="stories">
            {card.all.map((s) => {
              const names = outlets(s)
              return (
                <li key={s.id}>
                  <button class="story" onClick={() => onOpen(s)}>
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

export function StoryPanel({ story, now, onClose }) {
  const [qr, setQr] = useState(null)
  const names = outlets(story)
  return (
    <div class="overlay" onClick={onClose}>
      <article class="sheet story-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={story.headline}>
        <button class="icon-btn close" onClick={onClose} aria-label="Close"><Close /></button>
        <h2 class="panel-title">{story.headline}</h2>
        <p class="muted small">
          {story.ai ? `AI summary of headlines from ${names.join(', ')}` : names.length > 1 ? `Reported by ${names.join(', ')}` : `Reported only by ${names[0]}`}
        </p>
        {story.reasons?.length > 0 && <p class="reasons">{story.reasons.map((r) => <span class="tag" key={r}>{r}</span>)}</p>}
        {story.summary && <p class="story-full">{story.summary}</p>}
        {story.differences && <p class="differences"><strong>Where they differ:</strong> {story.differences}</p>}

        <h3>Sources</h3>
        <ul class="sources">
          {story.sources.map((s) => (
            <li key={s.link}>
              <div class="source-text">
                <span class="source-name">{s.name} <span class="muted">· {ago(s.published, now)}{s.translated ? ' · translated from German' : ''}</span></span>
                <span>{s.title}</span>
              </div>
              <a class="btn" href={s.link} target="_blank" rel="noopener noreferrer"><External size={20} /> Open</a>
              <button class="btn" onClick={() => setQr(qr === s.link ? null : s.link)} aria-label="Show QR code"><Qr size={20} /> Phone</button>
              {qr === s.link && (
                <div class="qr" dangerouslySetInnerHTML={{ __html: renderSVG(s.link, { border: 2 }) }} />
              )}
            </li>
          ))}
        </ul>
      </article>
    </div>
  )
}
