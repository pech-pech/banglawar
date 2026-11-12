// Save sheet: export the save as text, import it back, start a new game. Opened with openSheet; no storage here.
import { openSheet } from './sheet.js';

const REASONS = {
  parse: 'That text is not a save. Paste the whole text you copied.',
  shape: 'That text is not a save from this game.',
  checksum: 'The text was changed or cut short, so it was not loaded. Copy it again.',
  newer: 'That save is from a newer version of the game, so it was not loaded.',
};
const BTN = 'c-btn c-btn--block';
const MIN = 'min-height:56px;font-size:14px';

/**
 * @param {{ getText:()=>string, check:(text:string)=>{ok:boolean, reason?:string},
 *   onImport:(text:string)=>void, onNewGame:()=>void, saved?:boolean }} o
 * check() validates pasted text without touching the game; onImport/onNewGame are done by main.js.
 * @returns {() => void} close
 */
export function openSaveSheet(o) {
  const html =
    '<div class="save-sheet" style="display:grid;gap:12px">' +
    (o.saved === false ? '<p class="muted" role="status" style="margin:0">This browser is not keeping saves (private mode?). Copy your save text to keep it.</p>' : '') +
    '<label for="save-out" class="muted" style="font-size:14px">Your save, as text</label>' +
    '<textarea id="save-out" readonly rows="3" style="width:100%;font-size:14px"></textarea>' +
    '<button type="button" class="' + BTN + ' c-btn--primary" style="' + MIN + '" data-sv="copy">Copy save text</button>' +
    '<label for="save-in" class="muted" style="font-size:14px">Load a save: paste its text here</label>' +
    '<textarea id="save-in" rows="3" style="width:100%;font-size:14px" autocomplete="off" spellcheck="false"></textarea>' +
    '<button type="button" class="' + BTN + '" style="' + MIN + '" data-sv="load">Load this save</button>' +
    '<p id="save-msg" class="muted" role="status" aria-live="polite" style="margin:0;font-size:14px"></p>' +
    '<button type="button" class="' + BTN + ' c-btn--danger" style="' + MIN + '" data-sv="new">New game</button>' +
    '</div>';
  const close = openSheet('Save', html);
  const root = document.querySelector('.save-sheet');
  if (!root) return close;
  const out = root.querySelector('#save-out'), inp = root.querySelector('#save-in'), msg = root.querySelector('#save-msg');
  const say = (t) => { msg.textContent = t; };
  try { out.value = o.getText(); } catch (e) { out.value = ''; say('Could not make the save text.'); }
  let armed = false;
  root.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('[data-sv]');
    if (!b) return;
    const act = b.getAttribute('data-sv');
    if (act === 'copy') {
      out.focus(); out.select();
      try { await navigator.clipboard.writeText(out.value); say('Copied.'); } catch (err) { say('Text selected. Use Copy in your phone menu.'); }
    } else if (act === 'load') {
      const text = inp.value.trim();
      if (!text) { say('Paste your save text first.'); return; }
      const r = o.check(text);
      if (!r.ok) { say(REASONS[r.reason] || REASONS.shape); return; }
      say('Loaded. Starting from your save.');
      close(); o.onImport(text);
    } else if (act === 'new') {
      if (!armed) { armed = true; b.textContent = 'Tap again to erase this game'; say('This replaces your current game. Copy your save text first if you want to keep it.'); return; }
      close(); o.onNewGame();
    }
  });
  return close;
}
