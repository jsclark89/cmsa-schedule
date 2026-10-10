import { useState } from 'react'
import { href } from '../lib/router.js'
import { fmtDate, relDay, isPast, groupBy } from '../lib/data.js'
import GameRow from './GameRow.jsx'

export default function Venue({ season, favs, venue }) {
  const games = season.byVenue[venue.id] || []
  const upcoming = games.filter((g) => !isPast(g))
  const [days, setDays] = useState(3)
  const byDate = [...groupBy(upcoming, (g) => g.date).entries()]
  const shown = byDate.slice(0, days)

  return (
    <>
      <div className="card">
        {venue.address ? <div>{venue.address}</div> : <div className="muted">No address on the league site.</div>}
        {venue.notes?.length ? (
          <ul className="notes">
            {venue.notes.map((n, i) => <li key={i}>👟 {n}</li>)}
          </ul>
        ) : null}
        <div className="actions">
          {venue.mapsUrl ? <a className="btn primary" href={venue.mapsUrl} target="_blank" rel="noopener">Directions</a> : null}
        </div>
      </div>

      <h2 className="h">Upcoming here</h2>
      {shown.length === 0 ? <p className="muted">No upcoming games at this venue.</p> : null}
      {shown.map(([date, list]) => (
        <div key={date} className="group">
          <div className="group-title">
            <a href={href('day', date)}>{fmtDate(date, 'long')}</a> <span className="muted">· {relDay(date)} · {list.length} games</span>
          </div>
          {list.map((g) => <GameRow key={g.key} game={g} season={season} highlightIds={favs} showDivision />)}
        </div>
      ))}
      {byDate.length > days ? (
        <button className="linkbtn" onClick={() => setDays((d) => d + 5)}>Show more days ({byDate.length - days} left)</button>
      ) : null}
    </>
  )
}
