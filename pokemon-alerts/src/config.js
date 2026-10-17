import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig() {
  const path = process.env.ALERTS_CONFIG ?? join(root, 'config.json');
  if (!existsSync(path)) {
    console.error(`No config at ${path}. Copy config.example.json to config.json and fill it in.`);
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(path, 'utf8'));
  config.token = process.env.DISCORD_TOKEN ?? config.token;
  if (!config.token) {
    console.error('Set DISCORD_TOKEN (or "token" in config.json) to your bot token.');
    process.exit(1);
  }
  return config;
}

// Empty watchChannels means "every channel the bot can read".
export function isWatched(config, channelId) {
  const list = config.watchChannels ?? [];
  return list.length === 0 || list.includes(channelId);
}
