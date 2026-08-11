'use strict';

const GUIDES = [
  {terms: ['house', 'home', 'shelter'], answer: 'Start with a 7×9 foundation, build walls 4 blocks high, add a peaked stair roof, windows, a door, torches, a bed, and storage.'},
  {terms: ['food', 'hungry', 'eat'], answer: 'Hunt passive mobs or collect seeds for a wheat farm. Keep cooked food in your hotbar before exploring.'},
  {terms: ['mine', 'mining', 'diamond', 'ore'], answer: 'Bring food, torches, and spare pickaxes. Use a staircase down, never dig straight below you, and mark your route home.'},
  {terms: ['craft', 'tools'], answer: 'Turn logs into planks, make a crafting table, then craft sticks and a pickaxe. Upgrade from wood to stone as soon as possible.'},
  {terms: ['lost', 'spawn', 'where'], answer: 'Use terrain landmarks and your scoreboard coordinates. Your original spawn is near X 0, Z 0.'},
  {terms: ['mob', 'animal'], answer: 'Animals wander, avoid hazards, and may flee when you get too close. Approach them slowly.'},
  {terms: ['command', 'help'], answer: 'Use /help for commands. You can also ask me about building, mining, food, crafting, navigation, or mobs.'}
];

function answerNodeQuestion(input) {
  const question = String(input).trim().replace(/^node\s*[,!:;-]?\s*/i, '').toLowerCase();
  if (!question) return 'I’m listening. Ask me about building, mining, food, crafting, navigation, or mobs.';
  let best = null;
  let score = 0;
  for (const guide of GUIDES) {
    const matches = guide.terms.filter(term => question.includes(term)).length;
    if (matches > score) { best = guide; score = matches; }
  }
  return best?.answer || 'I do not know that yet. Try asking me about a house, mining, food, crafting, navigation, or mobs.';
}

module.exports = {answerNodeQuestion};
