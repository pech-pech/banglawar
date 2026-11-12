// Look setting. The Scorebook skin is one opt-in body class, like retro-green: swap the class, nothing else forks.
// Saved as state.theme ('green' | 'scorebook'); an absent field means 'green', so no save version bump.
export const THEMES = [{ id: 'green', label: 'Green and chalk' }, { id: 'scorebook', label: 'Scorebook' }];
export const themeOf = (s) => (s && s.theme === 'scorebook' ? 'scorebook' : 'green');

/** Put the right skin classes on <body>. Safe to call any number of times. */
export function applyTheme(theme, body = typeof document !== 'undefined' ? document.body : null) {
  if (!body) return;
  const sb = theme === 'scorebook';
  body.classList.toggle('skin-scorebook', sb);
  body.classList.toggle('skin-art', !sb);
  body.classList.toggle('skin-retro-green', !sb);
}
