// The look before the first paint (Settings > Appearance, Alex 28 Oct): a light app opens light, not dark for a moment.
// A plain script in <head>, before the page's own module; app.js applyLook() keeps it up to date afterwards.
try {
  const o = JSON.parse(localStorage.getItem('twin:opts') || '{}')
  const d = document.documentElement
  const dark = o.theme === 'auto' ? !!window.matchMedia?.('(prefers-color-scheme: dark)').matches : o.theme !== 'light'
  d.dataset.theme = dark ? 'dark' : 'light'
  d.dataset.accent = o.accent || 'red'
  d.dataset.size = o.size || 'medium'
  d.dataset.motion = o.motion === 'less' ? 'less' : 'full'
} catch { /* private window: the defaults */ }
