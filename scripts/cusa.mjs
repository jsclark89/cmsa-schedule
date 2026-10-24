// Calgary United Soccer Association (adult leagues) on RAMP InterActive.
// The nav on cusa.ab.ca lists every category > division > team, and each
// division's games come from a JSON endpoint the page itself calls:
//   /api/leaguegame/get/<AID>/<SID>/<CATID>/<DID>/<GTID|0>/<month|0>/
// Ids are prefixed with "c" so they never collide with CMSA's Demosphere keys.

import { load } from 'cheerio'

const SITE = 'https://www.cusa.ab.ca'
const DEFAULT_AID = '1891'
const CATEGORY_ORDER = ['Coed Boarded', 'Mens Boarded', 'Mens Boardless', 'Futsal']

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), 'cusa', ...a)

async function fetchText(url, tries = 3) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'cmsa-schedule (unofficial schedule viewer)' } })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return await res.text()
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 600 * (i + 1)))
    }
  }
  throw lastErr
}

/** Category > division > team tree from the site nav. */
export function parseNav(html) {
  const $ = load(html)
  const cats = []
  $('li').each((_, li) => {
    const a = $(li).children('a').first()
    const label = clean(a.text())
    if (!CATEGORY_ORDER.some((c) => c.toLowerCase() === label.toLowerCase())) return
    if (cats.some((c) => c.label === label)) return
    const divisions = []
    let current = null
    $(li).find('a').each((_, x) => {
      const href = $(x).attr('href') || ''
      const text = clean($(x).text())
      const col = href.match(/^#collapse(\d+)$/)
      if (col) {
        current = { id: col[1], name: text, catId: null, teams: [] }
        divisions.push(current)
        return
      }
      const dm = href.match(/^\/division\/(\d+)\/(\d+)\/games$/)
      if (dm && current && current.id === dm[2]) current.catId = dm[1]
      const tm = href.match(/^\/team\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/)
      if (tm && current && current.id === tm[3]) current.teams.push({ id: tm[4], name: text, sid: tm[1], catId: tm[2] })
    })
    cats.push({ label, divisions: divisions.filter((d) => d.catId) })
  })
  cats.sort((a, b) => CATEGORY_ORDER.indexOf(a.label) - CATEGORY_ORDER.indexOf(b.label))
  return cats
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Turn a RAMP arena name into the field wording the CMSA venue notes use, so
 * the same footwear matcher works ("Maxwell Soccer Centre - North" is one of
 * the Main boarded fields; "Dome Quarter NW" is in the Dome).
 */
export function normalizeArena(name, aliases) {
  for (const [from, to] of Object.entries(aliases || {})) {
    if (name.startsWith(from)) return to + name.slice(from.length)
  }
  return name
}

/** Find the known venue whose name starts the field name (case-insensitive). */
export function venueForField(field, venues) {
  const f = field.toLowerCase()
  let best = null
  for (const v of Object.values(venues)) {
    const n = (v.name || '').toLowerCase()
    if (n && f.startsWith(n) && (!best || n.length > best.name.length)) best = v
  }
  return best
}

export async function scrapeCusa({ previous, venues, arenaAliases, pMap }) {
  const html = await fetchText(SITE + '/')
  const cats = parseNav(html)
  if (!cats.length) throw new Error('no league categories found in the CUSA nav')
  const sid = cats.flatMap((c) => c.divisions).flatMap((d) => d.teams)[0]?.sid
  if (!sid) throw new Error('no season id in the CUSA nav')
  let aid = DEFAULT_AID
  const first = cats[0].divisions[0]
  if (first) {
    try {
      const page = await fetchText(`${SITE}/division/${first.catId}/${first.id}/games`)
      aid = page.match(/leaguegame\/get\/(\d+)\//)?.[1] || aid
    } catch {
      /* keep the default */
    }
  }
  log(`season ${sid}, ${cats.length} categories, ${cats.reduce((n, c) => n + c.divisions.length, 0)} divisions`)

  const groups = []
  const divisions = {}
  const teams = {}
  const games = []
  const jobs = cats.flatMap((c) => c.divisions.map((d) => ({ cat: c, d })))
  const results = await pMap(jobs, async ({ cat, d }) => {
    const url = `${SITE}/api/leaguegame/get/${aid}/${sid}/${d.catId}/${d.id}/0/0/`
    try {
      const data = JSON.parse(await fetchText(url))
      return { cat, d, data: Array.isArray(data) ? data : [] }
    } catch (e) {
      log(`${cat.label} ${d.name}: FAILED ${e.message}`)
      const prevGames = previous?.games?.filter((g) => g.divisionId === `c${d.id}`) || []
      return { cat, d, data: null, prevGames }
    }
  })

  for (const cat of cats) {
    const slug = 'cusa-' + slugify(cat.label)
    groups.push({ slug, label: cat.label, org: 'CUSA', divisionIds: cat.divisions.map((d) => `c${d.id}`) })
  }
  for (const { cat, d, data, prevGames } of results) {
    const divId = `c${d.id}`
    const seasonName = data?.[0]?.SeasonName || previous?.divisions?.[divId]?.league?.replace(/^CUSA .*? · /, '') || 'Indoor season'
    divisions[divId] = {
      id: divId,
      name: d.name,
      league: `CUSA ${cat.label} · ${seasonName}`,
      ageSlug: 'cusa-' + slugify(cat.label),
      org: 'CUSA',
      teamIds: d.teams.map((t) => `c${t.id}`),
      standings: null,
      stale: data === null,
      url: `${SITE}/division/${d.catId}/${d.id}/games`,
    }
    for (const t of d.teams) teams[`c${t.id}`] = { id: `c${t.id}`, name: t.name, tag: null, divisionId: divId, org: 'CUSA' }
    if (data === null) {
      games.push(...prevGames)
      continue
    }
    let n = 0
    for (const g of data) {
      if (g.trash || g.deletedDate || !g.sDate) continue
      const [date, time] = g.sDate.split('T')
      const field = normalizeArena(clean(g.ArenaName), arenaAliases)
      const venue = venueForField(field, venues)
      const homeId = g.homeTID ? `c${g.homeTID}` : null
      const awayId = g.awayTID ? `c${g.awayTID}` : null
      for (const [id, name] of [[homeId, g.HomeTeamName], [awayId, g.AwayTeamName]]) {
        if (id && !teams[id]) teams[id] = { id, name: clean(name), tag: null, divisionId: divId, org: 'CUSA', guest: true }
      }
      const game = {
        key: `c${g.GID}`,
        code: g.gameNumber ? String(g.gameNumber) : null,
        divisionId: divId,
        date,
        time: time ? time.slice(0, 5) : null,
        homeId,
        awayId,
        venueId: venue?.id || null,
        field: field || null,
      }
      if (g.completed && g.homeScore != null && g.awayScore != null) game.result = `${g.homeScore} - ${g.awayScore}`
      if (g.cancelledHome || g.cancelledAway) game.label = 'Cancelled'
      else if (g.rainout) game.label = 'Rained out'
      else if (g.GameTypeName && g.GameTypeName !== 'Regular Season') game.label = g.GameTypeName
      games.push(game)
      n++
    }
    log(`${cat.label} ${d.name}: ${d.teams.length} teams, ${n} games`)
  }
  return { groups, divisions, teams, games, unknownFields: [...new Set(games.filter((g) => !g.venueId).map((g) => g.field))] }
}
