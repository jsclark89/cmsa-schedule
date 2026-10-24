import { footwearFor, footwearInfo, bringLine } from '../lib/venueNote.js'

/** Bold "Bring indoor shoes" / "Bring cleats" badge for one game's field. */
export default function Bring({ venue, field, big }) {
  const f = footwearFor(venue, field)
  const info = footwearInfo(f?.kind)
  if (!info) return null
  return (
    <span className={`bring ${info.cls} ${big ? 'big' : ''}`} title={bringLine(venue, field)}>
      {info.icon} Bring {info.label.toLowerCase()}
    </span>
  )
}

/** Small badge with just the label, for lists. */
export function FootwearTag({ kind }) {
  const info = footwearInfo(kind)
  if (!info) return null
  return <span className={`bring ${info.cls}`}>{info.icon} {info.label}</span>
}
