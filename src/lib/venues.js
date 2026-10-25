// Hand-kept additions to the scraped data, shared by the scraper and the site.
//   public/data/venues.json: venues the league does not list, footwear notes it
//     leaves blank, CUSA arena aliases, and short venue names for calendar titles.
//   public/data/teams.json: short team names for calendar titles ("U11 Forest").

const RESERVED = new Set(['arenaAliases', 'titleNames'])

/** Add venues the league lacks, fill blank notes and addresses, and attach short title names. */
export function mergeExtraVenues(venues, extra) {
  for (const [name, v] of Object.entries(extra || {})) {
    if (name.startsWith('_') || RESERVED.has(name)) continue
    const existing = Object.values(venues).find((x) => x.name === name)
    if (existing) {
      if (!existing.notes?.length && v.notes?.length) existing.notes = v.notes
      if (!existing.address && v.address) existing.address = v.address
      continue
    }
    const id = 'x-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    venues[id] = {
      id,
      name,
      address: v.address || null,
      notes: v.notes || [],
      mapsUrl: v.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ', ' + v.address)}` : null,
      manual: true,
    }
  }
  for (const [name, short] of Object.entries(extra?.titleNames || {})) {
    const v = Object.values(venues).find((x) => x.name === name)
    if (v) v.short = short
  }
  return venues
}

/** Attach hand-kept short names to teams. */
export function applyTeamShortNames(teams, map) {
  for (const [id, short] of Object.entries(map || {})) {
    if (id.startsWith('_')) continue
    if (teams[id]) teams[id].short = short
  }
  return teams
}
