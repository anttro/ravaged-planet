import {DEFAULT_KEYPRESS_DELAY, Z} from './constants.js?v=20';

const input = {};
let lastKeypressTime = 0;
let clickQueue = [];
let canvasEl = null;
let pointerX = 0, pointerY = 0;
let isPointerDown = false;

document.addEventListener('keydown', (e) => {input[e.key] = true; e.preventDefault()});
document.addEventListener('keyup', (e) => {input[e.key] = false; e.preventDefault()});

export function key(key) {
  return input[key]
}

export function afterKeyDelay(amount=DEFAULT_KEYPRESS_DELAY) {
  const now = Date.now();
  if (now - lastKeypressTime >= amount) {
    lastKeypressTime = now;
    return true;
  }
}

export function getPointer() {
  return {x: pointerX, y: pointerY};
}

export function isPointerPressed() {
  return isPointerDown;
}

export function initClickCanvas(canvas) {
  canvasEl = canvas;
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('touchstart', handleTouchStart, {passive: false});
  canvas.addEventListener('touchmove', handleTouchMove, {passive: false});
  canvas.addEventListener('touchend', handleTouchEnd, {passive: false});
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mouseup', handleMouseUp);
}

function getCanvasPos(clientX, clientY) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / Z,
    y: (clientY - rect.top) / Z,
  };
}

function handleClick(e) {
  const {x, y} = getCanvasPos(e.clientX, e.clientY);
  clickQueue.push({x, y});
}

function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.changedTouches[0];
  const {x, y} = getCanvasPos(touch.clientX, touch.clientY);
  clickQueue.push({x, y});
  pointerX = x;
  pointerY = y;
  isPointerDown = true;
}

function handleTouchMove(e) {
  e.preventDefault();
  const touch = e.changedTouches[0];
  const {x, y} = getCanvasPos(touch.clientX, touch.clientY);
  pointerX = x;
  pointerY = y;
}

function handleTouchEnd(e) {
  e.preventDefault();
  isPointerDown = false;
}

function handleMouseMove(e) {
  const {x, y} = getCanvasPos(e.clientX, e.clientY);
  pointerX = x;
  pointerY = y;
}

function handleMouseDown(e) {
  const {x, y} = getCanvasPos(e.clientX, e.clientY);
  pointerX = x;
  pointerY = y;
  isPointerDown = true;
}

function handleMouseUp(e) {
  isPointerDown = false;
}

export function popClick() {
  return clickQueue.shift() || null;
}
