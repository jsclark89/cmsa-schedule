import { footwearFor } from '../lib/venueNote.js'

/** The surface under the Bring badge (the badge carries the footwear). */
export default function VenueNote({ venue, field }) {
  const f = footwearFor(venue, field)
  if (!f) return null
  const bits = [f.footwear ? null : f.footwearDetail, f.surface].filter(Boolean)
  if (!bits.length) return null
  return <div className="note muted small">{bits.join(' · ')}</div>
}
