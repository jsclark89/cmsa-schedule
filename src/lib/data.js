// Loads public/data/season.json once and exposes lookups plus date helpers.
// All game dates and times are Calgary wall-clock strings (YYYY-MM-DD, HH:MM).

const BASE = import.meta.env.BASE_URL
const TZ = 'America/Edmonton'
const FAV_KEY = 'cmsa.myTeams'

let seasonPromise = null

export function loadSeason() {
  if (!seasonPromise) {
    const season = fetch(`${BASE}data/season.json`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`Could not load schedule data (${r.status})`)
      return r.json()
    })
    const optional = (name) => fetch(`${BASE}data/${name}`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    seasonPromise = Promise.all([season, optional('training.json'), optional('venues.json')]).then(([s, t, extra]) => {
      mergeExtraVenues(s.venues, extra)
      return indexSeason({ ...s, training: t })
    })
  }
  return seasonPromise
}

function indexSeason(s) {
  const byTeam = {}
  const byDivision = {}
  const byVenue = {}
  const byDate = {}
  for (const g of s.games) {
    g.homeName = s.teams[g.homeId]?.name || 'TBA'
    g.awayName = s.teams[g.awayId]?.name || 'TBA'
    for (const id of [g.homeId, g.awayId]) if (id) (byTeam[id] ||= []).push(g)
    ;(byDivision[g.divisionId] ||= []).push(g)
    if (g.venueId) (byVenue[g.venueId] ||= []).push(g)
    ;(byDate[g.date] ||= []).push(g)
  }
  const teamList = Object.values(s.teams)
    .filter((t) => byTeam[t.id]?.length)
    .map((t) => ({ ...t, division: s.divisions[t.divisionId] }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const gameDays = Object.keys(byDate).sort()
  return { ...s, byTeam, byDivision, byVenue, byDate, teamList, gameDays }
}

// ---------- favourites (per device) ----------

function readFavs() {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export const favourites = {
  get: readFavs,
  has: (id) => readFavs().includes(id),
  toggle(id) {
    const cur = readFavs()
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next))
    } catch {
      /* private mode: favourites just do not persist */
    }
    window.dispatchEvent(new Event('cmsa:favs'))
    return next
  },
}

// ---------- dates ----------

export function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function nowHm() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}

/** A game is "done" an hour after kickoff (or at the end of the day when it has no time). */
export function isPast(g) {
  const today = todayStr()
  if (g.date < today) return true
  if (g.date > today) return false
  if (!g.time) return false
  const [h, m] = g.time.split(':').map(Number)
  const end = `${String(Math.floor((h * 60 + m + 60) / 60)).padStart(2, '0')}:${String((m + 60) % 60).padStart(2, '0')}`
  return nowHm() >= end
}

export function nextGame(games) {
  return (games || []).find((g) => !isPast(g)) || null
}

function dateParts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

export function fmtDate(dateStr, style = 'medium') {
  const d = dateParts(dateStr)
  if (style === 'long') return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })
  if (style === 'short') return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
  if (style === 'month') return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtTime(time) {
  if (!time) return 'Time TBA'
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hh = h % 12 || 12
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`
}

export function fmtStamp(iso) {
  return new Date(iso)
    .toLocaleString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    .replace(/\s*([ap])\.m\./i, ' $1m')
}

export function relDay(dateStr) {
  const today = todayStr()
  const diff = Math.round((dateParts(dateStr) - dateParts(today)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return `This ${dateParts(dateStr).toLocaleDateString('en-CA', { weekday: 'long' })}`
  if (diff > 0) return `In ${diff} days`
  return `${-diff} days ago`
}

// ---------- names ----------

/** "MaxWell Soccer Centre Main - East Field" with venue "MaxWell Soccer Centre" -> "Main - East Field" */
export function fieldOnly(game, venue) {
  if (!game.field) return null
  if (venue?.name && game.field.startsWith(venue.name)) {
    const rest = game.field.slice(venue.name.length).replace(/^[\s:-]+/, '')
    return rest || null
  }
  return game.field
}

export function opponentOf(g, teamId) {
  return g.homeId === teamId ? { id: g.awayId, name: g.awayName, home: true } : { id: g.homeId, name: g.homeName, home: false }
}

export function groupBy(list, keyFn) {
  const out = new Map()
  for (const item of list) {
    const k = keyFn(item)
    if (!out.has(k)) out.set(k, [])
    out.get(k).push(item)
  }
  return out
}

export function siteUrl() {
  return `${window.location.origin}${BASE}`
}

export function icsUrl(kind, id) {
  return `${siteUrl()}ics/${kind}-${id}.ics`
}

export function webcalUrl(kind, id) {
  return icsUrl(kind, id).replace(/^https?:/, 'webcal:')
}

/** Hand-kept venues (see public/data/venues.json): added when the league lacks them, notes filled when blank. */
export function mergeExtraVenues(venues, extra) {
  for (const [name, v] of Object.entries(extra || {})) {
    if (name.startsWith('_')) continue
    const existing = Object.values(venues).find((x) => x.name === name)
    if (existing) {
      if (!existing.notes?.length && v.notes?.length) existing.notes = v.notes
      if (!existing.address && v.address) existing.address = v.address
      continue
    }
    const id = 'x-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    venues[id] = {
      id,
      name,
      address: v.address || null,
      notes: v.notes || [],
      mapsUrl: v.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ', ' + v.address)}` : null,
      manual: true,
    }
  }
  return venues
}

export function venueByName(season, name) {
  return Object.values(season.venues).find((v) => v.name === name) || null
}

// ---------- training ----------

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const WEEKDAY_NAMES = { SU: 'Sundays', MO: 'Mondays', TU: 'Tuesdays', WE: 'Wednesdays', TH: 'Thursdays', FR: 'Fridays', SA: 'Saturdays' }

export function weekdayName(code) {
  return WEEKDAY_NAMES[code] || code
}

export function trainingFor(season, teamId) {
  const t = season.training?.[teamId]
  return Array.isArray(t) ? t : []
}

/** Next date on or after today for a weekly session, honouring from, until and skip. */
export function nextSession(t) {
  const today = todayStr()
  const want = WEEKDAYS.indexOf(t.weekday)
  if (want < 0) return null
  let d = dateParts(today > t.from ? today : t.from)
  for (let i = 0; i < 60; i++) {
    const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (t.until && str > t.until) return null
    const done = str === today && t.end && nowHm() >= t.end
    if (d.getDay() === want && !(t.skip || []).includes(str) && !done) return str
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)
  }
  return null
}
