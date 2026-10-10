// Turns the league's free-text venue notes into one clear line for a given field.
// Shared by the site and the calendar builder, so both say the same thing.
//
// A venue can have several notes, one per area, e.g. MaxWell:
//   "Maxwell soccer centre Dome- | Regular cleats | Turf"
//   "Maxwell soccer centre (Main/Annex) Boarded field (boards not in use for 7v7) | Flat-sole shoes (runners) | Carpet"
// The field name ("MaxWell Soccer Centre Main - East Field") tells us which applies.

const STOP = new Set(['soccer', 'centre', 'center', 'field', 'the', 'and', 'for', 'not', 'use', 'boarded', 'boards', 'regular', 'cleats', 'turf', 'carpet', 'shoes', 'runners', 'flat', 'sole', 'indoor', 'season', 'dome'])

/** The raw note that applies to this field, or all notes joined when none can be matched. */
export function noteFor(venue, field) {
  const notes = venue?.notes || []
  if (!notes.length) return null
  if (notes.length === 1) return notes[0]
  const f = (field || '').toLowerCase()
  const venueWords = new Set((venue.name || '').toLowerCase().split(/\W+/))
  for (const n of notes) {
    const head = n.split('|')[0].toLowerCase()
    const words = head.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !venueWords.has(w) && !STOP.has(w))
    if (head.includes('dome')) words.push('dome')
    if (words.some((w) => f.includes(w))) return n
  }
  return notes.join(' / ')
}

/**
 * Structured reading of a note: what to wear, what the surface is, anything else.
 * footwear is a short label ("Runners" or "Cleats") when the note is unambiguous.
 */
export function parseNote(note, venue) {
  if (!note) return null
  const parts = note.split('|').map((s) => s.trim()).filter(Boolean)
  const name = (venue?.name || '').toLowerCase()
  const out = { footwear: null, footwearDetail: null, surface: null, other: [] }
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i]
    if (i === 0 && name && p.toLowerCase().startsWith(name)) p = p.slice(name.length).replace(/^[\s:-]+/, '')
    p = p.replace(/^\(([^)]*)\)\s*/, '$1: ').replace(/-\s*$/, '').trim()
    if (!p) continue
    const l = p.toLowerCase()
    if (/flat-?sole|runners|indoor shoes/.test(l)) {
      out.footwear = 'Runners'
      out.footwearDetail = p
    } else if (/cleats/.test(l) && !out.footwear) {
      out.footwear = 'Cleats'
      out.footwearDetail = p
    } else if (/^(turf|carpet|grass|artificial)/.test(l)) {
      out.surface = p
    } else {
      out.other.push(p)
    }
  }
  return out
}

export function footwearFor(venue, field) {
  const note = noteFor(venue, field)
  if (!note) return null
  const out = parseNote(note, venue)
  if (note.includes(' / ')) out.footwear = null // ambiguous: several areas, none matched
  return out
}

/** Every area of a venue with what to wear there, for the venue page. */
export function areasFor(venue) {
  return (venue?.notes || []).map((n) => {
    const p = parseNote(n, venue)
    const area = p.other.find((o) => /:/.test(o))?.split(':')[0] || p.other[0] || null
    return { ...p, area }
  })
}

/** "Runners (flat-sole shoes)" or "Cleats": the label plus any detail that adds something. */
export function bringLine(venue, field) {
  const f = footwearFor(venue, field)
  if (!f?.footwear) return null
  const detail = (f.footwearDetail || '')
    .toLowerCase()
    .replace(/\(?\b(runners|regular cleats|cleats)\b\)?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return detail ? `${f.footwear} (${detail})` : f.footwear
}

/** One readable line: "Runners · Carpet · Main/Annex: Boarded field (boards not in use for 7v7)" */
export function noteLine(venue, field) {
  const f = footwearFor(venue, field)
  if (!f) return null
  const bits = []
  if (f.footwear) bits.push(f.footwear)
  else if (f.footwearDetail) bits.push(f.footwearDetail)
  if (f.surface) bits.push(f.surface)
  bits.push(...f.other)
  return bits.join(' · ')
}
