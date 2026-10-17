# Pokemon Stock Alerts

A small Discord bot that reads busy Pokemon TCG stock and release channels and
only pings you when a post mentions your area or one of your stores. Everything
else stays quiet.

- Matches area names (city, nearby towns) and specific stores, including text
  inside the embeds that stock-checker bots post.
- Optional product filter (for example only ETBs and booster bundles).
- Ignores noise like "sold out" or "OOS".
- Collapses repeat posts about the same store into one alert (10 minute cooldown by default).
- Sends alerts as a Discord DM, a phone push through [ntfy](https://ntfy.sh), a
  webhook into a private channel, or any combination.
- Also watches local store Facebook pages (for example a single Superstore
  location) and alerts only on posts that mention Pokemon. See
  [Facebook store pages](#facebook-store-pages).
- `npm run scan` looks back through recent history and shows what would have
  matched, so you can tune your terms before relying on it.

## Step 1: get the bot able to see the channels

A bot can only read a server it has been added to. Pick whichever applies:

**A. You run the server, or the admins will add a bot.** Invite your bot
(Step 2) straight into the stock server.

**B. You are just a member (most common).** Many stock servers post alerts in
*announcement* channels (megaphone icon). Those can be **followed**:

1. Make your own private server (the + button in Discord, "Create My Own").
2. In the stock server, open the announcement channel and click **Follow**,
   then pick a channel in your server. Repeat for each channel you care about
   (restocks, Walmart, Costco, Best Buy, etc.).
3. New posts now copy into your server, and your bot watches them there.

If the channels you need are not announcement channels, ask the mods about
adding a bot or making them followable. Do not run the bot on your personal
account (a "self-bot"); that is against Discord's terms and can get your
account banned.

## Step 2: create the bot

1. Go to <https://discord.com/developers/applications>, **New Application**.
2. **Bot** tab: click **Reset Token** and copy the token (keep it secret).
3. Same tab, under Privileged Gateway Intents, turn on **Message Content Intent**.
4. **OAuth2 > URL Generator**: tick `bot`, then permissions **View Channels**
   and **Read Message History**. Open the generated URL and add the bot to your
   server (or send it to the stock server admins for option A).
5. To get DMs from the bot, the bot and you must share a server, and in that
   server's Privacy Settings, "Direct Messages" must be allowed.

## Step 3: configure

    cp config.example.json config.json

Then edit `config.json`:

| Setting | What it does |
| --- | --- |
| `location.label` | Shown at the top of each alert. |
| `location.areas` | Place names that count as "near me": city, suburbs, nicknames (`yyc`), neighbourhoods, postal or ZIP codes. |
| `location.stores` | Specific stores. `match` lists the ways people write it (`crossiron`, `cross iron`). Alerts name the store. |
| `productKeywords` | Leave empty to get every nearby post. If you fill it in, a post must also mention one of these. |
| `ignoreIf` | Any post containing one of these is skipped. |
| `watchChannels` | Channel IDs to watch. Empty means every channel the bot can see. (Right click a channel > Copy Channel ID, with Developer Mode on in Discord settings.) |
| `cooldownMinutes` | Minimum gap between alerts for the same store. `0` turns it off. |
| `notify.dmUserId` | Your Discord user ID (right click your name > Copy User ID). |
| `notify.ntfyTopic` | Optional. Install the ntfy app, subscribe to a long random topic name, put the same name here. |
| `notify.webhookUrl` | Optional. A channel webhook URL (Channel settings > Integrations > Webhooks). |
| `logFile` | Every match is appended here as one JSON line. Remove to disable. |

Matching is case-insensitive and whole-word, so `yyc` will not fire on `yycx`,
and a trailing "s" is allowed (`etb` matches `ETBs`).

Put the token in `config.json` as `"token"`, or set `DISCORD_TOKEN` in the
environment instead.

## Step 4: run it

Needs Node 18 or newer.

    npm install
    npm test            # checks the matching rules
    npm run scan        # what would have matched in the last 24 hours
    npm run scan -- 72  # ...or the last 72 hours
    npm start           # live alerts

Use `scan` to tune: if it shows posts you do not care about, add words to
`ignoreIf`; if it misses a store you know was posted, add the spelling people
used to that store's `match` list.

## Facebook store pages

Some stores run their own page (for example "Real Canadian Superstore
(Southport, Calgary)") and post restocks there with photos and prices. The bot
can watch those and alert only on Pokemon posts, skipping flyers and promos.

Facebook does not offer feeds itself, so a feed service reads the page for you
and the bot reads the feed. Your Facebook account is never used.

1. Sign up for [RSS.app](https://rss.app) or [FetchRSS](https://fetchrss.com).
   Paste the store page URL (for example `https://www.facebook.com/<page>`) to
   make a feed, and copy the feed's RSS/XML link. Free plans check pages
   rarely; a paid plan (a few dollars a month) checks more often, which matters
   because restocks sell fast.
2. Add each store to `feeds.sources` in `config.json`:

       "feeds": {
         "pollMinutes": 10,
         "keywords": ["pokemon", "tcg", "elite trainer box", "booster"],
         "ignoreIf": ["sold out"],
         "sources": [
           { "name": "Superstore Southport", "url": "https://rss.app/feeds/abc123.xml" },
           { "name": "Superstore Sage Hill", "url": "https://rss.app/feeds/def456.xml" }
         ],
         "seenFile": "feeds-seen.json"
       }

   | Setting | What it does |
   | --- | --- |
   | `pollMinutes` | How often to check the feeds (minimum 2). Your feed service's own refresh rate is the real limit. |
   | `keywords` | A post must mention one of these. "Pokemon" also matches "Pokémon". Leave out to use the defaults shown. |
   | `ignoreIf` | Skip posts containing any of these. |
   | `sources` | One entry per store page. `name` appears in the alert. |
   | `seenFile` | Remembers which posts were already handled, so restarts do not re-alert. |

3. Check it: `npm run feeds -- --check` fetches every feed once and marks which
   recent posts would have matched. Nothing is sent.
4. Run it:
   - `npm start` runs the Discord watcher and the feed watcher together, with
     alerts by DM, ntfy and/or webhook.
   - `npm run feeds` runs only the feed watcher, without a Discord bot. Alerts
     go by ntfy and/or webhook (DMs need the bot).

The first check of a new feed records the posts already on it without alerting,
so you only hear about posts made after you add a store.

Feed services sometimes break when Facebook changes its pages. If a store goes
quiet for a long time, run `npm run feeds -- --check` to confirm its feed still
returns posts.

## Keeping it running

The bot only alerts while it is running. Cheap options:

- **Your own PC or a Raspberry Pi**: `npm start` in a terminal, or a process
  manager like `pm2 start src/bot.js --name pokemon-alerts`.
- **A small cloud host** (Railway, Fly.io, a $5 VPS): set the start command to
  `npm start`, add `DISCORD_TOKEN` as a secret, and upload `config.json`.
