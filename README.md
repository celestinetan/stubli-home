# Stubli Home

A calm home screen for a tablet on your wall: weather, your calendar, ranked world news, what's on
nearby, and optional control of Sonos speakers and Philips Hue lights. Free to run, and yours to keep.

Stubli Home is part of [Stubli](https://stubli.app), the cosy home on the web for your photos and
the people you care about. It shares Stubli's look: warm paper colours, Moss green and the smiling ü.

> Shared free, as is, with no guarantee. Please read the [Disclaimer and Terms of Use](#disclaimer-and-terms-of-use) before you use it.

## What it does

1. **Weather:** the current conditions with a friendly animated icon, "before you go" advice
   (umbrella, an extra layer), the next 6 hours and 3 days. Rain alerts for the next few hours.
2. **Your day:** the next event in large type, today's agenda and the next 3 days at a glance, from any
   calendar that offers an iCal link (Proton, Google, iCloud, Outlook). Public holidays for your country.
3. **News:** stories grouped across many outlets, ranked by importance and summarised in plain
   English, in cards by topic. A headline ticker runs along the bottom. Add outlets in any
   language; with a free Google Gemini key they're translated.
4. **What's on:** your own items, regular free museum days (built in for Switzerland so far), plus optional event sources.
5. **Music on the tablet:** paste YouTube or YouTube Music links (playlists, albums, mixes, songs)
   in Settings, then tap **Play music**. It plays on the tablet or a speaker connected to it. No account or key.
6. **Sonos and Philips Hue (optional):** now playing, favourites and whole-home moods.
7. **Settings on the tablet:** city, layout, news sources, calendars and keys can all be changed
   from the dashboard itself. No code needed.

It switches to a dark theme at night and comes in light, "paper" and dark looks.

## Try the demo first

**[Open the demo](https://celestinetan.github.io/stubli-home/)** to see Stubli Home filled with
made-up sample data: a weather forecast, a calendar, news, events, music and lights. A dark bar at
the top says it's a demo. Nothing is saved, and nothing is sent anywhere. (On your own Stubli Home,
add `?demo` to the address to see the same.)

## What you need

- A tablet: an iPad with iPadOS 16 or later, or an Android tablet with Chrome 105 or later. Older
  devices may show the layout incorrectly.
- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account. No payment card is needed.
- A free [GitHub](https://github.com/signup) account (the Deploy button copies the project there).
- About 20 minutes.

## Set it up, step by step

### 1. Put the dashboard online

1. Click **Deploy to Cloudflare**:

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/celestinetan/stubli-home)

2. Sign in to Cloudflare. Under **Git account**, choose **New GitHub connection** and allow
   Cloudflare on GitHub (it needs this to make your own copy of the code and redeploy it when it
   changes). If you land on a "Select a repository" page afterwards, just click the Deploy button
   above again. Keep the suggested names.
3. Under **PAIRING_SECRET**, type a code of at least 8 characters that you'll remember (it's
   required). You'll type it once on each device that should show the dashboard.
   Ticking **Create private Git repository** keeps your copy of the code private; that's fine.
4. Click **Deploy** and wait about two minutes. Cloudflare then shows your dashboard's address,
   ending in `.workers.dev`. Write it down.

### 2. Pair your tablet

1. On the tablet, open the address in Safari (iPad) or Chrome (Android).
2. Type your pairing code from step 1 and tap **Pair device**.
3. Write the code down somewhere safe. You'll need it for every tablet or phone, and again on an
   iPad after adding Stubli Home to the home screen (that icon keeps its own sign-in).

### 3. Answer four quick questions

After pairing, Stubli Home asks:

1. **Your city:** weather, the time, public holidays and your country's news card follow it.
2. **Your calendar (optional):** paste its private iCal link.
   - Proton Calendar: Settings, Calendars, Share, "Share with anyone", full view.
   - Google Calendar: Settings, your calendar, "Secret address in iCal format".
   - iCloud and Outlook offer a shared calendar link too.
3. **News summaries (optional):** a free [Google AI Studio](https://aistudio.google.com) key groups,
   summarises and translates stories. The news works without it, just plainer.
4. **Ready:** tips for the wall, below.

Everything can be changed later with the gear in the top right corner: more calendars, news
outlets from your own country (pick your country's category), your own free days and events in
What's on, music for the tablet in Music, and which parts to show in Layout.

### 4. Turn the tablet into a wall display

**iPad**

1. In Safari: Share, then **Add to Home Screen**. Open the dashboard from that icon.
2. Settings, Display and Brightness, **Auto-Lock: Never**.
3. Turn on a Focus such as Do Not Disturb so notifications don't pop up.
4. Optional: Settings, Accessibility, **Guided Access**, then triple-click to lock the dashboard on screen.

**Android**

1. In Chrome: menu, **Add to Home screen** (or Install app). Open it from that icon.
2. Settings, Display, Screen timeout: the longest option. Developer options can keep the screen on while charging.
3. Optional: Settings, Security, **App pinning** to keep the dashboard on screen.

Tip: a smart plug that charges the tablet only a few hours a day helps an old battery last longer.

### 5. Optional extras

- **Settings PIN:** on a tablet guests can touch, add a `SETTINGS_PIN` secret (Cloudflare,
  Workers and Pages, your dashboard, Settings, Variables and Secrets). Changes then need the PIN.
- **Cloudflare Access:** sign in with your email instead of a pairing code. See [SETUP.md](SETUP.md).
- **Sonos and Philips Hue:** each needs a free developer account and two keys:

  | | Where | Redirect address | Secrets |
  |---|---|---|---|
  | Sonos | [developer.sonos.com](https://developer.sonos.com), new Control Integration, type "Smart home" | `https://YOUR-ADDRESS/auth/sonos/callback` | `SONOS_CLIENT_ID`, `SONOS_CLIENT_SECRET` |
  | Hue | [developers.meethue.com](https://developers.meethue.com), new Remote Hue API app | `https://YOUR-ADDRESS/auth/hue/callback` | `HUE_CLIENT_ID`, `HUE_CLIENT_SECRET` |

  Add the secrets in Cloudflare, switch on Music and Lights under Layout, then tap **Connect Sonos** or **Connect Hue**.

### Getting updates

1. On GitHub, open your copy of Stubli Home (the repository the Deploy button made for you).
2. Click **Actions**, then **Update Stubli Home**, then **Run workflow**. If GitHub asks to enable
   workflows first, allow it.
3. Cloudflare redeploys your dashboard by itself within a few minutes.

Your settings, calendars and keys are kept: they live in Cloudflare, not in the code. The
[changelog](CHANGELOG.md) says what's new.

## If something isn't working

| What you see | What to do |
|---|---|
| **"That code didn't match"**, or you forgot the code | In [Cloudflare](https://dash.cloudflare.com): Workers and Pages, your Stubli Home, Settings, Variables and Secrets. Add a secret named `PAIRING_SECRET` with a new code, save, and pair again with it. This also works if someone else chose the code first. |
| **It asks for the code again** after adding it to the home screen | Normal on an iPad: the home-screen icon keeps its own sign-in. Type the code once more. |
| **"Choose your city"** stays at the top | Tap it, or the gear, then General, and search for your city. Try the nearest bigger town if yours isn't found. |
| **"That link opens a web page, not a calendar"** | You copied the calendar's public web link. Use the private iCal address instead (Proton: "Share with anyone", full view; Google: "Secret address in iCal format"). |
| **"Google didn't accept that key"** | Copy the key again from [AI Studio](https://aistudio.google.com) (Get API key). It's a long line of letters and numbers. |
| **"No news feed found there"** when adding an outlet | Some sites hide their feed. Search the web for the outlet's name plus "RSS", and paste that link. |
| **Changes can't be saved** ("Locked") | Your dashboard has a Settings PIN: enter it at the top of Settings. |
| **A note says the browser is older than needed** | Update the tablet (iPadOS 16 or later; Chrome 105 or later). Older tablets may still work, with some parts looking wrong. |
| **Something stopped updating** | Settings, General, **Health and errors** shows when each part last updated and any recent problems. **Reload dashboard** often fixes a stuck screen. |
| **"This one can't play here"** in the music player | That song's owner only allows it on YouTube itself. In a playlist it's skipped by itself; for a single song, try another upload of it. |
| **Music stops when the screen locks** | Keep the screen on (see above). Tablets pause web audio when they lock. |
| **The deploy failed with "limit of 5 cron triggers"** | Your Cloudflare account already uses its five free schedules for other projects. Stubli Home needs one: remove a schedule from another worker (its Settings, Triggers), then click **Retry build**. |
| **The screen goes dark or locks** | iPad: Auto-Lock: Never. Android: the longest screen timeout, or "Stay awake" while charging. |

Still stuck? [Open an issue](../../issues) or write to hello@celestinetan.com.

## Sources

Checked 3 November 2026.

- Weather: [Open-Meteo](https://open-meteo.com) (free, no key). In Switzerland it uses
  MeteoSwiss's ICON-CH2 model, and warnings come from the feed behind the MeteoSwiss app (unofficial).
- Holidays: [OpenHolidays API](https://www.openholidaysapi.org) (mostly European countries).
- News: the public RSS feeds of the outlets listed in Settings. Summaries by
  [Google Gemini](https://ai.google.dev) on its free tier, if you add a key.
- Optional event sources: [Kultur Züri](https://kulturzueri.ch) (Zürich area; reads its public
  listing pages, unofficial) and Zürich venues you switch on one by one: [Zentralwäscherei](https://zentralwaescherei.space/en),
  [Kauz](https://www.kauzig.ch/), [Frieda's Büxe](https://friedasbuexe.ch/), [Hive](https://www.hiveclub.ch/)
  and [Umbo](https://umbo.wtf/), each read from its own website's programme (unofficial).
- Music on the tablet: YouTube's official embedded player (IFrame API). It loads only when you tap
  Play music, stays visible while playing as YouTube requires, and may show YouTube's ads.
- Fonts: Figtree and Literata (SIL Open Font Licence), included in the project so nothing loads from elsewhere.

## Known limits

- English only, with British date formats.
- The unofficial feeds (MeteoSwiss warnings, Kultur Züri, the venue programmes) can stop working if those sites change.
- Free plans have limits: news is collected in two halves a few minutes apart, and AI summaries
  run at most every 30 minutes. See [SETUP.md](SETUP.md).
- A calendar can take a while to show changes, depending on how often your provider updates its shared link.

## Privacy

Your calendar links, keys and settings are stored only in your own Cloudflare account, and links
and keys are never shown again after saving. With a Gemini key, public headlines (never your own
data) are sent to Google to be summarised. Nothing else leaves your dashboard.

## Developing

```bash
npm install
npm run dev      # http://localhost:8787 (local secrets go in .dev.vars)
npm run deploy
```

Defaults live in `worker/config.ts`; the Settings screen overrides them. [SETUP.md](SETUP.md)
explains how the parts fit together.

## Disclaimer and Terms of Use

Stubli Home is shared free of charge for general, personal use. It is provided "as is", without
warranty of any kind, including that it works, is accurate, is secure or is fit for a particular
purpose. Weather, news, event and holiday information comes from third parties and may be wrong,
late or missing. It is not professional advice of any kind, and you should not rely on it for
safety decisions: check official sources, such as your national weather service, for warnings.

You use it at your own risk. To the fullest extent the law allows, the author is not liable for any
direct or indirect loss or damage arising from its use, including loss of data, costs from
third-party services or problems with connected devices. By using it, you agree to hold the author
harmless and not to bring any claim against the author, including claims by third parties,
arising from your use of it.

This is an independent project. It is not affiliated with, endorsed by or sponsored by Cloudflare,
Google, Sonos, Signify (Philips Hue), MeteoSwiss, Open-Meteo, Kultur Züri, the Zürich venues listed above, Proton or any news
outlet named. All trademarks belong to their owners. You are responsible for following the terms
of any service you connect, including news outlets' terms for their feeds.

Services and their terms change; the dates above show when the sources were last checked. You may
share and change this project under its licence, as long as this section stays with it and changed
versions are not presented as the author's own. By using Stubli Home, you accept these terms.

## Report a mistake

Found a problem or something out of date? Open an issue on GitHub, or write to hello@celestinetan.com.

## Licence

The code is under the [MIT Licence](LICENSE). Data from the sources above is not covered by this
licence and is used under each provider's own terms.

The Stubli name, the "stübli" wordmark and the app icon are Celestine Tan's and are not covered by
the licence. If you publish a changed version, please give it your own name and icon. Running your
own unchanged copy for yourself is fine.
