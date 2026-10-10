// Pure iCalendar builder shared by the scraper (Node) and the app (browser).
// Games are stored as local Calgary wall-clock strings, so events carry a
// VTIMEZONE for America/Edmonton rather than UTC offsets.

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
 * @param {Array}  opts.events     [{ uid, date:'YYYY-MM-DD', time:'HH:MM'|null, durationMin, summary, location, description, url }]
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
    lines.push(`SUMMARY:${esc(ev.summary)}`)
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`)
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`)
    if (ev.url) lines.push(`URL:${ev.url}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Turn a stored game plus lookups into an ICS event, from one team's point of view. */
export function gameToEvent(game, { teamId, teams, venues, divisions, siteUrl }) {
  const home = teams[game.homeId]?.name || game.homeName
  const away = teams[game.awayId]?.name || game.awayName
  const venue = venues[game.venueId]
  const division = divisions[game.divisionId]
  let summary
  if (teamId && game.homeId === teamId) summary = `${home} vs ${away} (home)`
  else if (teamId && game.awayId === teamId) summary = `${away} at ${home} (away)`
  else summary = `${home} vs ${away}`
  const field = game.field || venue?.name || ''
  const location = [field, venue?.address].filter(Boolean).join(', ')
  const description = [
    `Game #${game.code}`,
    division ? division.name : null,
    venue?.notes ? `Venue notes: ${venue.notes}` : null,
    siteUrl ? `Schedule: ${siteUrl}` : null,
  ].filter(Boolean).join('\n')
  return {
    uid: `game-${game.key}@cmsa-schedule`,
    date: game.date,
    time: game.time,
    durationMin: 60,
    summary: `⚽ ${summary}`,
    location,
    description,
    url: siteUrl,
  }
}
