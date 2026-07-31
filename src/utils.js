import {randomInt} from './math.js?v=26';

export function sample(arr) {
  return arr[randomInt(0, arr.length-1)];
}

export function without(arr, item) {
  return arr.filter(x => x !== item);
}

export function shuffle(arr) {
  const result = [];
  let original = [...arr];

  for (let i=0; i<arr.length; i++) {
    const value = sample(original);
    original = without(original, value);
    result.push(value);
  }

  return result;
}

export function nextId() {
  // @ts-ignore
  const id = nextId.id || 0;
  // @ts-ignore
  nextId.id = id + 1;
  return id;
}

export function newPlayerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function splitWords(text) {
  let words = [''];
  for (let char of text) {
    if ([' ', '\n'].includes(char)) words.push(char, '');
    else words[words.length-1] += char;
  }
  if (words[words.length-1] === '') words = words.slice(0, words.length-1);
  return words;
}
