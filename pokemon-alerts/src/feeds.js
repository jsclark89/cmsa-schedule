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
