import { href } from '../lib/router.js'
import { fmtStamp, fmtDate, fmtTime } from '../lib/data.js'

const FIELD_LABEL = { date: 'date', time: 'time', homeId: 'home team', awayId: 'away team', venueId: 'venue', field: 'field' }

export default function Changes({ season, favs }) {
  const changes = season.changes || []
  const mine = (c) => [c.before?.homeId, c.before?.awayId, c.after?.homeId, c.after?.awayId].some((id) => id && favs.includes(id))

  return (
    <>
      <p className="muted small">
        Every six hours this site re-reads the league schedule and records anything that moved. Tracking since {fmtStamp(season.trackingSince)}.
      </p>
      {changes.length === 0 ? <div className="card soft">No schedule changes recorded yet.</div> : null}
      {changes.map((c, i) => {
        const div = season.divisions[c.divisionId]
        const g = c.after || c.before
        const home = season.teams[g.homeId]?.name || 'Unknown'
        const away = season.teams[g.awayId]?.name || 'Unknown'
        return (
          <div key={`${c.key}-${i}`} className={`card change ${mine(c) ? 'hot' : ''}`}>
            <div className="muted small">{fmtStamp(c.at)} · {div ? <a href={href('division', div.id)}>{div.name}</a> : 'Unknown division'}{c.code ? ` · game #${c.code}` : ''}</div>
            <div className="change-title">
              <span className={`pill ${c.type}`}>{c.type}</span> <a href={href('team', g.homeId)}>{home}</a> vs <a href={href('team', g.awayId)}>{away}</a>
            </div>
            {c.type === 'moved' ? (
              <ul className="diff">
                {c.fields.map((f) => (
                  <li key={f}>
                    <b>{FIELD_LABEL[f] || f}</b>: {show(f, c.before, season)} <span className="muted">is now</span> {show(f, c.after, season)}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="muted">{fmtDate(g.date)} · {fmtTime(g.time)} · {g.field || season.venues[g.venueId]?.name || 'venue TBA'}</div>
            )}
          </div>
        )
      })}
    </>
  )
}

function show(field, snap, season) {
  const v = snap?.[field]
  if (v == null) return 'none'
  if (field === 'date') return fmtDate(v)
  if (field === 'time') return fmtTime(v)
  if (field === 'homeId' || field === 'awayId') return season.teams[v]?.name || v
  if (field === 'venueId') return season.venues[v]?.name || v
  return v
}
