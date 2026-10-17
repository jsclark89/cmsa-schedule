// Run the Facebook / RSS feed watcher on its own, without the Discord bot.
//
//   npm run feeds              watch feeds, alert by ntfy and/or webhook
//   npm run feeds -- --check   fetch once and show which recent posts match
//
// Discord DMs need the bot logged in, so for DMs use `npm start` instead,
// which runs the Discord watcher and the feed watcher together.

import { loadConfig } from './config.js';
import { checkFeeds, startFeeds } from './feeds.js';

const config = loadConfig({ requireToken: false });

if (!config.feeds?.sources?.length) {
  console.error('No feeds.sources in config.json. See the README section on Facebook pages.');
  process.exit(1);
}

if (process.argv.includes('--check')) {
  await checkFeeds(config);
} else {
  if (!config.notify?.ntfyTopic && !config.notify?.webhookUrl) {
    console.error('Standalone feed mode alerts through notify.ntfyTopic or notify.webhookUrl; set one (or use npm start for DMs).');
    process.exit(1);
  }
  startFeeds({ config, client: null });
}
