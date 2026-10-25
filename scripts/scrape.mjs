#!/usr/bin/env node
// Scrapes Calgary Minor Soccer Association's Demosphere schedule pages into
// public/data/season.json plus one subscribable .ics per team and division.
//
//   calgaryminorsoccer.com/schedule/<age>  -> embed URL listing division ids
//   elements.demosphere.com .../E+46241++<div>              -> division page (teams, month tabs)
//   elements.demosphere.com .../E+46241++<div>++MM/YYYY+<lg> -> that month's games
//   elements.demosphere.com .../E+18235+Display/+<complex>+... -> venue page (address, notes)

import { load } from 'cheerio'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildIcs, gameToEvent, trainingToEvent } from '../src/lib/ics.js'
import { scrapeCusa } from './cusa.mjs'
import { mergeExtraVenues, applyTeamShortNames } from '../src/lib/venues.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const ICS_DIR = path.join(ROOT, 'public', 'ics')
const SEASON_FILE = path.join(DATA_DIR, 'season.json')

const CMSA = 'https://www.calgaryminorsoccer.com'
const DEMO = 'http://elements.demosphere.com'
const ORG = '75025'
const SCHEDULE_ELEMENT = '46241'
const AGE_SLUGS = ['u10', 'u11', 'u12', 'u13', 'u14', 'u15', 'u16', 'u17', 'u18', 'u19']
const CONCURRENCY = 4
const MAX_CHANGES = 500
const SITE_URL = process.env.SITE_URL || ''

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url, tries = 3) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(25000),
        headers: { 'user-agent': 'cmsa-schedule (unofficial parent-made schedule viewer)' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return await res.text()
    } catch (e) {
      lastErr = e
      await sleep(600 * (i + 1))
    }
  }
  throw lastErr
}

async function pMap(items, fn, limit = CONCURRENCY) {
  const out = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

// ---------- age groups ----------

async function discoverAgeGroups(previous) {
  const groups = []
  for (const slug of AGE_SLUGS) {
    try {
      const html = await fetchText(`${CMSA}/schedule/${slug}`)
      const m = html.match(/elements\.demosphere-secure\.com\/scripts\/runisa\.dll\?[^"'#\s]*Short\/\+([\d-]+)\+\+\+(\d+)/)
      if (!m) throw new Error('no Demosphere embed on page')
      groups.push({ slug, label: slug.toUpperCase(), divisionIds: m[1].split('-'), leagueKey: m[2] })
      log(`age ${slug}: ${m[1].split('-').length} divisions`)
    } catch (e) {
      const prev = previous?.ageGroups?.find((g) => g.slug === slug)
      if (prev) {
        log(`age ${slug}: page unavailable (${e.message}); reusing previous division list`)
        groups.push(prev)
      } else {
        log(`age ${slug}: skipped (${e.message})`)
      }
    }
  }
  return groups
}

// ---------- division pages ----------

function parseLongDate(s) {
  // "Sun, October 18, 2026"
  const m = clean(s).match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/)
  if (!m) return null
  const mon = MONTHS[m[1].toLowerCase()]
  if (!mon) return null
  return `${m[3]}-${String(mon).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`
}

function parseTime(s) {
  const m = clean(s).match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3].toLowerCase() === 'pm') h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

function parseGames($, divisionId) {
  const games = []
  let date = null
  $('#tblListGames2 > tbody > tr').each((_, tr) => {
    const $tr = $(tr)
    if ($tr.hasClass('gm-hdr-5d1h')) {
      date = parseLongDate($tr.text())
      return
    }
    if (!$tr.hasClass('sch-main-gm')) return
    const key = $tr.attr('data-gamekey')
    if (!key) return
    const homeTd = $tr.find('td.schedtm1')
    const awayTd = $tr.find('td.schedtm2')
    const facA = $tr.find('span.gm-fac a').first()
    const facHref = facA.attr('href') || ''
    const venueId = facHref.match(/Display\/\+(\d+)\+/)?.[1] || null
    const middle = clean($tr.find('td.sch-main-sc').text())
    const label = clean($tr.find('.gmlabel').text())
    const g = {
      key,
      code: clean($tr.find('.gamecode').text()),
      divisionId,
      date,
      time: parseTime($tr.find('td.tim').text()),
      homeId: homeTd.attr('data-tmkey') || null,
      homeName: clean(homeTd.text()),
      awayId: awayTd.attr('data-tmkey') || null,
      awayName: clean(awayTd.text()),
      venueId,
      field: clean(facA.text()) || null,
    }
    if (middle && middle.toLowerCase() !== 'vs') g.result = middle
    if (label) g.label = label
    games.push(g)
  })
  return games
}

function parseDivisionPage(html, divisionId) {
  const $ = load(html)
  // Two layouts exist: U10-U12 (team list table, runisa month links) and
  // U13+ (standings table, static month links).
  const league = clean($('#tblTms1 td').first().text()) || clean($('td.textlarge').first().text())
  const name = clean($(`a[href$="/${divisionId}.html"]`).first().text()) || clean($('tr.teams-tg1h td.RowHeader').first().text())
  const teams = []
  const standings = []
  $('table.fhd a').each((_, a) => {
    const h = $(a).attr('href') || ''
    const id = h.match(/\+\+\+(\d+)\+\+/)?.[1] || h.match(/\/(\d+)\.html$/)?.[1]
    if (!id) return
    const raw = clean($(a).text())
    const tag = raw.match(/\(([A-Z]{1,3})\)$/)?.[1] || null
    teams.push({ id, name: raw.replace(/\s*\([A-Z]{1,3}\)$/, ''), tag })
  })
  if (!teams.length) {
    const cols = $('tr.teams-tg1h td').slice(1).map((_, td) => clean($(td).text()).toLowerCase()).get()
    $('tr.tms').each((_, tr) => {
      const a = $(tr).find('td.stub a').first()
      const id = (a.attr('href') || '').match(/\/teams\/\d+\/(\d+)-\d+\//)?.[1]
      if (!id) return
      const raw = clean(a.text())
      const tag = raw.match(/\(([A-Z]{1,3})\)$/)?.[1] || null
      teams.push({ id, name: raw.replace(/\s*\([A-Z]{1,3}\)$/, ''), tag })
      const vals = $(tr).find('td').slice(1).map((_, td) => clean($(td).text())).get()
      if (cols.length && vals.some((v) => v !== '-' && v !== '')) {
        const row = { teamId: id }
        cols.forEach((c, i) => { row[c] = vals[i] === '-' || vals[i] === '' ? null : Number(vals[i]) })
        standings.push(row)
      }
    })
  }
  const monthHrefs = []
  $('a').each((_, a) => {
    const h = $(a).attr('href') || ''
    const isMonth = new RegExp(`\\+\\+${divisionId}\\+\\+\\d{2}/\\d{4}\\+`).test(h) || new RegExp(`/${divisionId}\\.\\d{5,6}\\.html$`).test(h)
    if (isMonth && !monthHrefs.includes(h)) monthHrefs.push(h)
  })
  return { league, name, teams, standings, monthHrefs, games: parseGames($, divisionId) }
}

async function scrapeDivision(divisionId, leagueKey, ageSlug) {
  const base = `${DEMO}/scripts/runisa.dll?M2:gp::${ORG}+Elements/Display+E+${SCHEDULE_ELEMENT}++${divisionId}`
  const html = await fetchText(base)
  const page = parseDivisionPage(html, divisionId)
  const byKey = new Map(page.games.map((g) => [g.key, g]))
  for (const h of page.monthHrefs) {
    const url = h.startsWith('http') ? h : `${DEMO}${h}`
    try {
      const mhtml = await fetchText(url)
      for (const g of parseGames(load(mhtml), divisionId)) byKey.set(g.key, g)
    } catch (e) {
      log(`  ${page.name || divisionId} ${h}: ${e.message}`)
    }
  }
  const games = [...byKey.values()].filter((g) => g.date)
  if (!page.teams.length) {
    const seen = new Map()
    for (const g of games) for (const [id, name] of [[g.homeId, g.homeName], [g.awayId, g.awayName]]) if (id && !seen.has(id)) seen.set(id, { id, name, tag: null })
    page.teams = [...seen.values()]
  }
  log(`${ageSlug} ${page.name || divisionId}: ${page.teams.length} teams, ${games.length} games over ${page.monthHrefs.length} months`)
  return { id: divisionId, ageSlug, league: page.league, name: page.name || `Division ${divisionId}`, teams: page.teams, standings: page.standings, months: page.monthHrefs.length, games }
}

// ---------- venues ----------

function parseVenuePage(html) {
  const $ = load(html)
  $('script, style').remove()
  const h1 = $('h1.dii-hdr').first()
  h1.find('span').remove()
  const name = clean(h1.text())
  const text = clean($('body').text())
  const address = text.match(/ADDRESS\s+(.*?)\s+View Google/)?.[1] || null
  const notes = []
  $('td.RowHeader').each((_, td) => {
    if (clean($(td).text()) !== 'DIRECTIONS') return
    const cell = $(td).nextAll('td').last()
    const paras = cell.find('p')
    if (paras.length) paras.each((_, p) => { const t = clean($(p).text()); if (t) notes.push(t) })
    else {
      for (const t of cell.html().split(/<br\s*\/?>/i)) { const c = clean(load(t).text()); if (c) notes.push(c) }
    }
  })
  return { name, address, notes: notes.filter((n) => n.length < 300) }
}

async function scrapeVenues(hrefsById, previous) {
  const ids = [...hrefsById.keys()]
  const results = await pMap(ids, async (id) => {
    try {
      const html = await fetchText(`${DEMO}${hrefsById.get(id)}`)
      const v = parseVenuePage(html)
      if (!v.name) throw new Error('no name parsed')
      return [id, { id, ...v, mapsUrl: v.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name + ', ' + v.address)}` : null }]
    } catch (e) {
      const prev = previous?.venues?.[id]
      log(`venue ${id}: ${e.message}${prev ? ' (kept previous)' : ''}`)
      return prev ? [id, prev] : [id, { id, name: `Venue ${id}`, address: null, notes: [], mapsUrl: null }]
    }
  })
  return Object.fromEntries(results)
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return {}
  }
}

// ---------- change log ----------

const FIELDS = ['date', 'time', 'homeId', 'awayId', 'venueId', 'field']

function snapshot(g) {
  return Object.fromEntries(FIELDS.map((f) => [f, g[f] ?? null]))
}

function diffGames(prevGames, games, at) {
  const changes = []
  const prev = new Map((prevGames || []).map((g) => [g.key, g]))
  const now = new Map(games.map((g) => [g.key, g]))
  // A division seen for the first time (a new league or age group) is an import, not a change.
  const knownDivisions = new Set((prevGames || []).map((g) => g.divisionId))
  for (const g of games) {
    const p = prev.get(g.key)
    if (!p) {
      if (knownDivisions.has(g.divisionId)) changes.push({ at, type: 'added', key: g.key, code: g.code, divisionId: g.divisionId, after: snapshot(g) })
      continue
    }
    const changed = FIELDS.filter((f) => (p[f] ?? null) !== (g[f] ?? null))
    if (changed.length) changes.push({ at, type: 'moved', key: g.key, code: g.code, divisionId: g.divisionId, fields: changed, before: snapshot(p), after: snapshot(g) })
  }
  for (const p of prev.values()) {
    if (!now.has(p.key)) changes.push({ at, type: 'removed', key: p.key, code: p.code, divisionId: p.divisionId, before: snapshot(p) })
  }
  return changes
}

// ---------- main ----------

async function main() {
  await mkdir(DATA_DIR, { recursive: true })
  await mkdir(ICS_DIR, { recursive: true })
  let previous = null
  try {
    previous = JSON.parse(await readFile(SEASON_FILE, 'utf8'))
  } catch {
    log('no previous season.json; this run starts the change log')
  }

  const ageGroups = await discoverAgeGroups(previous)
  const jobs = ageGroups.flatMap((g) => g.divisionIds.map((id) => ({ id, leagueKey: g.leagueKey, ageSlug: g.slug })))
  log(`scraping ${jobs.length} divisions`)

  const divisionResults = await pMap(jobs, async (job) => {
    try {
      return await scrapeDivision(job.id, job.leagueKey, job.ageSlug)
    } catch (e) {
      log(`division ${job.id}: FAILED ${e.message}`)
      const prev = previous?.divisions?.[job.id]
      if (!prev) return null
      return { ...prev, teams: prev.teamIds.map((tid) => previous.teams[tid]).filter(Boolean), games: previous.games.filter((g) => g.divisionId === job.id), stale: true }
    }
  })

  const divisions = {}
  const teams = {}
  const games = []
  const venueHrefs = new Map()
  for (const d of divisionResults) {
    if (!d) continue
    divisions[d.id] = { id: d.id, name: d.name, league: d.league, ageSlug: d.ageSlug, teamIds: d.teams.map((t) => t.id), standings: d.standings?.length ? d.standings : null, stale: d.stale || false }
    for (const t of d.teams) teams[t.id] = { id: t.id, name: t.name, tag: t.tag, divisionId: d.id }
    for (const g of d.games) {
      for (const [id, name] of [[g.homeId, g.homeName], [g.awayId, g.awayName]]) {
        if (id && !teams[id]) teams[id] = { id, name, tag: null, divisionId: d.id, guest: true }
      }
      const { homeName, awayName, ...slim } = g
      games.push(slim)
    }
  }
  // Venue hrefs: re-read from the pages we already parsed is cheaper than keeping them in games.
  // Each game carries venueId; rebuild one representative href per complex.
  for (const g of games) {
    if (g.venueId && !venueHrefs.has(g.venueId)) {
      venueHrefs.set(g.venueId, `/scripts/runisa.dll?M2:gp::${ORG}+Elements/Display+E+18235+Display/+${g.venueId}++`)
    }
  }
  log(`${Object.keys(divisions).length} divisions, ${Object.keys(teams).length} teams, ${games.length} games, ${venueHrefs.size} venues`)
  const venues = await scrapeVenues(venueHrefs, previous)
  const extraVenues = await readJson(path.join(DATA_DIR, 'venues.json'))
  mergeExtraVenues(venues, extraVenues)
  for (const g of ageGroups) g.org = 'CMSA'
  for (const d of Object.values(divisions)) d.org = 'CMSA'

  // Adult leagues from CUSA, folded into the same shape.
  try {
    const cusa = await scrapeCusa({ previous, venues, arenaAliases: extraVenues.arenaAliases, pMap })
    ageGroups.push(...cusa.groups)
    Object.assign(divisions, cusa.divisions)
    Object.assign(teams, cusa.teams)
    games.push(...cusa.games)
    if (cusa.unknownFields.length) log(`cusa: no known venue for ${cusa.unknownFields.join('; ')}`)
  } catch (e) {
    log(`cusa: FAILED ${e.message}; keeping previous CUSA data`)
    for (const g of previous?.ageGroups?.filter((x) => x.org === 'CUSA') || []) ageGroups.push(g)
    for (const d of Object.values(previous?.divisions || {}).filter((x) => x.org === 'CUSA')) divisions[d.id] = { ...d, stale: true }
    for (const t of Object.values(previous?.teams || {}).filter((x) => x.org === 'CUSA')) teams[t.id] = t
    games.push(...(previous?.games?.filter((x) => x.key.startsWith('c')) || []))
  }

  applyTeamShortNames(teams, await readJson(path.join(DATA_DIR, 'teams.json')))

  games.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || String(a.code || a.key).localeCompare(String(b.code || b.key), undefined, { numeric: true }))

  const generatedAt = new Date().toISOString()
  const newChanges = diffGames(previous?.games, games, generatedAt)
  const changes = [...newChanges, ...(previous?.changes || [])].slice(0, MAX_CHANGES)
  if (newChanges.length) log(`${newChanges.length} schedule changes since last run`)

  const season = {
    generatedAt,
    trackingSince: previous?.trackingSince || generatedAt,
    sources: [`${CMSA}/schedule`, 'https://www.cusa.ab.ca'],
    ageGroups,
    divisions,
    teams,
    venues,
    games,
    changes,
  }
  await writeFile(SEASON_FILE, JSON.stringify(season))
  log(`wrote ${path.relative(ROOT, SEASON_FILE)} (${(JSON.stringify(season).length / 1024).toFixed(0)} KB)`)

  // One subscribable calendar per team and per division.
  const ctx = { teams, venues, divisions, siteUrl: SITE_URL }
  const now = new Date(generatedAt)
  let training = {}
  try {
    training = JSON.parse(await readFile(path.join(DATA_DIR, 'training.json'), 'utf8'))
  } catch {
    log('no training.json; calendars hold games only')
  }
  let written = 0
  for (const t of Object.values(teams)) {
    const mine = games.filter((g) => g.homeId === t.id || g.awayId === t.id)
    if (!mine.length) continue
    const events = mine.map((g) => gameToEvent(g, { ...ctx, teamId: t.id }))
    for (const [i, session] of (Array.isArray(training[t.id]) ? training[t.id] : []).entries()) {
      const venue = Object.values(venues).find((v) => v.name === session.venue) || null
      events.push(trainingToEvent(session, t, i, SITE_URL, venue, divisions))
    }
    const ics = buildIcs({ name: `${t.name} (${t.org || 'CMSA'})`, now, events })
    await writeFile(path.join(ICS_DIR, `team-${t.id}.ics`), ics)
    written++
  }
  for (const d of Object.values(divisions)) {
    const mine = games.filter((g) => g.divisionId === d.id)
    const ics = buildIcs({ name: `${d.name} (${d.org || 'CMSA'})`, now, events: mine.map((g) => gameToEvent(g, ctx)) })
    await writeFile(path.join(ICS_DIR, `division-${d.id}.ics`), ics)
    written++
  }
  log(`wrote ${written} calendar files`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
