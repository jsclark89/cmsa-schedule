// Pure iCalendar builder shared by the scraper (Node) and the app (browser).
// Games are stored as local Calgary wall-clock strings, so events carry a
// VTIMEZONE for America/Edmonton rather than UTC offsets.

import { footwearFor, bringLine, footwearInfo } from './venueNote.js'

const TZ = 'America/Edmonton'

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZ}`,
  'BEGIN:STANDARD',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'TZOFFSETFROM:-0600',
  'TZOFFSETTO:-0700',
  'TZNAME:MST',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0600',
  'TZNAME:MDT',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
]

function esc(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function fold(line) {
  // RFC 5545: lines longer than 75 octets are folded with CRLF + space.
  const out = []
  let s = line
  while (s.length > 72) {
    out.push(s.slice(0, 72))
    s = ' ' + s.slice(72)
  }
  out.push(s)
  return out.join('\r\n')
}

function stamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function addMinutes(date, time, minutes) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + minutes))
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}T${String(dt.getUTCHours()).padStart(2, '0')}${String(dt.getUTCMinutes()).padStart(2, '0')}00`
}

/**
 * @param {object} opts
 * @param {string} opts.name       calendar display name
 * @param {Array}  opts.events     [{ uid, date:'YYYY-MM-DD', time:'HH:MM'|null, durationMin, summary, location, description, url, rrule?, exdates? }]
 * @param {Date}   [opts.now]
 */
export function buildIcs({ name, events, now = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//cmsa-schedule//Game Finder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...VTIMEZONE,
  ]
  for (const ev of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${esc(ev.uid)}`)
    lines.push(`DTSTAMP:${stamp(now)}`)
    if (ev.time) {
      lines.push(`DTSTART;TZID=${TZ}:${addMinutes(ev.date, ev.time, 0)}`)
      lines.push(`DTEND;TZID=${TZ}:${addMinutes(ev.date, ev.time, ev.durationMin || 60)}`)
    } else {
      const d = ev.date.replace(/-/g, '')
      lines.push(`DTSTART;VALUE=DATE:${d}`)
    }
    if (ev.rrule) lines.push(`RRULE:${ev.rrule}`)
    for (const d of ev.exdates || []) lines.push(`EXDATE;TZID=${TZ}:${addMinutes(d, ev.time || '00:00', 0)}`)
    lines.push(`SUMMARY:${esc(ev.summary)}`)
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`)
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`)
    if (ev.url) lines.push(`URL:${ev.url}`)
    if (ev.alarmMinutes) {
      // A lock-screen alert ahead of kickoff, with the field and shoes in it.
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${ev.alarmMinutes}M`, `DESCRIPTION:${esc(ev.summary)}`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** "MaxWell Soccer Centre Annex - Alpha Field" at MaxWell -> "Annex Alpha"; "MSC Dome NW 7v7" -> "Dome NW". */
export function shortFieldName(field, venue) {
  if (!field) return null
  let f = field
  if (venue?.name && f.toLowerCase().startsWith(venue.name.toLowerCase())) f = f.slice(venue.name.length)
  f = f
    .replace(/\(?\b\d+v\d+\b\)?/gi, '')
    .replace(/^\s*MSC\s+/i, '')
    .replace(/\s+Field$/i, '')
    .replace(/\s+-\s+/g, ' ')
    .replace(/^[\s:-]+|[\s:-]+$/g, '')
    .replace(/\s+/g, ' ')
  return f || null
}

/** Where to walk to, as short as it can be: "Annex Alpha", "Genesis Indoor AT", "Skills Centre Field 4". */
export function titleLocation(field, venue) {
  const f = shortFieldName(field, venue)
  const v = venue ? (venue.short ?? venue.name) : null
  return [v, f].filter(Boolean).join(' ') || null
}

/** "U11 Forest" from the hand-kept list, else age group plus the name without its birth year. */
export function teamTitle(team, divisions) {
  if (!team) return null
  if (team.short) return team.short
  const division = divisions?.[team.divisionId]
  const age = division?.org === 'CUSA' ? null : division?.ageSlug?.toUpperCase()
  const name = team.name.replace(/\s+(?:20\d{2}(?:\/\d{2,4})?|\d{2}(?:\/\d{2})?[A-Z]?)$/, '').trim() || team.name
  return [age, name].filter(Boolean).join(' ')
}

function shoesTag(wear) {
  const info = footwearInfo(wear?.kind)
  return info ? `(👟 ${info.kind === 'indoor' ? 'indoor' : 'cleats'})` : null
}

/** Turn a stored game plus lookups into an ICS event, from one team's point of view. */
export function gameToEvent(game, { teamId, teams, venues, divisions, siteUrl }) {
  const home = teams[game.homeId]?.name || game.homeName
  const away = teams[game.awayId]?.name || game.awayName
  const venue = venues[game.venueId]
  const division = divisions[game.divisionId]
  const field = game.field || venue?.name || ''
  const location = [field, venue?.address].filter(Boolean).join(', ')
  const wear = footwearFor(venue, game.field)
  // Title order: who, where to walk, what to wear, then the matchup.
  //   U11 Forest - Annex Alpha (👟 indoor) - Home vs SWU Olympique 16B
  const where = [titleLocation(game.field, venue), shoesTag(wear)].filter(Boolean).join(' ')
  let parts
  if (teamId && (game.homeId === teamId || game.awayId === teamId)) {
    const isHome = game.homeId === teamId
    const me = teamTitle(teams[teamId], divisions) || (isHome ? home : away)
    parts = [me, where, isHome ? `Home vs ${away}` : `Away at ${home}`]
  } else {
    parts = [where, `${home} vs ${away}`]
  }
  const summary = parts.filter(Boolean).join(' - ')
  const description = [
    wear?.footwear ? `Bring: ${bringLine(venue, game.field)}` : null,
    wear?.surface ? `Surface: ${wear.surface}` : null,
    [division?.name, game.code ? `Game #${game.code}` : null].filter(Boolean).join(' · ') || null,
    siteUrl ? `Schedule: ${siteUrl}` : null,
  ].filter(Boolean).join('\n')
  return {
    uid: `game-${game.key}@cmsa-schedule`,
    date: game.date,
    time: game.time,
    durationMin: 60,
    summary,
    location,
    description,
    url: siteUrl,
    alarmMinutes: 60,
  }
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function minutesBetween(a, b) {
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  return bh * 60 + bm - (ah * 60 + am)
}

/** First date on or after `from` that falls on the session's weekday. */
export function firstSessionDate(t) {
  const [y, m, d] = t.from.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const want = WEEKDAYS.indexOf(t.weekday)
  const diff = (want - dt.getUTCDay() + 7) % 7
  dt.setUTCDate(dt.getUTCDate() + diff)
  return dt.toISOString().slice(0, 10)
}

/** A weekly training session as one recurring calendar event. */
export function trainingToEvent(t, team, index, siteUrl, venue = null, divisions = null) {
  const until = t.until ? t.until.replace(/-/g, '') + 'T235959Z' : null
  const rrule = `FREQ=WEEKLY;BYDAY=${t.weekday}` + (until ? `;UNTIL=${until}` : '')
  const where = [t.venue, t.field].filter(Boolean).join(' ')
  const address = t.address || venue?.address || null
  const wear = venue ? footwearFor(venue, where) : null
  const titleWhere = [titleLocation(where, venue || { name: t.venue }), shoesTag(wear)].filter(Boolean).join(' ')
  return {
    uid: `training-${team.id}-${index}@cmsa-schedule`,
    date: firstSessionDate(t),
    time: t.start,
    durationMin: t.end ? minutesBetween(t.start, t.end) : 60,
    summary: [teamTitle(team, divisions), titleWhere, 'Training'].filter(Boolean).join(' - '),
    location: [where, address].filter(Boolean).join(', '),
    description: [wear?.footwear ? `Bring: ${bringLine(venue, where)}` : null, wear?.surface ? `Surface: ${wear.surface}` : null, t.note, siteUrl ? `Schedule: ${siteUrl}` : null].filter(Boolean).join('\n'),
    url: siteUrl,
    alarmMinutes: 60,
    rrule,
    exdates: t.skip || [],
  }
}
