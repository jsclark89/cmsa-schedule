// Look back through recent history and print what would have matched. Use this
// to tune your area and store terms before trusting the live alerts.
//
//   npm run scan               last 24 hours
//   npm run scan -- 72         last 72 hours

import { ChannelType, Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig, isWatched } from './config.js';
import { compileConfig, matchMessage, messageText } from './filter.js';

const hours = Number(process.argv[2] ?? 24);
const since = Date.now() - hours * 3_600_000;
const config = loadConfig();
const compiled = compileConfig(config);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once(Events.ClientReady, async () => {
  let scanned = 0;
  let matched = 0;

  for (const guild of client.guilds.cache.values()) {
    const channels = (await guild.channels.fetch()).filter(
      (ch) =>
        ch && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(ch.type) && isWatched(config, ch.id),
    );

    for (const ch of channels.values()) {
      let before;
      try {
        while (true) {
          const batch = await ch.messages.fetch({ limit: 100, before });
          if (!batch.size) break;
          for (const msg of batch.values()) {
            if (msg.createdTimestamp < since) continue;
            scanned++;
            const text = messageText(msg);
            const m = matchMessage(text, compiled);
            if (!m) continue;
            matched++;
            const when = msg.createdAt.toLocaleString();
            console.log(`\n${when}  #${ch.name}  [${[...m.stores, ...m.areas].join(', ')}]`);
            console.log('  ' + text.replace(/\s+/g, ' ').slice(0, 200));
            console.log('  ' + msg.url);
          }
          if (batch.last().createdTimestamp < since) break;
          before = batch.last().id;
        }
      } catch (e) {
        console.error(`skip #${ch.name}: ${e.message}`);
      }
    }
  }

  console.log(`\n${matched} of ${scanned} messages in the last ${hours}h matched "${compiled.label}".`);
  client.destroy();
});

client.login(config.token);
