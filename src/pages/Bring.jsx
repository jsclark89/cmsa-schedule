import { footwearFor, bringLine } from '../lib/venueNote.js'

/** Bold "Bring runners" / "Bring cleats" badge for one game's field. */
export default function Bring({ venue, field, big }) {
  const f = footwearFor(venue, field)
  if (!f?.footwear) return null
  const cls = f.footwear === 'Runners' ? 'runners' : 'cleats'
  return (
    <span className={`bring ${cls} ${big ? 'big' : ''}`} title={bringLine(venue, field)}>
      {f.footwear === 'Runners' ? '👟' : '⚽'} Bring {f.footwear.toLowerCase()}
    </span>
  )
}
