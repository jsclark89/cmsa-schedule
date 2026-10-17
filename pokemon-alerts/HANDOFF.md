# Handoff: Pokemon restock alerts

Paste everything below the line into a Claude Code session in your app's repo.
The reference code is included at the bottom, so that session doesn't need
access to the original repo.

---

I want to add a **Pokemon card restock alert** feature to this app. A working
reference version already exists as a standalone Node project; its core files
are included below. Please start by looking at this app's stack and structure,
then propose how to fit this in (where the filtering runs, how it's scheduled,
how settings and secrets are stored, how I get notified) before writing code.
Reuse the matching logic below rather than reinventing it, adapted to this
app's language and conventions.

## What it does

I'm in Calgary. Restock news shows up in two places, both too noisy to follow
by hand. The feature watches them and only notifies me about restocks at
stores near me.

1. **Store Facebook pages.** Individual stores run their own pages and post
   restocks with photos and prices, for example "Real Canadian Superstore
   (Southport, Calgary)" and https://www.facebook.com/RCSSCalgaryShawnessy.
   Most posts are flyers and promos ("ground beef at Superstore Shawnessy").
   - Facebook has no feeds and forbids scraping, so I use **RSS.app** to turn
     each store page into an RSS feed (one feed per store, URLs like
     `https://rss.app/feeds/xxxx.xml`). I've made the Shawnessy one; more to come.
   - Filtering: the store page already says where, so only a keyword match is
     needed (pokemon, tcg, elite trainer box, booster, set names). "Pokémon"
     with the accent must match. Skip "sold out".
   - Poll every ~10 minutes. Remember post ids already handled (persisted) so
     restarts don't re-alert. The **first** poll of a new feed records existing
     posts without alerting.

2. **Discord stock servers** (optional, later). A bot account (never my own
   user account; self-bots break Discord's terms) reads channels and matches
   posts, including bot embeds, against my area names (calgary, yyc, airdrie,
   cochrane, okotoks, chestermere...) and specific stores with aliases
   (e.g. "crossiron", "cross iron"). The bot can only read servers whose admins
   add it, or announcement channels I "Follow" into my own server. My main
   (paid) server likely won't allow it. This needs a process that stays
   connected all the time, unlike the feed polling.

**Where it runs matters for push.** The feed check has to run on a schedule
(every ~10 minutes) even when the app isn't open on my phone, so it belongs
on the server side (a scheduled job, cron or serverless function) that calls
the app's push sending code.

## Matching rules (already tested in the reference code)

- Case-insensitive, accents folded, markdown and custom emoji stripped.
- Whole-word: "yyc" doesn't fire on "yycx". A trailing "s" is allowed, so
  "etb" matches "ETBs".
- `ignoreIf` terms suppress a post entirely.
- Optional product keyword gate on top of location.
- A 10 minute per-store cooldown collapses repeat posts into one alert.

## Notifications

**Use this app's existing push notifications.** This app can already push
notifications to my phone without a separate app, so restock alerts should go
through that same system, not ntfy. Find how the app sends pushes today and
send each match through it:
- Title like "Calgary: Superstore Shawnessy (pokemon)".
- Body: the start of the post text.
- Tapping it opens the original post (the Facebook or Discord link).

Also keep a list of recent matches in the app, so I can see alerts I missed
or dismissed.

The reference `notify.js` sends to a Discord DM, ntfy.sh or a Discord webhook.
Replace those with this app's push system. Only keep ntfy as a fallback if the
app's push can't be triggered from wherever the polling job runs.

## Secrets

Feed URLs, push credentials and any bot token are private: keep them out of the
code (env vars or the app's secret storage).

## Reference config

```json
{
  "token": "",
  "location": {
    "label": "Calgary",
    "areas": [
      "calgary",
      "yyc",
      "airdrie",
      "cochrane",
      "okotoks",
      "chestermere",
      "nw calgary",
      "se calgary"
    ],
    "stores": [
      {
        "name": "Walmart Crossiron Mills",
        "match": [
          "crossiron",
          "cross iron"
        ]
      },
      {
        "name": "Costco Country Hills",
        "match": [
          "costco country hills",
          "country hills costco"
        ]
      },
      {
        "name": "Best Buy Chinook",
        "match": [
          "best buy chinook",
          "chinook best buy"
        ]
      },
      {
        "name": "EB Games Market Mall",
        "match": [
          "eb games market mall",
          "market mall eb"
        ]
      }
    ]
  },
  "productKeywords": [],
  "ignoreIf": [
    "sold out",
    "oos",
    "out of stock",
    "edmonton only"
  ],
  "watchChannels": [],
  "cooldownMinutes": 10,
  "notify": {
    "dmUserId": "",
    "ntfyTopic": "",
    "webhookUrl": ""
  },
  "logFile": "matches.jsonl",
  "feeds": {
    "pollMinutes": 10,
    "keywords": [
      "pokemon",
      "tcg",
      "elite trainer box",
      "booster",
      "phantasmal flames",
      "mega evolution"
    ],
    "ignoreIf": [
      "sold out"
    ],
    "sources": [
      {
        "name": "Superstore Southport",
        "url": "https://rss.app/feeds/REPLACE_ME.xml"
      }
    ],
    "seenFile": "feeds-seen.json"
  }
}
```

## Reference code

Node 18+, ESM. `feeds.js` uses `fast-xml-parser`; the Discord bot uses `discord.js` v14.

### filter.js (matching)

```js
// Pure matching logic: no Discord, no network. Takes the text of a post and the
// config, decides whether it is about a store near you.

// Pull every bit of readable text out of a Discord message, including embeds,
// which is where most stock-checker bots put the store name and address.
export function messageText(msg) {
  const parts = [msg.content ?? ''];
  for (const e of msg.embeds ?? []) {
    parts.push(e.title, e.description, e.author?.name, e.footer?.text, e.url);
    for (const f of e.fields ?? []) parts.push(f.name, f.value);
  }
  return parts.filter(Boolean).join('\n');
}

export function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')     // é -> e, so "Pokémon" matches "pokemon"
    .toLowerCase()
    .replace(/<a?:(\w+):\d+>/g, ' $1 ') // custom emoji <:name:id> -> name
    .replace(/[*_~`|>]/g, ' ')           // markdown
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-word match so "ab" does not fire on "lab" and "Sage Hill" does not
// need to be the whole message. Terms may contain spaces or punctuation, and a
// trailing "s" is allowed so "etb" also catches "ETBs".
function termRegex(term) {
  const t = normalize(term);
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(t)}s?($|[^a-z0-9])`);
}

export function compileTerms(terms = []) {
  return terms.filter(Boolean).map((term) => ({ term, re: termRegex(term) }));
}

// Compile once at startup so each message is a handful of regex tests.
export function compileConfig(config) {
  const loc = config.location ?? {};
  return {
    label: loc.label ?? 'your area',
    areas: compileTerms(loc.areas),
    stores: (loc.stores ?? []).map((s) => ({ name: s.name, terms: compileTerms(s.match ?? [s.name]) })),
    products: compileTerms(config.productKeywords),
    ignore: compileTerms(config.ignoreIf),
  };
}

export function hits(terms, text) {
  return terms.filter(({ re }) => re.test(text)).map(({ term }) => term);
}

// Returns null when the post is not relevant, otherwise what matched and why.
export function matchMessage(rawText, compiled) {
  const text = normalize(rawText);
  if (!text) return null;

  const ignored = hits(compiled.ignore, text);
  if (ignored.length) return null;

  const stores = compiled.stores
    .filter((s) => s.terms.some(({ re }) => re.test(text)))
    .map((s) => s.name);
  const areas = hits(compiled.areas, text);
  if (!stores.length && !areas.length) return null;

  // Product keywords are an optional second gate: if you list any, the post
  // must mention at least one of them too.
  const products = hits(compiled.products, text);
  if (compiled.products.length && !products.length) return null;

  return { stores, areas, products };
}

// Remembers recent alerts so a store that gets posted five times in a minute
// (by several people, or edits) only pings you once.
export class Cooldown {
  constructor(minutes) {
    this.ms = minutes * 60_000;
    this.seen = new Map();
  }

  key(match, text) {
    if (match.stores.length) return 'store:' + [...match.stores].sort().join('|');
    // No specific store: fall back to the first 80 characters of the post.
    return 'text:' + normalize(text).slice(0, 80);
  }

  shouldAlert(match, text, now = Date.now()) {
    if (this.ms <= 0) return true;
    const k = this.key(match, text);
    const last = this.seen.get(k);
    if (last !== undefined && now - last < this.ms) return false;
    this.seen.set(k, now);
    if (this.seen.size > 1000) {
      for (const [key, t] of this.seen) if (now - t >= this.ms) this.seen.delete(key);
    }
    return true;
  }
}
```

### feeds.js (RSS/Atom polling and matching)

```js
// Watches RSS or Atom feeds (for example a store's Facebook page turned into a
// feed by RSS.app or FetchRSS) and alerts on new posts that mention Pokemon.
// The store page already tells us where, so these only need a keyword match.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { compileTerms, hits, normalize } from './filter.js';
import { sendAlert } from './notify.js';

const DEFAULT_KEYWORDS = ['pokemon', 'tcg', 'elite trainer box', 'booster'];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text' });

const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const textOf = (x) => (x == null ? '' : typeof x === 'object' ? String(x['#text'] ?? '') : String(x));

export function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

// Turns RSS 2.0 or Atom XML into [{ id, title, text, link, date }].
export function parseFeed(xml) {
  const doc = parser.parse(xml);

  if (doc.rss) {
    return asArray(doc.rss.channel?.item).map((it) => {
      const link = textOf(it.link);
      const body = textOf(it['content:encoded']) || textOf(it.description);
      return {
        id: textOf(it.guid) || link || textOf(it.title),
        title: stripHtml(textOf(it.title)),
        text: stripHtml(body),
        link,
        date: it.pubDate ? new Date(textOf(it.pubDate)) : null,
      };
    });
  }

  if (doc.feed) {
    return asArray(doc.feed.entry).map((it) => {
      const links = asArray(it.link);
      const link = (links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') ?? links[0])?.['@href'] ?? '';
      return {
        id: textOf(it.id) || link,
        title: stripHtml(textOf(it.title)),
        text: stripHtml(textOf(it.content) || textOf(it.summary)),
        link,
        date: it.updated || it.published ? new Date(textOf(it.updated || it.published)) : null,
      };
    });
  }

  throw new Error('not an RSS or Atom feed');
}

// Feeds often repeat the title at the start of the description.
export function itemText(item) {
  return item.text.startsWith(item.title) ? item.text : [item.title, item.text].filter(Boolean).join('\n');
}

export function compileFeedConfig(feeds = {}) {
  return {
    keywords: compileTerms(feeds.keywords?.length ? feeds.keywords : DEFAULT_KEYWORDS),
    ignore: compileTerms(feeds.ignoreIf),
  };
}

// Returns the keywords a post hit, or null if it should not alert.
export function matchFeedItem(text, compiled) {
  const t = normalize(text);
  if (hits(compiled.ignore, t).length) return null;
  const found = hits(compiled.keywords, t);
  return found.length ? found : null;
}

async function fetchFeed(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'pokemon-alerts/0.1 (personal feed reader)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}

// Remembers which posts we have already seen, across restarts, so a restart
// does not re-send old restocks.
export class SeenStore {
  constructor(path) {
    this.path = path;
    this.data = path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  }

  has(feedUrl) {
    return feedUrl in this.data;
  }

  isNew(feedUrl, id) {
    return !(this.data[feedUrl] ?? []).includes(id);
  }

  // Keep the most recent 200 ids per feed; feeds only show the latest few dozen.
  remember(feedUrl, ids) {
    const merged = [...new Set([...ids, ...(this.data[feedUrl] ?? [])])].slice(0, 200);
    this.data[feedUrl] = merged;
    if (this.path) writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }
}

// One pass over every feed. The first time a feed is seen, its existing posts
// are recorded without alerting, so you only hear about posts made from now on.
export async function pollFeeds({ config, client, seen, compiled, log = console }) {
  for (const source of config.feeds?.sources ?? []) {
    let items;
    try {
      items = await fetchFeed(source.url);
    } catch (e) {
      log.error(`feed "${source.name}" failed: ${e.message}`);
      continue;
    }

    const firstRun = !seen.has(source.url);
    const fresh = items.filter((it) => seen.isNew(source.url, it.id));

    if (!firstRun) {
      for (const item of fresh.reverse()) {
        const text = itemText(item);
        const keywords = matchFeedItem(text, compiled);
        if (!keywords) continue;
        log.log(`[feed match] ${source.name}: ${item.title.slice(0, 80)}`);
        await sendAlert({
          client,
          config,
          match: { stores: [source.name], areas: [], products: keywords },
          text,
          link: item.link,
          source: `${source.name} (Facebook feed)`,
        });
      }
    } else {
      log.log(`feed "${source.name}": ${items.length} existing posts recorded, alerting on new ones from now on`);
    }

    seen.remember(source.url, items.map((it) => it.id));
  }
}

export function startFeeds({ config, client }) {
  const sources = config.feeds?.sources ?? [];
  if (!sources.length) return null;

  const minutes = Math.max(config.feeds.pollMinutes ?? 10, 2);
  const seen = new SeenStore(config.feeds.seenFile ?? 'feeds-seen.json');
  const compiled = compileFeedConfig(config.feeds);
  const run = () => pollFeeds({ config, client, seen, compiled }).catch((e) => console.error('feed poll error:', e));

  console.log(`Watching ${sources.length} feed(s) every ${minutes} min`);
  run();
  return setInterval(run, minutes * 60_000);
}

// Fetch every feed once and print which recent posts would match. No alerts.
export async function checkFeeds(config) {
  const compiled = compileFeedConfig(config.feeds);
  for (const source of config.feeds?.sources ?? []) {
    console.log(`\n== ${source.name}`);
    try {
      const items = await fetchFeed(source.url);
      for (const item of items) {
        const text = itemText(item);
        const keywords = matchFeedItem(text, compiled);
        const when = item.date && !isNaN(item.date) ? item.date.toLocaleString() : '';
        console.log(`${keywords ? 'MATCH' : '     '}  ${when}  ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
        if (keywords) console.log(`       [${keywords.join(', ')}] ${item.link}`);
      }
      console.log(`${items.length} posts in feed`);
    } catch (e) {
      console.log(`failed: ${e.message}`);
    }
  }
}
```

### notify.js (delivery)

```js
// Delivery: a Discord DM from the bot, plus optional ntfy.sh phone push and an
// optional webhook into a private channel. Any combination can be on.

function summary(match, label) {
  const where = match.stores.length ? match.stores.join(', ') : match.areas.join(', ');
  const what = match.products.length ? ` (${match.products.join(', ')})` : '';
  return `${label}: ${where}${what}`;
}

function excerpt(text, max = 600) {
  const t = text.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export async function sendAlert({ client, config, match, text, link, source }) {
  const notify = config.notify ?? {};
  const title = summary(match, config.location?.label ?? 'Nearby');
  const body = `${excerpt(text)}\n\n${source}\n${link}`;
  const jobs = [];

  if (notify.dmUserId && client) {
    jobs.push(
      client.users.fetch(notify.dmUserId).then((u) =>
        u.send({ content: `**${title}**\n${body}`.slice(0, 2000) }),
      ),
    );
  }

  if (notify.ntfyTopic) {
    const server = notify.ntfyServer ?? 'https://ntfy.sh';
    jobs.push(
      fetch(`${server}/${encodeURIComponent(notify.ntfyTopic)}`, {
        method: 'POST',
        headers: { Title: title.replace(/[^\x20-\x7e]/g, ''), Click: link, Priority: 'high', Tags: 'zap' },
        body: excerpt(text, 1000),
      }).then((r) => {
        if (!r.ok) throw new Error(`ntfy ${r.status}`);
      }),
    );
  }

  if (notify.webhookUrl) {
    jobs.push(
      fetch(notify.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Stock near me', content: `**${title}**\n${body}`.slice(0, 2000) }),
      }).then((r) => {
        if (!r.ok) throw new Error(`webhook ${r.status}`);
      }),
    );
  }

  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === 'rejected') console.error('notify failed:', r.reason?.message ?? r.reason);
}
```

### bot.js (Discord listener, for later)

```js
import { appendFileSync } from 'node:fs';
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { loadConfig, isWatched } from './config.js';
import { compileConfig, matchMessage, messageText, Cooldown } from './filter.js';
import { sendAlert } from './notify.js';
import { startFeeds } from './feeds.js';

const config = loadConfig();
const compiled = compileConfig(config);
const cooldown = new Cooldown(config.cooldownMinutes ?? 10);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

async function handle(msg) {
  if (!msg.guild || msg.author?.id === client.user.id) return;
  if (!isWatched(config, msg.channelId)) return;

  const text = messageText(msg);
  const match = matchMessage(text, compiled);
  if (!match || !cooldown.shouldAlert(match, text)) return;

  const source = `#${msg.channel?.name ?? msg.channelId} in ${msg.guild.name}`;
  console.log(`[match] ${source}: ${[...match.stores, ...match.areas].join(', ')}`);

  if (config.logFile) {
    appendFileSync(
      config.logFile,
      JSON.stringify({ at: new Date().toISOString(), source, link: msg.url, ...match, text }) + '\n',
    );
  }

  await sendAlert({ client, config, match, text, link: msg.url, source });
}

client.once(Events.ClientReady, (c) => {
  const guilds = c.guilds.cache.map((g) => g.name).join(', ') || 'none yet';
  console.log(`Logged in as ${c.user.tag}. Watching for "${compiled.label}" in: ${guilds}`);
  startFeeds({ config, client });
});

client.on(Events.MessageCreate, (msg) => handle(msg).catch((e) => console.error('handler error:', e)));

// Stock bots often post a placeholder and fill the embed in a second later.
client.on(Events.MessageUpdate, async (_old, msg) => {
  try {
    if (msg.partial) msg = await msg.fetch();
    await handle(msg);
  } catch (e) {
    console.error('update handler error:', e);
  }
});

client.login(config.token);
```

### Tests worth porting

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFeed, itemText, compileFeedConfig, matchFeedItem, pollFeeds, stripHtml, SeenStore } from '../src/feeds.js';

const rss = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Superstore</title>${items
  .map(([id, desc]) => `<item><guid>${id}</guid><title><![CDATA[${desc.slice(0, 40)}]]></title><description><![CDATA[<p>${desc}</p>]]></description><link>https://facebook.com/post/${id}</link><pubDate>Tue, 13 Jan 2026 10:00:00 GMT</pubDate></item>`)
  .join('')}</channel></rss>`;

const RESTOCK = 'We have received a re-stock of Pokémon cards. Shop Phantasmal Flame, Mega Evolution or Paldean Fates sets....';
const FLYER = 'This week only: 2 for $5 on PC Blue Menu pasta. Check out the flyer!';

test('parses RSS 2.0 items from a Facebook page feed', () => {
  const items = parseFeed(rss([['1', RESTOCK]]));
  assert.equal(items.length, 1);
  assert.equal(items[0].id, '1');
  assert.equal(items[0].link, 'https://facebook.com/post/1');
  assert.match(items[0].text, /re-stock of Pokémon cards/);
});

test('parses Atom entries', () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>a1</id><title>Restock</title><link rel="alternate" href="https://example.com/a1"/><content type="html">&lt;b&gt;Pokemon&lt;/b&gt; ETBs in</content><updated>2026-01-13T10:00:00Z</updated></entry></feed>`;
  const [item] = parseFeed(xml);
  assert.equal(item.link, 'https://example.com/a1');
  assert.equal(item.text, 'Pokemon ETBs in');
});

test('rejects things that are not feeds', () => {
  assert.throws(() => parseFeed('<html><body>login</body></html>'), /not an RSS or Atom/);
});

test('matches Pokémon with the accent and skips flyer posts', () => {
  const c = compileFeedConfig({});
  assert.deepEqual(matchFeedItem(RESTOCK, c), ['pokemon']);
  assert.equal(matchFeedItem(FLYER, c), null);
});

test('custom keywords and ignoreIf', () => {
  const c = compileFeedConfig({ keywords: ['phantasmal flames'], ignoreIf: ['sold out'] });
  assert.deepEqual(matchFeedItem(RESTOCK.replace('Flame,', 'Flames,'), c), ['phantasmal flames']);
  assert.equal(matchFeedItem('Phantasmal Flames ETBs are sold out, sorry', c), null);
});

test('itemText does not repeat a title that starts the body', () => {
  assert.equal(itemText({ title: 'Hello', text: 'Hello world' }), 'Hello world');
  assert.equal(itemText({ title: 'Hi', text: 'there' }), 'Hi\nthere');
});

test('stripHtml decodes entities and keeps line breaks', () => {
  assert.equal(stripHtml('<p>A &amp; B</p><p>C</p>'), 'A & B\nC');
});

test('end to end: first poll records history, later polls alert only on new Pokemon posts', async () => {
  let feedItems = [['old', RESTOCK]];
  const alerts = [];
  const server = createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => { alerts.push(JSON.parse(body).content); res.end('ok'); });
      return;
    }
    res.setHeader('Content-Type', 'application/rss+xml');
    res.end(rss(feedItems));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const config = {
    location: { label: 'Calgary' },
    notify: { webhookUrl: `${base}/hook` },
    feeds: { sources: [{ name: 'Superstore Southport', url: `${base}/feed.xml` }] },
  };
  const seen = new SeenStore(join(mkdtempSync(join(tmpdir(), 'feeds-')), 'seen.json'));
  const quiet = { log() {}, error() {} };
  const args = { config, client: null, seen, compiled: compileFeedConfig({}), log: quiet };

  try {
    await pollFeeds(args);
    assert.equal(alerts.length, 0, 'existing posts on first run should not alert');

    feedItems = [['new-flyer', FLYER], ['new-restock', RESTOCK], ['old', RESTOCK]];
    await pollFeeds(args);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /Calgary: Superstore Southport \(pokemon\)/);
    assert.match(alerts[0], /facebook\.com\/post\/new-restock/);

    await pollFeeds(args);
    assert.equal(alerts.length, 1, 'same posts should not alert twice');
  } finally {
    server.close();
  }
});
```

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileConfig, matchMessage, messageText, normalize, Cooldown } from '../src/filter.js';

const example = JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url)));
const c = compileConfig(example);

test('matches a nearby area mentioned in plain text', () => {
  const m = matchMessage('Prismatic Evolutions ETBs just restocked at Walmart in **Airdrie**!', c);
  assert.deepEqual(m.areas, ['airdrie']);
});

test('names the specific store when a store alias matches', () => {
  const m = matchMessage('CrossIron walmart has 151 booster bundles on the shelf', c);
  assert.deepEqual(m.stores, ['Walmart Crossiron Mills']);
});

test('ignores posts about other cities', () => {
  assert.equal(matchMessage('Surging Sparks at Costco South Edmonton Common', c), null);
});

test('whole-word matching: "yyc" does not fire inside another word', () => {
  assert.equal(matchMessage('restock at the yycx outlet', c), null);
  assert.ok(matchMessage('YYC drop today', c));
});

test('ignoreIf suppresses noise even when the area matches', () => {
  assert.equal(matchMessage('Calgary Best Buy: SOLD OUT already', c), null);
});

test('productKeywords act as a second gate when set', () => {
  const strict = compileConfig({ ...example, productKeywords: ['etb', 'booster bundle'] });
  assert.equal(matchMessage('Calgary Walmart got Funko Pops', strict), null);
  assert.deepEqual(matchMessage('Calgary Walmart got ETBs', strict).products, ['etb']);
});

test('reads store and address out of bot embeds', () => {
  const text = messageText({
    content: '',
    embeds: [{ title: 'IN STOCK: Pokemon TCG Destined Rivals ETB', fields: [{ name: 'Store', value: 'Best Buy Chinook Centre' }] }],
  });
  assert.deepEqual(matchMessage(text, c).stores, ['Best Buy Chinook']);
});

test('custom emoji are reduced to their names', () => {
  assert.equal(normalize('<:pikachu:123456> Hi'), 'pikachu hi');
});

test('cooldown collapses repeat posts about the same store', () => {
  const cd = new Cooldown(10);
  const m = { stores: ['Best Buy Chinook'], areas: [], products: [] };
  assert.equal(cd.shouldAlert(m, 'a', 0), true);
  assert.equal(cd.shouldAlert(m, 'b', 5 * 60_000), false);
  assert.equal(cd.shouldAlert(m, 'c', 11 * 60_000), true);
});
```
