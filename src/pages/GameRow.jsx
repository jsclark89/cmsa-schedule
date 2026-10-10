import { href } from '../lib/router.js'
import { fmtTime, fmtDate, isPast, fieldOnly } from '../lib/data.js'

/**
 * One compact game line. `perspective` is a team id: the row then reads as
 * "vs Opponent (home)" or "at Opponent"; without it, "Home vs Away".
 */
export default function GameRow({ game: g, season, perspective, showDate, showDivision, highlightIds = [] }) {
  const venue = season.venues[g.venueId]
  const field = fieldOnly(g, venue)
  const past = isPast(g)
  const hot = highlightIds.includes(g.homeId) || highlightIds.includes(g.awayId)
  let matchup
  if (perspective && (g.homeId === perspective || g.awayId === perspective)) {
    const home = g.homeId === perspective
    const opp = home ? g.awayName : g.homeName
    const oppId = home ? g.awayId : g.homeId
    matchup = (
      <>
        <span className="muted">{home ? 'vs' : 'at'}</span> <a href={href('team', oppId)}>{opp}</a>
        <span className={`pill ${home ? 'home' : 'away'}`}>{home ? 'Home' : 'Away'}</span>
      </>
    )
  } else {
    matchup = (
      <>
        <a href={href('team', g.homeId)} className={highlightIds.includes(g.homeId) ? 'hl' : ''}>{g.homeName}</a>
        <span className="muted"> vs </span>
        <a href={href('team', g.awayId)} className={highlightIds.includes(g.awayId) ? 'hl' : ''}>{g.awayName}</a>
      </>
    )
  }
  return (
    <div className={`row ${past ? 'past' : ''} ${hot ? 'hot' : ''}`}>
      <div className="row-when">
        {showDate ? <div className="row-date">{fmtDate(g.date, 'short')}</div> : null}
        <div className="row-time">{fmtTime(g.time)}</div>
      </div>
      <div className="row-main">
        <div className="row-match">
          {matchup}
          {g.result ? <span className="pill result">{g.result}</span> : null}
          {g.label ? <span className="pill label">{g.label}</span> : null}
        </div>
        <div className="row-where">
          {venue ? <a href={href('venue', venue.id)}>{venue.name}</a> : g.field || 'Venue TBA'}
          {field ? <span className="muted"> · {field}</span> : null}
          {showDivision && season.divisions[g.divisionId] ? (
            <span className="muted"> · <a href={href('division', g.divisionId)}>{season.divisions[g.divisionId].name}</a></span>
          ) : null}
        </div>
      </div>
      <div className="row-code" title="League game number">#{g.code}</div>
    </div>
  )
}
