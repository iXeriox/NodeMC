'use strict';

const GUIDES = [
  {terms: ['house', 'home', 'shelter'], answer: 'Start with a 7×9 foundation, build walls 4 blocks high, add a peaked stair roof, windows, a door, torches, a bed, and storage.'},
  {terms: ['food', 'hungry', 'eat'], answer: 'Hunt passive mobs or collect seeds for a wheat farm. Keep cooked food in your hotbar before exploring.'},
  {terms: ['mine', 'mining', 'diamond', 'ore'], answer: 'Bring food, torches, and spare pickaxes. Use a staircase down, never dig straight below you, and mark your route home.'},
  {terms: ['craft', 'tools'], answer: 'Turn logs into planks, make a crafting table, then craft sticks and a pickaxe. Upgrade from wood to stone as soon as possible.'},
  {terms: ['farm', 'wheat', 'crop', 'seed'], answer: 'Hoe dirt within four blocks of water, plant seeds, and wait for fully grown golden wheat. The fenced farm beside world spawn has crops and a composter.'},
  {terms: ['chest', 'loot', 'treasure'], answer: 'Uncommon chests appear as real chest blocks in the wilderness and cottages. Use one to claim survival supplies; each generated chest can be claimed once.'},
  {terms: ['fight', 'attack', 'combat', 'sword'], answer: 'Use a sword, keep food ready, and time your approach. Animals and villagers notice attacks and flee; animals leave their usual resources and can rarely yield a bonus.'},
  {terms: ['enchant', 'experience', 'xp'], answer: 'An enchanting table needs lapis lazuli and experience levels. Surround it with up to 15 bookshelves, leaving a one-block air gap, for stronger choices.'},
  {terms: ['nether', 'portal', 'obsidian'], answer: 'Build an obsidian frame at least 4×5 blocks outside, leave the center empty, and ignite the inside with flint and steel. Carry spare food and mark the portal.'},
  {terms: ['smelt', 'furnace', 'cook'], answer: 'A furnace uses fuel below and the ingredient above. Coal is efficient; charcoal comes from smelting logs and is a useful early substitute.'},
  {terms: ['villager', 'farmer', 'npc'], answer: 'A farmer lives beside the spawn farm and vendors appear in rare cottages. Interact peacefully for supplies—attacked villagers will flee.'},
  {terms: ['lost', 'spawn', 'where'], answer: 'Use terrain landmarks and your scoreboard coordinates. Your original spawn is near X 0, Z 0.'},
  {terms: ['mob', 'animal'], answer: 'Animals wander, avoid hazards, and may flee when you get too close. Approach them slowly.'},
  {terms: ['command', 'help'], answer: 'Use /help for commands. You can also ask me about building, farming, mining, enchanting, the Nether, food, loot, crafting, navigation, villagers, or mobs.'}
];

function answerNodeQuestion(input) {
  const question = String(input).trim().replace(/^node\s*[,!:;-]?\s*/i, '').toLowerCase();
  if (!question) return 'I’m listening. Ask me about building, farming, mining, enchanting, food, loot, navigation, villagers, or mobs.';
  let best = null;
  let score = 0;
  const words = new Set(question.match(/[a-z0-9]+/g) || []);
  for (const guide of GUIDES) {
    const matches = guide.terms.filter(term => term.includes(' ') ? question.includes(term) : words.has(term)).length;
    if (matches > score) { best = guide; score = matches; }
  }
  return best?.answer || 'I do not know that yet. Try asking me about a house, farming, mining, enchanting, the Nether, loot, crafting, navigation, villagers, or mobs.';
}

module.exports = {answerNodeQuestion};
