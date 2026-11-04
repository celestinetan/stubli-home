// The defaults for a new dashboard. Almost all of it can be changed from the dashboard's own
// Settings screen, which saves its changes separately, so this file rarely needs editing.
// Secrets (calendar links, API keys) never go here.

export default {
  // Which parts of the dashboard are on, and the order of the three columns (Settings can change these).
  // Music (Sonos) and Lights (Hue) need their own developer keys, so they start switched off.
  // "tablet" plays YouTube or YouTube Music links on the tablet itself, with no keys at all.
  modules: { weather: true, yourDay: true, news: true, whatsOn: true, music: false, lights: false, tablet: true } as Record<string, boolean>,
  columns: ['yourDay', 'news', 'whatsOn'] as ('yourDay' | 'news' | 'whatsOn')[],

  // Empty until you choose your city in Settings → General.
  location: {
    name: '',
    country: '', // ISO code, e.g. 'GB'; turns on local holidays and the local news card
    latitude: null as number | null,
    longitude: null as number | null,
    meteoswissPoint: '', // Swiss locations only: MeteoSwiss warnings (set from the postcode)
  },
  timezone: 'UTC',

  calendar: {
    daysAhead: 7,
    // Colours used for calendars in the order they appear in CALENDAR_FEEDS
    colors: ['#3b82f6', '#e0663a', '#2f9e6b', '#a855c7', '#d4a017', '#0e9aa7'],
    hidden: [] as string[], // calendar names to hide, e.g. ['Holidays']
  },

  news: {
    maxAgeHours: 36,
    perSourceCap: 15,
    maxStories: 48,
    gemini: {
      model: 'gemini-flash-latest',
      fallbackModel: 'gemini-flash-lite-latest', // used when the main model is overloaded
      minMinutesBetweenCalls: 30, // keeps well inside the free daily quota
    },
    // How stories are ordered (most important first). See rank() in news.ts.
    ranking: {
      weights: {
        impact: 1.5, // per impact point (1-5, rated by Gemini)
        coverage: 2, // × log2(1 + number of outlets)
        regionDiversity: 1, // per extra region among the outlets
        breaking: 1.5, // when several outlets reported it in the last 2 hours
        keyword: 1, // when a keywordBoost word appears
        softPenalty: 2, // opinion and feature pieces
      },
      halfLifeHours: 8, // a story's score halves every 8 hours
      breakingOutlets: 3,
      categoryBoost: { local: 2 } as Record<string, number>, // e.g. add 'tech-science': 1, or 'lifestyle': -1
      keywordBoost: [] as string[], // your city's name is always included
      // Outlets from the same country count as one region for diversity.
      outletRegions: {
        'The Local': 'CH', 'Le News': 'CH', 'NZZ English': 'CH', SRF: 'CH', NZZ: 'CH', 'NZZ Zürich': 'CH', 'Tages-Anzeiger': 'CH', '20 Minuten': 'CH',
        'The Hindu': 'IN', Dawn: 'PK', 'Japan Times': 'JP', 'Korea Herald': 'KR', 'ABC Australia': 'AU', CBC: 'CA',
        'Kyiv Independent': 'UA', Meduza: 'RU', AllAfrica: 'AF', 'Buenos Aires Times': 'AR', RFI: 'FR', 'The Economist': 'UK',
        BBC: 'UK', 'The Guardian': 'UK', DW: 'DE', 'France 24': 'FR', Euronews: 'EU',
        'Al Jazeera': 'ME', NPR: 'US', CNA: 'SG', SCMP: 'HK',
      } as Record<string, string>,
    },

    // Words that drop a story (case-insensitive). Add topics to mute here.
    blockKeywords: [] as string[],

    // Cards shown on the dashboard, in this order (after "Top stories").
    // Gemini sorts stories into these; without Gemini, each feed's `category` is used.
    categories: [
      // "Local" is named after your country and filled by feeds you add with the Local category.
      { id: 'local', name: 'Local', color: '#d52b1e' },
      { id: 'world', name: 'World', color: '#3b6fb6' },
      { id: 'us', name: 'US', color: '#5b5fc7' },
      { id: 'china-asia', name: 'China & Asia', color: '#c2410c' },
      { id: 'europe', name: 'Europe', color: '#1d4ed8' },
      { id: 'business', name: 'Business', color: '#0f766e' },
      { id: 'tech-science', name: 'Tech & Science', color: '#7c3aed' },
      { id: 'lifestyle', name: 'Lifestyle', color: '#be185d' },
    ],

    // General feeds (no category) are sorted by Gemini; section feeds add depth per category.
    // Add your own country's outlets in Settings → News with the Local category (any language:
    // Gemini translates headlines into English).
    feeds: [
      { name: 'BBC', region: 'World', category: 'world', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { name: 'The Guardian', region: 'World', category: 'world', url: 'https://www.theguardian.com/world/rss' },
      { name: 'DW', region: 'World', url: 'https://rss.dw.com/rdf/rss-en-all' },
      { name: 'France 24', region: 'World', url: 'https://www.france24.com/en/rss' },
      { name: 'Al Jazeera', region: 'World', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
      { name: 'NPR', region: 'World', url: 'https://feeds.npr.org/1004/rss.xml' },
      { name: 'Euronews', region: 'World', category: 'europe', url: 'https://www.euronews.com/rss' },
      { name: 'CNA', region: 'World', category: 'china-asia', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml' },
      { name: 'SCMP', region: 'World', category: 'china-asia', url: 'https://www.scmp.com/rss/91/feed' },
      { name: 'The Hindu', region: 'World', category: 'china-asia', url: 'https://www.thehindu.com/news/international/feeder/default.rss' },
      { name: 'Japan Times', region: 'World', category: 'china-asia', url: 'https://www.japantimes.co.jp/feed/' },
      { name: 'ABC Australia', region: 'World', url: 'https://www.abc.net.au/news/feed/2942460/rss.xml' },
      { name: 'CBC', region: 'World', url: 'https://www.cbc.ca/webfeed/rss/rss-world' },
      { name: 'Kyiv Independent', region: 'World', category: 'europe', url: 'https://kyivindependent.com/news-archive/rss/' },
      { name: 'AllAfrica', region: 'World', category: 'world', url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf' },
      { name: 'Buenos Aires Times', region: 'World', category: 'world', url: 'https://www.batimes.com.ar/feed' },
      { name: 'RFI', region: 'World', url: 'https://www.rfi.fr/en/rss' },
      // Section feeds
      { name: 'BBC', region: 'World', category: 'us', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' },
      { name: 'The Guardian', region: 'World', category: 'us', url: 'https://www.theguardian.com/us-news/rss' },
      { name: 'BBC', region: 'World', category: 'europe', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml' },
      { name: 'BBC', region: 'World', category: 'business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
      { name: 'The Guardian', region: 'World', category: 'business', url: 'https://www.theguardian.com/business/rss' },
      { name: 'DW', region: 'World', category: 'business', url: 'https://rss.dw.com/rdf/rss-en-bus' },
      { name: 'BBC', region: 'World', category: 'tech-science', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
      { name: 'The Guardian', region: 'World', category: 'tech-science', url: 'https://www.theguardian.com/technology/rss' },
      { name: 'The Guardian', region: 'World', category: 'lifestyle', url: 'https://www.theguardian.com/lifeandstyle/rss' },
    ] as { name: string; region: string; category?: string; lang?: string; url: string }[],
  },

  // "What's on" column: your own events plus optional event sources, for the next week.
  events: {
    daysAhead: 7,
    // Kultur Züri (kulturzueri.ch): concerts, art tours and exhibitions around Zürich. Off by default.
    kulturZueri: false,
    zentralwaescherei: false, // concerts and performances at Zentralwäscherei, Zürich
    freeDays: true, // regular free museum days for your country, where Stubli Home knows them (worker/free-days.ts)
    kinds: { music: true, art: true, exhibitions: true },
  },

  // Your own recurring or dated items (free museum days, markets…), shown in Your day and, when
  // marked free, in What's on. Add them in Settings → What's on. Public and school holidays for
  // your country come automatically. `weekdays`: 0 = Sunday.
  local: {
    subdivision: '', // region code for holidays, e.g. 'DE-BY'; set from your city
    events: [] as { title: string; place?: string; note?: string; time?: string; url?: string; icon: string; from?: string; to?: string; weekdays?: number[]; free?: boolean }[],
  },

  display: {
    // The dashboard switches to its dark theme between sunset and sunrise.
    // Optional: set e.g. { start: '23:00', end: '06:00', wakeMinutes: 3 } to show only a dim clock overnight.
    sleep: null as null | { start: string; end: string; wakeMinutes: number },
    nightlyReload: '03:00',
    theme: 'auto' as 'auto' | 'light' | 'dark', // auto = dark between sunset and sunrise
    paper: false, // daytime look: Stubli's warmer paper colours with a serif for reading
  },

  // Music on this tablet: YouTube or YouTube Music playlists and videos, added in Settings → Music.
  tabletMusic: [] as { name: string; list?: string; video?: string }[],

  home: {
    // The bottom bar shows the whole-home presets (Bright, Relax, Dim, Night) and Off.
    // To show specific room scenes instead, list them here, e.g. { room: 'Bedroom', scene: 'Nightlight' }.
    barScenes: [] as { room: string; scene: string }[],
  },
}
