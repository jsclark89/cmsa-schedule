import { noteLine } from '../lib/venueNote.js'

export default function VenueNote({ venue, field }) {
  const line = noteLine(venue, field)
  if (!line) return null
  return <div className="note">👟 {line}</div>
}
