// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only. Extra keys the game reads: B buy menu, E use (plant/defuse),
// 1/2/3 weapon slots, 4 frag, 5 smoke, Q quick-swap, Shift walk slow.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0, scoped: false };
  const pressed = new Set();

  function setKey(event, down) {
    if (down) {
      if (!event.repeat) pressed.add(event.code);
      keys.add(event.code);
    } else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.scoped = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.scoped = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.scoped = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      // Chrome refuses a re-lock for ~1.25s after an exit; swallow that
      // rejection instead of leaking an unhandled promise error to the console.
      try {
        const p = canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch { /* pointer lock unavailable */ }
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takePressed() {
      // Copy first: `out` must be a new set, or clear() would empty the
      // returned set too and every edge-triggered key (B/R/1/2/Q/4/5) would
      // silently never fire.
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
  };
}
