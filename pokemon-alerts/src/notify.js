// Delivery: a Discord DM from the bot, plus optional ntfy.sh phone push and an
// optional webhook into a private channel. Any combination can be on.

function summary(match, label) {
  const where = match.stores.length ? match.stores.join(', ') : match.areas.join(', ');
  const what = match.products.length ? ` (${match.products.join(', ')})` : '';
  return `${label}: ${where}${what}`;
}

function excerpt(text, max = 600) {
  const t = text.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export async function sendAlert({ client, config, match, text, link, source }) {
  const notify = config.notify ?? {};
  const title = summary(match, config.location?.label ?? 'Nearby');
  const body = `${excerpt(text)}\n\n${source}\n${link}`;
  const jobs = [];

  if (notify.dmUserId && client) {
    jobs.push(
      client.users.fetch(notify.dmUserId).then((u) =>
        u.send({ content: `**${title}**\n${body}`.slice(0, 2000) }),
      ),
    );
  }

  if (notify.ntfyTopic) {
    const server = notify.ntfyServer ?? 'https://ntfy.sh';
    jobs.push(
      fetch(`${server}/${encodeURIComponent(notify.ntfyTopic)}`, {
        method: 'POST',
        headers: { Title: title.replace(/[^\x20-\x7e]/g, ''), Click: link, Priority: 'high', Tags: 'zap' },
        body: excerpt(text, 1000),
      }).then((r) => {
        if (!r.ok) throw new Error(`ntfy ${r.status}`);
      }),
    );
  }

  if (notify.webhookUrl) {
    jobs.push(
      fetch(notify.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Stock near me', content: `**${title}**\n${body}`.slice(0, 2000) }),
      }).then((r) => {
        if (!r.ok) throw new Error(`webhook ${r.status}`);
      }),
    );
  }

  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === 'rejected') console.error('notify failed:', r.reason?.message ?? r.reason);
}
