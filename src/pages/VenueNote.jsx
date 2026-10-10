/**
 * Picks the venue note that applies to a field. MaxWell, for example, needs
 * cleats in the Dome but flat-sole shoes in Main/Annex, so the right line matters.
 */
export function noteFor(venue, field) {
  const notes = venue?.notes || []
  if (!notes.length) return null
  if (notes.length === 1) return notes[0]
  const f = (field || '').toLowerCase()
  const venueWords = new Set((venue.name || '').toLowerCase().split(/\W+/))
  const stop = new Set(['soccer', 'centre', 'center', 'field', 'the', 'and', 'for', 'not', 'use', 'boarded', 'boards', 'regular', 'cleats', 'turf', 'carpet', 'shoes', 'runners', 'flat', 'sole', 'indoor', 'season', 'dome'])
  let best = null
  for (const n of notes) {
    const head = n.split('|')[0].toLowerCase()
    const words = head.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !venueWords.has(w) && !stop.has(w))
    const keyWords = [...words, ...(head.includes('dome') ? ['dome'] : [])]
    if (keyWords.some((w) => f.includes(w))) {
      best = n
      break
    }
  }
  return best || notes.join(' / ')
}

function tidy(note, venue) {
  const parts = note.split('|').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return note
  const name = (venue?.name || '').toLowerCase()
  let first = parts[0]
  if (name && first.toLowerCase().startsWith(name)) first = first.slice(name.length).replace(/^[\s:-]+/, '')
  first = first.replace(/^\(([^)]*)\)\s*/, '$1: ').replace(/-\s*$/, '').trim()
  return [first, ...parts.slice(1)].filter(Boolean).join(' · ')
}

export default function VenueNote({ venue, field }) {
  const n = noteFor(venue, field)
  if (!n) return null
  return <div className="note">👟 {tidy(n, venue)}</div>
}
