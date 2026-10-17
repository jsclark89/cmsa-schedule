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
