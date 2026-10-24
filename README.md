# Calgary Soccer Game Finder

An unofficial, phone-friendly schedule site for Calgary Minor Soccer Association
(youth) and Calgary United Soccer Association (adult) leagues. It scrapes the league's Demosphere schedule pages into one JSON file and
serves a fast, mobile-first viewer on top of it.

What a parent gets that the league site does not:

- Star your team once; the home screen shows its next game, field, address and a
  directions link every time you open it.
- Subscribe your phone calendar to the team (one link, updates itself).
- Every game at a venue on a day, and every game in the league on a day.
- A log of schedule changes (moved, added or removed games) with timestamps.
- Footwear and surface notes for each venue, pulled from the field directory.

## Run it

    npm install
    npm run scrape      # writes public/data/season.json and public/ics/*.ics
    npm run dev         # http://localhost:5173

## Deploy

The GitHub Action in `.github/workflows/update.yml` re-scrapes every six hours,
commits any data changes, builds the site and deploys it to GitHub Pages.
Turn on Pages for the repo (Settings > Pages > Source: GitHub Actions) and it runs
on the next push. For Vercel instead, import the repo, build command
`npm run build`, output `dist`, and run `npm run scrape` on a schedule elsewhere.

## Training sessions

Club training is not on the league site, so it lives in
`public/data/training.json`, keyed by team id (the number in the team's URL).
Each entry has a weekday code, start and end time, venue, address, first and
last date, and optional skip dates. The team page shows it, and the scraper
folds it into that team's calendar as a weekly recurring event.

## Sources

- CMSA: `calgaryminorsoccer.com/schedule/<age>` embeds Demosphere pages, one
  static HTML page per division per month (`scripts/scrape.mjs`).
- CUSA: `cusa.ab.ca` is a RAMP site; the nav lists every category, division and
  team, and games come from its own JSON endpoint (`scripts/cusa.mjs`). CUSA
  arena names are rewritten to the CMSA field wording through `arenaAliases` in
  `public/data/venues.json`, so one footwear rule covers both.

## Data notes

- Source pages: `calgaryminorsoccer.com/schedule/<age>` embeds a Demosphere
  element whose URL lists the division ids for that age group. Each division
  has one static HTML page per month.
- Nothing here is official. The scraper only reads public pages, keeps the
  league's game numbers, and never writes anything back.
