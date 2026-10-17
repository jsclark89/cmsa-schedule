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
