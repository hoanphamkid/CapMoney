const zoomKeys = new Set(['+', '=', '-', '_', '0']);

function preventBrowserZoom(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) event.preventDefault();
}

function preventKeyboardZoom(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && zoomKeys.has(event.key)) event.preventDefault();
}

// The viewport metadata and touch-action rule handle mobile pinch/double-tap
// zoom. These listeners cover browser zoom shortcuts and Ctrl/Cmd + wheel.
window.addEventListener('wheel', preventBrowserZoom, { passive: false });
window.addEventListener('keydown', preventKeyboardZoom);
for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
  window.addEventListener(eventName, event => event.preventDefault(), { passive: false });
}
