import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileConfig, matchMessage, messageText, normalize, Cooldown } from '../src/filter.js';

const example = JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url)));
const c = compileConfig(example);

test('matches a nearby area mentioned in plain text', () => {
  const m = matchMessage('Prismatic Evolutions ETBs just restocked at Walmart in **Airdrie**!', c);
  assert.deepEqual(m.areas, ['airdrie']);
});

test('names the specific store when a store alias matches', () => {
  const m = matchMessage('CrossIron walmart has 151 booster bundles on the shelf', c);
  assert.deepEqual(m.stores, ['Walmart Crossiron Mills']);
});

test('ignores posts about other cities', () => {
  assert.equal(matchMessage('Surging Sparks at Costco South Edmonton Common', c), null);
});

test('whole-word matching: "yyc" does not fire inside another word', () => {
  assert.equal(matchMessage('restock at the yycx outlet', c), null);
  assert.ok(matchMessage('YYC drop today', c));
});

test('ignoreIf suppresses noise even when the area matches', () => {
  assert.equal(matchMessage('Calgary Best Buy: SOLD OUT already', c), null);
});

test('productKeywords act as a second gate when set', () => {
  const strict = compileConfig({ ...example, productKeywords: ['etb', 'booster bundle'] });
  assert.equal(matchMessage('Calgary Walmart got Funko Pops', strict), null);
  assert.deepEqual(matchMessage('Calgary Walmart got ETBs', strict).products, ['etb']);
});

test('reads store and address out of bot embeds', () => {
  const text = messageText({
    content: '',
    embeds: [{ title: 'IN STOCK: Pokemon TCG Destined Rivals ETB', fields: [{ name: 'Store', value: 'Best Buy Chinook Centre' }] }],
  });
  assert.deepEqual(matchMessage(text, c).stores, ['Best Buy Chinook']);
});

test('custom emoji are reduced to their names', () => {
  assert.equal(normalize('<:pikachu:123456> Hi'), 'pikachu hi');
});

test('cooldown collapses repeat posts about the same store', () => {
  const cd = new Cooldown(10);
  const m = { stores: ['Best Buy Chinook'], areas: [], products: [] };
  assert.equal(cd.shouldAlert(m, 'a', 0), true);
  assert.equal(cd.shouldAlert(m, 'b', 5 * 60_000), false);
  assert.equal(cd.shouldAlert(m, 'c', 11 * 60_000), true);
});
