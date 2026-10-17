import { appendFileSync } from 'node:fs';
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { loadConfig, isWatched } from './config.js';
import { compileConfig, matchMessage, messageText, Cooldown } from './filter.js';
import { sendAlert } from './notify.js';

const config = loadConfig();
const compiled = compileConfig(config);
const cooldown = new Cooldown(config.cooldownMinutes ?? 10);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

async function handle(msg) {
  if (!msg.guild || msg.author?.id === client.user.id) return;
  if (!isWatched(config, msg.channelId)) return;

  const text = messageText(msg);
  const match = matchMessage(text, compiled);
  if (!match || !cooldown.shouldAlert(match, text)) return;

  const source = `#${msg.channel?.name ?? msg.channelId} in ${msg.guild.name}`;
  console.log(`[match] ${source}: ${[...match.stores, ...match.areas].join(', ')}`);

  if (config.logFile) {
    appendFileSync(
      config.logFile,
      JSON.stringify({ at: new Date().toISOString(), source, link: msg.url, ...match, text }) + '\n',
    );
  }

  await sendAlert({ client, config, match, text, link: msg.url, source });
}

client.once(Events.ClientReady, (c) => {
  const guilds = c.guilds.cache.map((g) => g.name).join(', ') || 'none yet';
  console.log(`Logged in as ${c.user.tag}. Watching for "${compiled.label}" in: ${guilds}`);
});

client.on(Events.MessageCreate, (msg) => handle(msg).catch((e) => console.error('handler error:', e)));

// Stock bots often post a placeholder and fill the embed in a second later.
client.on(Events.MessageUpdate, async (_old, msg) => {
  try {
    if (msg.partial) msg = await msg.fetch();
    await handle(msg);
  } catch (e) {
    console.error('update handler error:', e);
  }
});

client.login(config.token);
