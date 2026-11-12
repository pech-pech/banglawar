(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
if (typeof document === 'undefined') return;
/* Upgrades tab (step 8): the three Conditioning stat tiles as before plus an UPGRADE button. UPGRADE opens the pick-an-upgrade bottom sheet
   (SPEC-UX section 1): item list, 3 tier chips with odds words and bars, Catalyst switch, one-tap "Upgrade for N CR", then the reveal card
   (grade ring, pips, COMMON / RARE / EPIC, sparks, count-up, refund line, Done). Reads/writes only through V.Meta (items, quote, roll).
   Exports V.UpSheet = {open(kind, id), close(), isOpen()}; the Armory calls open('gear', 'exo') etc. The sheet lives in #hmBody (above the tab
   bar, which stays tappable); a tap on any tab closes it with no spend. Classes: pv-* from home.css, tb-up-* and us-* are local (injected below).
   Guards: confirm armed 350 ms after open, reveal close armed 350 ms after the card shows; nothing closes by timer. Reduced motion: the card at once. */

var NS = 'http://www.w3.org/2000/svg';
var STATS = [
  { id:'hp',   name:'Reinforced Frame', what:'Max HP',       cap:10, per:1, icon:'frame' },
  { id:'atk',  name:'Power Cell',       what:'Attack',       cap:20, per:2, icon:'cell' },
  { id:'rate', name:'Servo Tuning',     what:'Attack speed', cap:20, per:2, icon:'servo' }
];
var NAMES = { rifle:'Ranger Rifle', hp:'Reinforced Frame', atk:'Power Cell', rate:'Servo Tuning' };
var ICON_OF = { rifle:'rifle', hp:'frame', atk:'cell', rate:'servo', exo:'vest', modA:'aim', modB:'bolt', droneA:'drone', droneB:'guard', perk2:'pierce' };
var ICONS = {
  frame:'<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M12 8v7M8.5 11.5h7"/>',
  cell:'<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M10 2v2M14 2v2M13 8l-3 5h4l-3 5"/>',
  servo:'<circle cx="12" cy="12" r="3.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  rifle:'<path d="M2 14h13l2-3h5v4h-4l-1 3h-4l-1-3H2z"/><path d="M7 14v3"/>',
  aim:'<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  bolt:'<rect x="5" y="6" width="14" height="12" rx="2"/><path d="M13 8l-3 4h4l-3 4"/>',
  drone:'<circle cx="12" cy="13" r="3"/><path d="M3 8h6M15 8h6M6 8v3M18 8v3M9 13H5M19 13h-4"/>',
  vest:'<path d="M6 4l6 2 6-2 3 4-3 3v9H6v-9L3 8z"/>',
  guard:'<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><circle cx="12" cy="12" r="2.5"/>',
  pierce:'<path d="M3 12h18M17 7l5 5-5 5"/><path d="M8 7v10M12 8v8"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  arrow:'<path d="M3 12h8M13 6l8 6-8 6z"/>',
  close:'<path d="M5 5l14 14M19 5L5 19"/>',
  check:'<path d="M4 12l5 5L20 6"/>',
  schem:'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h5M8 16h8"/>'
};
function ico(name, cls){ return '<svg class="pv-ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.cell) + '</svg>'; }
var COIN = '<svg class="tb-coin" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="#e8b020" stroke="#0f1215" stroke-width="1.5"/><circle cx="8" cy="8" r="4" fill="none" stroke="rgba(120,70,0,.55)" stroke-width=".9"/></svg>';

var COG_OLD = '<svg class="tb-cog" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="5" fill="#2f363e" stroke="#0f1215" stroke-width="1.5"/><g transform="translate(20 20)"><g fill="#8f897b" stroke="#0f1215" stroke-width="1"><rect x="-2.5" y="-13" width="5" height="5" rx="1"/><rect x="-2.5" y="-13" width="5" height="5" rx="1" transform="rotate(60)"/><rect x="-2.5" y="-13" width="5" height="5" rx="1" transform="rotate(120)"/><rect x="-2.5" y="-13" width="5" height="5" rx="1" transform="rotate(180)"/><rect x="-2.5" y="-13" width="5" height="5" rx="1" transform="rotate(240)"/><rect x="-2.5" y="-13" width="5" height="5" rx="1" transform="rotate(300)"/></g><circle r="9" fill="#b6b0a2" stroke="#0f1215" stroke-width="1.5"/><circle r="3.6" fill="#2f363e"/><path d="M0 -6.5l3 3M0 -6.5l-3 3" stroke="#e4dfd2" stroke-width="1.4" fill="none" stroke-linecap="round" transform="translate(0 -0.5)"/></g></svg>';
var CSS = '\
.tb-up{position:relative;height:100%;display:flex;flex-direction:column;color:var(--pv-ui-text);font:400 14px/1.35 var(--pv-ui-font);box-sizing:border-box;user-select:none;-webkit-tap-highlight-color:transparent}\
.tb-up *,.tb-up *::before,.tb-up *::after{box-sizing:border-box}\
.tb-up .body{flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;padding:12px 12px var(--tb-bottom,98px);display:flex;flex-direction:column;gap:8px}\
.tb-up .body::-webkit-scrollbar{display:none}\
.tb-up .rule{display:flex;align-items:baseline;gap:8px;margin:0;font-size:12px;color:var(--pv-ui-text-2)}\
.tb-up .rule .n{margin-left:auto;white-space:nowrap;font:800 12px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-text);letter-spacing:.04em}\
.tb-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}\
.tl{position:relative;min-height:132px;padding:10px 8px 8px;display:flex;flex-direction:column;align-items:flex-start;gap:4px;background:linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-800));border:1.5px solid var(--pv-ui-ink);border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),inset 0 -2px 0 rgba(0,0,0,.35),0 2px 0 rgba(0,0,0,.55)}\
.tl.mx{border-color:var(--pv-ui-r5);box-shadow:inset 0 0 0 1px var(--pv-ui-r5),0 0 8px rgba(224,169,58,.35)}\
.tl.mx .pv-bar__fill{background:linear-gradient(#f3d27a,var(--pv-ui-r5))}\
.tb-ti{width:36px;height:36px;flex:none;display:flex;align-items:center;justify-content:center;font-size:24px;background:var(--pv-ui-ink);border-radius:4px;color:var(--pv-ui-cyan);box-shadow:inset 0 0 0 1.5px var(--pv-ui-metal-500);overflow:hidden}\
.tl .tn{font:800 12px/1.05 var(--pv-ui-font-stencil);text-transform:uppercase;letter-spacing:.05em;min-height:23px}\
.tl .tv{font:800 12px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-sand)}\
.tl .fx{font:800 12px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-text-2)}\
.tl .pv-bar{width:100%;height:10px;margin-top:auto}\
.tb-pn{padding:10px 12px;display:flex;align-items:center;gap:12px}.tb-pn .tx{flex:1;min-width:0}.tb-cog{flex:none;width:40px;height:40px}.tb-coin{width:18px;height:18px;flex:none}.tb-pn .r{display:flex;align-items:center}.tb-pn .cr{margin-left:auto;font:800 20px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-sand);display:inline-flex;align-items:center;gap:6px}\
.tb-pn .sm{font-size:12px;color:var(--pv-ui-text-2);margin-top:6px}\
.tb-buy{justify-content:center;padding:0 20px;min-height:68px;width:100%}\
.tb-buy.pv-btn--primary{min-height:68px;font-size:20px;letter-spacing:.18em}\
.tb-spacer{flex:1;min-height:0}\
.tb-visit{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;padding:8px 12px;background:linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-800));border:1.5px solid var(--pv-ui-ink);border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 2px 0 rgba(0,0,0,.55)}\
.tb-visit .vl{font:800 14px/1.2 var(--pv-ui-font-stencil);letter-spacing:.06em;text-transform:uppercase;color:var(--pv-ui-text)}.tb-visit .vl b{font-size:20px;color:var(--pv-ui-cyan);margin-left:4px}\
.tb-visit.none .vl b{color:var(--pv-ui-text-3)}\
.tb-visit .pips,.us-pips{display:inline-flex;gap:8px;flex:none}.tb-visit .pip,.us-pips .pip{width:18px;height:18px;border-radius:50%;border:2px solid var(--pv-ui-cyan);box-sizing:border-box}.tb-visit .pip.on,.us-pips .pip.on{background:var(--pv-ui-cyan);box-shadow:0 0 6px rgba(56,232,255,.6)}\
.tl .per{font:700 12px/1 var(--pv-ui-font-stencil);letter-spacing:.06em;color:var(--pv-ui-text-3);text-transform:uppercase}\
.tb-note{font-size:12px;color:var(--pv-ui-text-2);text-align:center;min-height:16px;margin:0}\
.tb-note.is-warn{color:var(--pv-ui-text-3)}';

/* ---- sheet CSS (us-*) ---- */
var SCSS = '\
.us-scrim{position:absolute;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;padding:8px 0 18px;background:rgba(5,7,9,.72);color:var(--pv-ui-text);font:400 14px/1.3 var(--pv-ui-font);box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;animation:us-fade .2s ease-out}\
.us-scrim *,.us-scrim *::before,.us-scrim *::after{box-sizing:border-box}\
.us-sheet{position:relative;width:calc(100% - 16px);max-width:520px;max-height:100%;display:flex;flex-direction:column;gap:8px;padding:0 8px 8px;background:linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-800));border:2.5px solid var(--pv-ui-ink);border-radius:10px;box-shadow:0 0 0 1.5px var(--pv-ui-metal-500),0 4px 14px rgba(0,0,0,.65);overflow:hidden;animation:us-rise .283s cubic-bezier(.2,.8,.2,1)}\
.us-scrim.rm,.us-scrim.rm .us-sheet{animation:none}\
@keyframes us-fade{from{opacity:0}to{opacity:1}}\
@keyframes us-rise{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}\
.us-hd{flex:none;height:56px;display:flex;align-items:center;gap:8px;padding-left:4px}\
.us-hd .l{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}\
.us-hd h2{margin:0;font:800 12px/1 var(--pv-ui-font-stencil);text-transform:uppercase;letter-spacing:.14em;color:var(--pv-ui-sand);white-space:nowrap}\
.us-chips{display:flex;gap:6px}\
.us-chip{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px 0 6px;border-radius:6px;background:var(--pv-ui-ink);border:1.5px solid var(--pv-ui-metal-500);font:800 12px/1 var(--pv-ui-font-stencil);font-variant-numeric:tabular-nums;letter-spacing:.04em;color:var(--pv-ui-text);white-space:nowrap}\
.us-chip.cr{color:#ffe27a}.us-chip.sc .pv-ico{color:var(--pv-ui-cyan)}.us-chip .pv-ico{width:15px;height:15px}\
.us-chip .pv-coin{width:15px;height:15px}\
.us-rolls{flex:none;display:flex;flex-direction:column;align-items:center;gap:5px;font:800 12px/1 var(--pv-ui-font-stencil);letter-spacing:.1em;text-transform:uppercase;color:var(--pv-ui-text-2)}\
.us-rolls .us-pips{gap:6px}.us-rolls .pip{width:16px;height:16px}\
.us-x{flex:none;position:relative;width:56px;height:56px;padding:0;border:0;background:none;color:var(--pv-ui-text);cursor:pointer;display:flex;align-items:center;justify-content:center}\
.us-x span{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:var(--pv-ui-metal-900);border:1.5px solid var(--pv-ui-metal-500)}\
.us-x .pv-ico{width:22px;height:22px}\
.us-list{flex:1 1 auto;min-height:76px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;display:flex;flex-direction:column;gap:6px;padding:2px}\
.us-list::-webkit-scrollbar{display:none}\
.us-list.fade{-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 18px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 18px),transparent)}\
.us-row{flex:none;height:64px;display:flex;align-items:center;gap:10px;padding:0 10px 0 8px;text-align:left;color:var(--pv-ui-text);cursor:pointer;background:linear-gradient(var(--pv-ui-metal-600),var(--pv-ui-metal-700));border:1.5px solid var(--pv-ui-ink);border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 2px 0 rgba(0,0,0,.55);font:inherit;transition:border-color .083s}\
.us-row .ti{width:40px;height:40px;flex:none;display:flex;align-items:center;justify-content:center;font-size:24px;background:var(--pv-ui-ink);border-radius:4px;color:var(--pv-ui-cyan);box-shadow:inset 0 0 0 1.5px var(--pv-ui-metal-500)}\
.us-row .mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}\
.us-row .nm{font:800 13px/1.05 var(--pv-ui-font-stencil);text-transform:uppercase;letter-spacing:.04em;white-space:normal}\
.us-row .pv-bar{height:8px}\
.us-row .rt{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px;min-width:56px}\
.us-row .lv{font:800 12px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-sand);white-space:nowrap}\
.us-row .fr{font:800 12px/1 var(--pv-ui-font-stencil);color:var(--pv-cost,#f4c21a);display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums}\
.us-row .fr .pv-coin{width:12px;height:12px}\
.us-row.sel{border-color:var(--pv-ui-cyan);box-shadow:inset 0 0 0 1px var(--pv-ui-cyan),0 0 8px rgba(56,232,255,.35)}\
.us-row .ck{display:none;width:20px;height:20px;flex:none;align-items:center;justify-content:center;border-radius:50%;background:var(--pv-ui-cyan);color:var(--pv-ui-cyan-ink)}\
.us-row .ck .pv-ico{width:14px;height:14px;stroke-width:3}\
.us-row.sel .ck{display:flex}\
.us-row.max{cursor:default;pointer-events:none;background:var(--pv-ui-metal-800)}\
.us-row.max .nm{color:var(--pv-ui-text-2)}.us-row.max .lv{color:var(--pv-ui-r5)}.us-row.max .ti,.us-row.max .pv-bar{opacity:.5}\
.us-sel{flex:none;min-height:48px;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:2px 6px}\
.us-sel .a{font:800 14px/1.1 var(--pv-ui-font-stencil);text-transform:uppercase;letter-spacing:.06em;color:var(--pv-ui-text);white-space:normal}\
.us-sel .b{font-size:12px;line-height:1.2;color:var(--pv-ui-text-2)}.us-sel .b b{color:var(--pv-ui-cyan)}.us-sel .b.warn{color:var(--pv-ui-amber)}\
.us-tiers{flex:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}\
.us-tier{height:88px;padding:7px 6px 8px;display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--pv-ui-text);cursor:pointer;background:linear-gradient(var(--pv-ui-metal-600),var(--pv-ui-metal-700));border:1.5px solid var(--pv-ui-ink);border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 2px 0 rgba(0,0,0,.55);font:inherit;transition:transform .117s,border-color .117s}\
.us-tier .tn{font:800 12px/1 var(--pv-ui-font-stencil);text-transform:uppercase;letter-spacing:.08em;color:var(--pv-ui-text-2)}\
.us-tier .pr{font:800 19px/1 var(--pv-ui-font-stencil);color:var(--pv-cost,#f4c21a);font-variant-numeric:tabular-nums;letter-spacing:.02em}\
.us-tier .ow{flex:1;display:flex;align-items:center;text-align:center;font-size:12px;line-height:1.15;color:var(--pv-ui-text)}\
.us-tier .ob{width:100%;height:8px;display:flex;gap:1px;background:var(--pv-ui-ink);border:1px solid var(--pv-ui-ink);border-radius:2px;overflow:hidden;flex:none}\
.us-tier .ob i{display:block;height:100%}\
.us-tier.sel{border-color:var(--pv-ui-cyan);box-shadow:inset 0 0 0 1px var(--pv-ui-cyan),0 0 8px rgba(56,232,255,.35);transform:scale(1.04)}\
.us-tier.sel .tn{color:var(--pv-ui-cyan)}\
.us-tier.no .ob{opacity:.6}.us-tier.no .pr{color:var(--pv-ui-amber);}.us-tier.no .tn,.us-tier.no .ow{color:var(--pv-ui-text-2)}\
.us-cat{flex:none;height:56px;display:flex;align-items:center;gap:10px;padding:0 10px;color:var(--pv-ui-text);cursor:pointer;text-align:left;background:linear-gradient(var(--pv-ui-metal-600),var(--pv-ui-metal-700));border:1.5px solid var(--pv-ui-ink);border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 2px 0 rgba(0,0,0,.55);font:inherit}\
.us-cat .tx{flex:1;min-width:0;font-size:12px;line-height:1.25;color:var(--pv-ui-text-2)}.us-cat .tx b{display:block;font:800 13px/1.15 var(--pv-ui-font-stencil);letter-spacing:.05em;text-transform:uppercase;color:var(--pv-ui-text)}\
.us-sw{flex:none;position:relative;width:48px;height:28px;border-radius:14px;background:var(--pv-ui-ink);border:1.5px solid var(--pv-ui-metal-500);transition:background .117s}\
.us-sw::after{content:"";position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;background:var(--pv-ui-metal-400);transition:transform .117s}\
.us-cat.on .us-sw{background:var(--pv-ui-cyan-lo);border-color:var(--pv-ui-cyan)}.us-cat.on .us-sw::after{transform:translateX(20px);background:var(--pv-ui-cyan-hi)}\
.us-cat.on{border-color:var(--pv-ui-cyan)}\
.us-cat.off{cursor:default}.us-cat.off .us-sw{opacity:.5}.us-cat.off .tx b{color:var(--pv-ui-text-2)}\
.us-go{flex:none;min-height:64px;width:100%;flex-direction:column;gap:3px;font-size:18px;letter-spacing:.12em;line-height:1.05;text-align:center}\
.us-scrim .us-go.is-disabled,.us-scrim .us-go[disabled]{color:var(--pv-ui-text-2);background:var(--pv-ui-metal-800)}\
.us-go small{font:600 12px/1.1 var(--pv-ui-font);letter-spacing:0;text-transform:none}\
.us-go .lbl{display:inline-flex;align-items:center;gap:8px}\
.us-sheet.tight .us-tier{height:78px}.us-sheet.tight .us-go{min-height:56px}.us-sheet.tight .us-rv{gap:4px;padding-top:6px}.us-sheet.tight .us-rv .us-card-in{gap:4px!important}.us-sheet.tight .us-ringw{width:84px;height:84px}.us-sheet.tight .us-ringw .core{width:56px;height:56px}.us-sheet.tight .us-ringw .core .pv-ico{width:32px;height:32px}.us-sheet.tight .us-word{font-size:28px}.us-sheet.tight .us-done{min-height:56px}.us-sheet.tight .us-spk i.rad{top:-48px;transform-origin:50% 48px}.us-sheet.tight{gap:6px}\
@keyframes us-shake{0%,100%{transform:none}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}\
.us-shake{animation:us-shake .2s linear}\
.us-rv{flex:1 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 6px 4px;cursor:pointer;text-align:center}\
.us-rv::-webkit-scrollbar{display:none}\
.us-rv .kic{font:800 12px/1 var(--pv-ui-font-stencil);letter-spacing:.16em;text-transform:uppercase;color:var(--pv-ui-text-2)}\
.us-ringw{position:relative;width:132px;height:132px;flex:none;display:flex;align-items:center;justify-content:center}\
.us-ringw svg.ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}\
.us-ringw .trk{fill:none;stroke:var(--pv-ui-metal-600);stroke-width:7}\
.us-ringw .arc{fill:none;stroke:var(--gc);stroke-width:7;stroke-linecap:round;stroke-dasharray:314;stroke-dashoffset:0;filter:drop-shadow(0 0 6px var(--gc))}\
.us-ringw .pulse{position:absolute;inset:6px;border-radius:50%;border:3px solid var(--gc);opacity:0}\
.us-ringw .core{position:relative;width:84px;height:84px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:radial-gradient(circle at 50% 35%,#0e4b57,var(--pv-ui-metal-900) 80%);border:2.5px solid var(--pv-ui-ink);box-shadow:inset 0 0 0 2px var(--gc);color:var(--gc)}\
.us-ringw .core .pv-ico{width:44px;height:44px}\
.us-pp{display:flex;gap:8px;height:16px}.us-pp i{width:14px;height:14px;border-radius:50%;border:2px solid var(--gc);display:block}.us-pp i.on{background:var(--gc);box-shadow:0 0 6px var(--gc)}\
.us-rv.cm .us-word{color:var(--pv-ui-text);text-shadow:none}\
.us-word{font:800 34px/1 var(--pv-ui-font-stencil);letter-spacing:.2em;padding-left:.2em;color:var(--gc);text-shadow:0 0 14px var(--gc)}\
.us-iname{font:800 14px/1.1 var(--pv-ui-font-stencil);letter-spacing:.08em;text-transform:uppercase;color:var(--pv-ui-text)}\
.us-plus{font:800 24px/1 var(--pv-ui-font-stencil);letter-spacing:.12em;color:var(--pv-ui-cyan);text-shadow:0 0 10px rgba(56,232,255,.5);font-variant-numeric:tabular-nums}\
.us-ba{display:flex;align-items:center;gap:8px;width:100%;max-width:400px}\
.us-ba .bx{flex:1;min-width:0;text-align:center;padding:8px 4px;background:var(--pv-ui-ink);border-radius:4px;border:1px solid var(--pv-ui-metal-600)}\
.us-ba .bx small{display:block;font:700 12px/1 var(--pv-ui-font-stencil);letter-spacing:.1em;color:var(--pv-ui-text-3);text-transform:uppercase;margin-bottom:5px;white-space:nowrap}\
.us-ba .bx span{font:800 18px/1 var(--pv-ui-font-stencil);white-space:nowrap;font-variant-numeric:tabular-nums}\
.us-ba .bx.af span{color:var(--pv-ui-cyan)}.us-ba>.pv-ico{color:var(--pv-ui-cyan);font-size:20px}\
.us-refund{font:800 13px/1.1 var(--pv-ui-font-stencil);letter-spacing:.06em;color:#ffe27a;display:inline-flex;align-items:center;gap:6px}\
.us-refund .pv-coin{width:14px;height:14px}\
.us-catline{font:800 12px/1.2 var(--pv-ui-font-stencil);letter-spacing:.05em;text-transform:uppercase;color:var(--pv-ui-cyan)}\
.us-tap{font-size:12px;color:var(--pv-ui-text-2);min-height:14px;opacity:0}\
.us-done{flex:none;min-height:64px;width:100%;font-size:20px;letter-spacing:.2em}\
.us-spk{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none}\
.us-spk i{position:absolute;left:-1px;top:-8px;width:3px;height:10px;border-radius:2px;background:var(--gc);opacity:0;transform-origin:50% 100%}\
.us-spk i.rad{width:2px;height:22px;top:-70px;transform-origin:50% 70px}\
@keyframes us-sweep{from{stroke-dashoffset:314}to{stroke-dashoffset:0}}\
@keyframes us-stamp{0%{opacity:0;transform:scale(1.7)}60%{opacity:1;transform:scale(.94)}100%{opacity:1;transform:none}}\
@keyframes us-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}\
@keyframes us-pul{0%{opacity:.8;transform:scale(.85)}100%{opacity:0;transform:scale(1.35)}}\
@keyframes us-spark{0%{opacity:0;transform:rotate(var(--a)) translateY(0)}20%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateY(-86px)}}\
@keyframes us-line{0%{opacity:0;transform:rotate(var(--a)) scaleY(.2)}30%{opacity:.9}100%{opacity:0;transform:rotate(var(--a)) scaleY(1.3)}}\
@keyframes us-pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.2);opacity:1}100%{transform:none;opacity:1}}\
@keyframes us-tapin{from{opacity:0}to{opacity:1}}\
.us-rv.an .us-card-in{animation:us-in .283s cubic-bezier(.2,.8,.2,1) .117s both}\
.us-rv.an .arc{animation:us-sweep .6s ease-out .1s both}\
.us-rv.an .us-word{animation:us-stamp .3s cubic-bezier(.2,.8,.2,1) .4s both}\
.us-rv.an .us-pp i.on{animation:us-pop .25s ease-out calc(.35s + var(--k) * .12s) both}\
.us-rv.an .pulse.p1{animation:us-pul .5s ease-out .4s both}.us-rv.an .pulse.p2{animation:us-pul .5s ease-out .7s both}\
.us-rv.an .us-spk i{animation:us-spark .5s ease-out calc(.4s + var(--d)) both}\
.us-rv.an .us-spk i.rad{animation:us-line .5s ease-out .4s both}\
.us-rv.an .us-tap{animation:us-tapin .3s ease-out 1s both}\
.us-rv:not(.an) .us-tap{opacity:1}\
@media (max-height:700px){.us-sheet .us-sel{min-height:44px}}';

function injectCss(){
  if (!document.getElementById('tb-up-css')) { var s = document.createElement('style'); s.id = 'tb-up-css'; s.textContent = CSS; document.head.appendChild(s); }
  if (!document.getElementById('us-css')) { var t = document.createElement('style'); t.id = 'us-css'; t.textContent = SCSS; document.head.appendChild(t); }
}

/* ---- Meta access, defensive: nothing here throws if meta.js lacks a step-8 name ---- */
var stub = null;
function M(){
  if (V.Meta) return V.Meta;
  if (!stub) stub = { state:{ credits:0, schematics:0, cond:{hp:0,atk:0,rate:0}, settings:{sound:true,haptics:true}, codex:{seen:{}}, runs:[], best:0 },
    cost:function(){ return {credits:100}; }, canBuy:function(){ return false; }, buyRandom:function(){ return false; },
    stats:function(){ return {hpAdd:0, atkMul:1, rateMul:1}; }, onChange:function(){}, power:1 };
  return stub;
}
var DEF_TIERS = [{id:'basic', name:'Basic', mult:1.2, odds:[80,20,0]}, {id:'std', name:'Standard', mult:1.6, odds:[48,44,8]}, {id:'prem', name:'Premium', mult:2.0, odds:[25,50,25]}];
function tiers(){ var t = M().TIERS; return (t && t.length) ? t : DEF_TIERS; }
function catCost(){ return M().CATALYST_COST || 100; }
function credits(){ var s = M().state; return (s && s.credits) | 0; }
function schem(){ var s = M().state; return (s && s.schematics) | 0; }
function visitMax(){ var m = M(); return (m.TUNING && m.TUNING.VISIT_MAX) || 2; }
function buysLeft(){ var m = M(); return m.visitLeft ? m.visitLeft() : visitMax(); }
function fmt(n){ return Math.round(n).toLocaleString('en-US'); }
function pct(m){ return '+' + Math.round((m - 1) * 100) + '%'; }
function effectOf(id, st){
  st = st || {};
  if (id === 'hp') return '+' + fmt(st.hpAdd || 0) + ' HP';
  if (id === 'atk') return pct(st.atkMul || 1) + ' ATK';
  if (id === 'rate') return pct(st.rateMul || 1) + ' SPEED';
  return '';
}
function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function level(id){ var c = M().state && M().state.cond; return (c && c[id]) | 0; }
function capOf(s){ var m = M(); return (m.maxLevel && m.maxLevel('cond', s.id)) || s.cap; }
function nowMs(){ return (G.performance && performance.now) ? performance.now() : Date.now(); }
function reduced(){ var r = !!V.reducedMotion; try { if (!r && G.matchMedia) r = G.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {} return r; }
function snd(n){ try { if (V.Audio && V.Audio.play) V.Audio.play(n); } catch (e) {} }
function hap(ms){ try { if (typeof V.haptic === 'function') V.haptic(ms); } catch (e) {} }
function pipsHtml(n, max){ var h = ''; for (var i = 0; i < max; i++) h += '<span class="pip' + (i < n ? ' on' : '') + '"></span>'; return h; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }

function itemsList(){
  var m = M(), out = [];
  try { if (typeof m.items === 'function') out = m.items() || []; } catch (e) { out = []; }
  if (!out.length && typeof m.items !== 'function') {   // meta.js without step 8: show the three stats, capped or not, so the sheet still draws
    STATS.forEach(function(s){ var lv = level(s.id), cp = capOf(s); out.push({ kind:'cond', id:s.id, name:s.name, what:s.what, lvl:lv, max:cp, stepsLeft:Math.max(0, Math.ceil((cp - lv) / s.per)), capped:lv >= cp }); });
  }
  return out;
}
function quote(it, tierId, cat){
  var m = M(), q = null;
  try { if (typeof m.quote === 'function') q = m.quote(it.kind, it.id, tierId, { catalyst: !!cat }); } catch (e) { q = null; }
  if (!q) { var t = tiers().filter(function(x){ return x.id === tierId; })[0] || DEF_TIERS[0]; q = { price:0, odds:t.odds.slice(), stepsLeft:it.stepsLeft | 0, maxGain:Math.min(3, it.stepsLeft | 0), refundNote:false, catOk:false, why:it.capped ? 'max' : 'stub' }; }
  return q;
}
function dispName(it){ return NAMES[it.id] || it.name || it.id; }
function perOf(it){ var s = STATS.filter(function(x){ return x.id === it.id; })[0]; return s ? s.per : 1; }

/* odds words: the same words the chips show; numbers go in the aria-label only */
function oddsWord(o){
  var c = o[0], r = o[1], e = o[2];
  if (c >= 60) return 'Mostly Common';
  if (c <= 0 && e <= 0) return 'Rare for sure';
  var ep = e > 0 ? 'Epic\u00a01\u00a0in\u00a0' + Math.max(1, Math.floor(100 / e)) : '';
  if (c <= 0) return 'Rare, ' + ep;
  if (e <= 0) return 'Common or Rare';
  return ((e <= 10 ? 'Rare likely, ' : '') + ep);
}
function barHtml(o){
  var cols = ['var(--pv-ui-r1)', 'var(--pv-ui-r3)', 'var(--pv-ui-r4)'], h = '';
  for (var i = 0; i < 3; i++) if (o[i] > 0) h += '<i style="flex:' + o[i] + ' 1 0;background:' + cols[i] + '"></i>';
  return h;
}

/* ---- the sheet ---- */
var sh = null;   // {el, host, kind, id, tier, cat, phase:'pick'|'busy'|'reveal', armAt, hint, items, res, opener, raf}
var barHook = null, keyFn = null;
function hostEl(){ return document.getElementById('hmBody') || document.body; }

function firstChoice(items){
  var i; for (i = 0; i < items.length; i++) if (!items[i].capped && items[i].affordable !== false) return items[i];
  for (i = 0; i < items.length; i++) if (!items[i].capped) return items[i];
  return null;
}
function find(items, kind, id){ for (var i = 0; i < items.length; i++) if (items[i].kind === kind && items[i].id === id) return items[i]; return null; }
function selItem(){ return sh && find(sh.items, sh.kind, sh.id); }
function tierOk(it, tierId){ var q = quote(it, tierId, false); return !(q.why === 'max') && q.price <= credits(); }
function pickTier(it){
  if (!it) return 'basic';
  if (sh.tier && tierOk(it, sh.tier)) return sh.tier;
  return tierOk(it, 'std') ? 'std' : 'basic';
}

function catState(it, tierId){
  // returns {avail, why, text}
  var have = schem(), cost = catCost();
  if (!it || it.capped) return { avail:false, text:'Nothing to upgrade.' };
  if (have < cost) return { avail:false, text:'Need ' + cost + ' Schematics (have ' + have + '). Found in Supply Drops.' };
  var q = quote(it, tierId, true);
  if (q.why === 'cat-last-step' || (it.stepsLeft | 0) < 2) return { avail:false, text:'Needs 2 steps left. Only 1 left on this one.' };
  if (!q.catOk) return { avail:false, text:'Not available for this one.' };
  return { avail:true, text:'Rare or better. ' + cost + ' Schematics (have\u00a0' + have + ')' };
}

function paint(){
  if (!sh || !sh.el) return;
  var m = M(), items = sh.items = itemsList(), it = selItem();
  if (!it || it.capped) { it = firstChoice(items); sh.kind = it ? it.kind : null; sh.id = it ? it.id : null; }
  sh.tier = pickTier(it);
  var cs = catState(it, sh.tier);
  if (sh.cat && !cs.avail) sh.cat = false;
  var left = buysLeft(), cr = credits();
  var allMax = !items.length || items.every(function(x){ return x.capped; });
  var sheet = sh.el.querySelector('.us-sheet');
  var prevScroll = sheet.querySelector('.us-list') ? sheet.querySelector('.us-list').scrollTop : 0;
  var h = '<div class="us-hd"><div class="l"><h2 id="us-title">Pick one to upgrade</h2><div class="us-chips">' +
    '<span class="us-chip cr" aria-label="Credits ' + cr + '"><span class="pv-coin"></span><b>' + fmt(cr) + '</b></span>' +
    '<span class="us-chip sc" aria-label="Schematics ' + schem() + '">' + ico('schem') + '<b>' + fmt(schem()) + '</b></span></div></div>' +
    '<div class="us-rolls" role="status" aria-label="Rolls left ' + left + '"><span>Rolls ' + left + '</span><span class="us-pips" aria-hidden="true">' + pipsHtml(left, visitMax()) + '</span></div>' +
    '<button type="button" class="us-x" data-act="close" aria-label="Close"><span>' + ico('close') + '</span></button></div>';
  h += '<div class="us-list" role="listbox" aria-label="What to upgrade">';
  items.forEach(function(x){
    var on = !x.capped && x.kind === sh.kind && x.id === sh.id, bp = x.basicPrice;
    var cp = Math.max(1, x.max | 0), pc = Math.min(100, Math.round((x.lvl | 0) / cp * 100));
    h += '<button type="button" class="us-row' + (on ? ' sel' : '') + (x.capped ? ' max' : '') + '" role="option" aria-selected="' + on + '"' + (x.capped ? ' aria-disabled="true" tabindex="-1"' : '') + ' data-kind="' + x.kind + '" data-id="' + x.id + '">' +
      '<span class="ti">' + ico(ICON_OF[x.id] || 'cell') + '</span><span class="mid"><span class="nm">' + esc(dispName(x)) + '</span><span class="pv-bar"><span class="pv-bar__fill" style="--v:' + pc + '%;display:block"></span></span></span>' +
      '<span class="rt"><span class="lv">' + (x.capped ? 'MAX' : 'Lv ' + (x.lvl | 0) + ' / ' + cp) + '</span>' + (x.capped || bp == null ? '' : '<span class="fr"><span class="pv-coin"></span>' + fmt(bp) + '</span>') + '</span>' +
      '<span class="ck">' + ico('check') + '</span></button>';
  });
  h += '</div>';
  // selected-item line
  var sline = '', warn = '';
  if (allMax) sline = '<div class="a">Everything is maxed.</div><div class="b">Nothing left to upgrade.</div>';
  else if (it) {
    var q0 = quote(it, sh.tier, sh.cat), per = perOf(it), up = Math.min((it.lvl | 0) + (q0.maxGain | 0) * per, it.max | 0);
    sline = '<div class="a">' + esc(dispName(it)) + '&nbsp; Lv ' + (it.lvl | 0) + ' &rarr; ' + (q0.maxGain ? (sh.el.clientWidth < 400 ? '?' : 'up to ' + up) : '?') + '</div>' +
      '<div class="b' + (sh.hint ? ' warn' : '') + '">' + (sh.hint ? esc(sh.hint) : esc(it.what || '') + (q0.refundNote ? ' &middot; <b>Extra steps are paid back</b>' : '')) + '</div>';
  }
  h += '<div class="us-sel" id="us-selline" aria-live="polite">' + sline + '</div>';
  // tier chips
  h += '<div class="us-tiers" role="radiogroup" aria-label="How much to spend">';
  tiers().forEach(function(t){
    var q = it ? quote(it, t.id, sh.cat) : { price:0, odds:t.odds }, ok = it && !it.capped && q.price <= cr, on = t.id === sh.tier;
    var o = q.odds || t.odds, wd = oddsWord(o);
    h += '<button type="button" class="us-tier' + (on ? ' sel' : '') + (it && !it.capped && !ok ? ' no' : '') + '" role="radio" aria-checked="' + on + '" data-tier="' + t.id + '" aria-label="' + t.name + ', ' + (it && !it.capped ? q.price + ' credits, ' : '') + 'Common ' + o[0] + ' percent, Rare ' + o[1] + ', Epic ' + o[2] + '">' +
      '<span class="tn">' + t.name + '</span><span class="pr">' + (it && !it.capped ? fmt(q.price) : '-') + '</span><span class="ow">' + wd + '</span><span class="ob" aria-hidden="true">' + barHtml(o) + '</span></button>';
  });
  h += '</div>';
  // catalyst
  h += '<button type="button" class="us-cat' + (sh.cat ? ' on' : '') + (cs.avail ? '' : ' off') + '" role="switch" aria-checked="' + !!sh.cat + '"' + (cs.avail ? '' : ' aria-disabled="true"') + ' data-act="cat">' +
    '<span class="tx"><b>Catalyst</b>' + esc(cs.text) + '</span><span class="us-sw" aria-hidden="true"></span></button>';
  // confirm
  var cq = it && !it.capped ? quote(it, sh.tier, sh.cat) : null, why = '', lbl = '', sub = '';
  if (allMax) { why = 'max'; lbl = 'Everything is maxed'; }
  else if (!cq) { why = 'x'; lbl = 'Pick something to upgrade'; }
  else if (left <= 0 || cq.why === 'visit') { why = 'visit'; lbl = 'No rolls left'; sub = 'Deploy to earn more.'; }
  else if (cq.price > cr) { why = 'credits'; lbl = 'Need ' + fmt(cq.price - cr) + ' more CR'; sub = 'Play a run to earn more.'; }
  else if (cq.why) { why = cq.why; lbl = 'Not available now'; }
  var can = !why;
  h += '<button type="button" class="pv-btn us-go ' + (can ? 'pv-btn--primary' : 'is-disabled') + '" data-act="go"' + (can ? '' : ' disabled') + '>' +
    (can ? '<span class="lbl">Upgrade for ' + fmt(cq.price) + ' CR</span>' : '<span class="lbl">' + lbl + '</span>' + (sub ? '<small>' + sub + '</small>' : '')) + '</button>';
  sheet.innerHTML = h;
  sheet.setAttribute('aria-labelledby', 'us-title');
  var list = sheet.querySelector('.us-list'); if (list) list.scrollTop = prevScroll;
  sh.can = can;
  fadeList();
  var vh = sh.el.clientHeight; sheet.classList.toggle('tight', vh > 0 && vh < 540);
}

function onSheetClick(e){
  if (!sh || sh.phase === 'busy') return;
  var t = e.target;
  if (sh.phase === 'reveal') { if (t.closest('[data-act="done"]') || t.closest('.us-rv')) revealClose(); else if (t === sh.el) revealClose(); return; }
  var x = t.closest('[data-act="close"]'); if (x) { closeSheet(); return; }
  if (t === sh.el) { closeSheet(); return; }
  var row = t.closest('.us-row');
  if (row) {
    if (row.classList.contains('max')) return;
    sh.kind = row.getAttribute('data-kind'); sh.id = row.getAttribute('data-id'); sh.hint = ''; snd('tick'); paint(); focusSel(); return;
  }
  var tr = t.closest('.us-tier');
  if (tr) {
    var tid = tr.getAttribute('data-tier'), it = selItem();
    if (it && !it.capped && !tierOk(it, tid)) {
      var q = quote(it, tid, sh.cat), nm = (tiers().filter(function(z){ return z.id === tid; })[0] || {}).name || '';
      sh.hint = 'Need ' + fmt(Math.max(0, q.price - credits())) + ' more CR for ' + nm; snd('deny'); paint(); shake('[data-tier="' + tid + '"]'); return;
    }
    sh.tier = tid; sh.hint = ''; snd('tick'); paint(); var nt = sh.el.querySelector('[data-tier="' + tid + '"]'); if (nt) nt.focus(); return;
  }
  var ca = t.closest('[data-act="cat"]');
  if (ca) {
    var cs = catState(selItem(), sh.tier);
    if (!cs.avail) { sh.hint = cs.text; snd('deny'); paint(); shake('[data-act="cat"]'); return; }
    sh.cat = !sh.cat; sh.hint = ''; snd('latch'); paint(); var c2 = sh.el.querySelector('[data-act="cat"]'); if (c2) c2.focus(); return;
  }
  var go = t.closest('[data-act="go"]');
  if (go) confirm();
}
function shake(sel){ var n = sh && sh.el.querySelector(sel); if (!n || reduced()) return; n.classList.remove('us-shake'); void n.offsetWidth; n.classList.add('us-shake'); }
function fadeList(){ var l = sh && sh.el.querySelector('.us-list'); if (l) l.classList.toggle('fade', l.scrollHeight > l.clientHeight + l.scrollTop + 4); }
function scrollSel(){ var l = sh && sh.el.querySelector('.us-list'), n = l && l.querySelector('.us-row.sel'); if (!n) return; var t = n.offsetTop - l.offsetTop; if (t < l.scrollTop) l.scrollTop = t; else if (t + n.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = t + n.offsetHeight - l.clientHeight + 2; fadeList(); }
function focusSel(){ var n = sh && sh.el.querySelector('.us-row.sel'); if (n) { try { n.focus({ preventScroll:true }); } catch (e) { n.focus(); } } }

function confirm(){
  if (!sh || sh.phase !== 'pick') return;
  if (nowMs() < sh.armAt) return;                       // 350 ms arm guard after open
  var it = selItem(); if (!it || !sh.can) { snd('deny'); return; }
  sh.phase = 'busy';
  var r = false;
  try { r = M().roll ? M().roll(it.kind, it.id, sh.tier, { catalyst: !!sh.cat }) : false; } catch (e) { r = false; }
  if (!r || !r.ok) { sh.phase = 'pick'; sh.hint = 'That did not go through.'; snd('deny'); paint(); return; }
  snd('spend'); hap(20);
  showReveal(it, r);
}

/* ---- reveal ---- */
var GRADE = {
  common:{ word:'COMMON', col:'var(--pv-ui-r1)', pips:1, snd:'levelup', hap:20, sparks:0, rad:0, pulses:0 },
  rare:  { word:'RARE',   col:'var(--pv-ui-r3)', pips:2, snd:'rare',    hap:40, sparks:8, rad:0, pulses:0 },
  epic:  { word:'EPIC',   col:'var(--pv-ui-r4)', pips:3, snd:'epic',    hap:60, sparks:14, rad:8, pulses:2 }
};
function gradeId(g){ var v = (g && typeof g === 'object') ? g.id : g; return GRADE[v] ? v : 'common'; }
function firstNum(s){ var mm = /[-+]?\d[\d,]*(\.\d+)?/.exec(s); return mm ? { v:parseFloat(mm[0].replace(/,/g, '')), i:mm.index, len:mm[0].length, txt:mm[0] } : null; }
function lerpText(a, b, t){
  var na = firstNum(a), nb = firstNum(b); if (!na || !nb) return b;
  var v = na.v + (nb.v - na.v) * t, dec = (nb.txt.split('.')[1] || '').length;
  var s = dec ? v.toFixed(dec) : fmt(Math.round(v));
  if (/^\+/.test(nb.txt) && v >= 0) s = '+' + s;
  return b.slice(0, nb.i) + s + b.slice(nb.i + nb.len);
}
function showReveal(it, r){
  var gid = gradeId(r.grade), g = GRADE[gid], rm = reduced();
  var isCond = it.kind === 'cond', eb = isCond ? effectOf(it.id, r.before) : it.what || '', ea = isCond ? effectOf(it.id, r.after) : it.what || '';
  var gained = Math.max(0, r.gained | 0), lb = r.lvlBefore | 0, la = r.lvlAfter | 0;
  sh.phase = 'reveal'; sh.res = r; sh.item = it; sh.armAt = nowMs() + 350; sh.revAt = nowMs();
  var sheet = sh.el.querySelector('.us-sheet');
  var sp = '', i, a;
  for (i = 0; i < g.sparks; i++) { a = Math.round(360 / g.sparks * i + 8); sp += '<i style="--a:' + a + 'deg;--d:' + ((i % 4) * 0.1).toFixed(1) + 's"></i>'; }
  for (i = 0; i < g.rad; i++) sp += '<i class="rad" style="--a:' + (i * 45) + 'deg"></i>';
  var pp = ''; for (i = 0; i < 3; i++) pp += '<i class="' + (i < g.pips ? 'on' : '') + '" style="--k:' + i + '"></i>';
  var hasEff = !!(isCond && eb && ea);
  var h = '<div class="us-rv' + (rm ? '' : ' an') + (gid === 'common' ? ' cm' : '') + '" style="--gc:' + g.col + '" data-act="done-card" role="group" aria-label="Upgrade result">' +
    '<div class="us-card-in" style="display:flex;flex-direction:column;align-items:center;gap:8px;width:100%">' +
    '<div class="kic">Upgrade complete</div>' +
    '<div class="us-ringw"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="50"/><circle class="arc" cx="60" cy="60" r="50"/></svg>' +
    (g.pulses ? '<span class="pulse p1"></span><span class="pulse p2"></span>' : '') + '<span class="core">' + ico(ICON_OF[it.id] || 'cell') + '</span><span class="us-spk" aria-hidden="true">' + sp + '</span></div>' +
    '<div class="us-pp" aria-hidden="true">' + pp + '</div>' +
    '<div class="us-word">' + g.word + '</div>' +
    '<div class="us-iname">' + esc(dispName(it)) + '</div>' +
    '<div class="us-plus" id="us-plus">+' + gained + ' LEVEL' + (gained === 1 ? '' : 'S') + '</div>' +
    '<div class="us-ba"><div class="bx"><small>Before &middot; Lv ' + lb + '</small><span>' + esc(hasEff ? eb : 'Lv ' + lb) + '</span></div>' + ico('arrow') +
    '<div class="bx af"><small>After &middot; Lv ' + la + '</small><span id="us-after">' + esc(hasEff ? (rm ? ea : eb) : 'Lv ' + (rm ? la : lb)) + '</span></div></div>' +
    (r.catNotNeeded ? '<div class="us-catline">Catalyst not needed</div>' : (r.catalyst ? '<div class="us-catline">Catalyst: Common &rarr; Rare, ' + catCost() + ' Schematics</div>' : '')) +
    (r.refund > 0 ? '<div class="us-refund"><span class="pv-coin"></span>+' + fmt(r.refund) + ' Credits back</div>' : '') +
    '<div class="us-tap">Tap to close</div></div></div>' +
    '<button type="button" class="pv-btn pv-btn--primary us-done" data-act="done">Done</button>' +
    '<div class="us-live" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">' + g.word.charAt(0) + g.word.slice(1).toLowerCase() + '. ' + esc(dispName(it)) + ' plus ' + gained + ' level' + (gained === 1 ? '' : 's') + ', ' + lb + ' to ' + la + '.</div>';
  sheet.innerHTML = h;
  snd(g.snd); hap(g.hap);
  var btn = sheet.querySelector('.us-done'); if (btn) { try { btn.focus({ preventScroll:true }); } catch (e) { btn.focus(); } }
  if (!rm) countUp(it, eb, ea, hasEff, lb, la);
}
function countUp(it, eb, ea, hasEff, lb, la){
  var s = sh, t0 = nowMs(), node = s.el.querySelector('#us-after'), L0 = 400, D = 600;
  function step(){
    if (!sh || sh !== s || s.phase !== 'reveal' || !node.isConnected) return;
    var t = Math.max(0, Math.min(1, (nowMs() - t0 - L0) / D)), k = t * t * (3 - 2 * t);
    node.textContent = hasEff ? lerpText(eb, ea, k) : 'Lv ' + Math.round(lb + (la - lb) * k);
    if (t < 1) s.raf = G.requestAnimationFrame(step);
  }
  s.raf = G.requestAnimationFrame(step);
}
function revealClose(){
  if (!sh || sh.phase !== 'reveal') return;
  if (nowMs() < sh.armAt) return;                       // 350 ms arm guard on the reveal
  var left = sh.res ? sh.res.left : buysLeft();
  if (typeof left !== 'number') left = buysLeft();
  if (G.cancelAnimationFrame && sh.raf) G.cancelAnimationFrame(sh.raf);
  if (left <= 0) { closeSheet(); return; }
  sh.phase = 'pick'; sh.res = null; sh.hint = ''; sh.armAt = nowMs() + 350;
  sh.kind = sh.item.kind; sh.id = sh.item.id;           // item stays selected (paint() moves on if it is now maxed)
  snd('tick'); paint(); focusSel();
}

/* ---- open / close ---- */
function openSheet(kind, id){
  injectCss();
  if (sh) closeSheet(true);
  var host = hostEl(), scrim = el('div', 'us-scrim' + (reduced() ? ' rm' : ''));
  scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true'); scrim.setAttribute('aria-label', 'Upgrade');
  var sheet = el('div', 'us-sheet'); scrim.appendChild(sheet); host.appendChild(scrim);
  sh = { el:scrim, host:host, kind:null, id:null, tier:null, cat:false, phase:'pick', armAt:nowMs() + 350, hint:'', items:itemsList(), res:null, opener:document.activeElement, raf:0, can:false };
  var pre = (kind && id) ? find(sh.items, kind, id) : null; if (!pre || pre.capped) pre = firstChoice(sh.items);
  if (pre) { sh.kind = pre.kind; sh.id = pre.id; }
  paint();
  scrim.addEventListener('click', onSheetClick);
  snd('tick');
  scrollSel();
  scrim.addEventListener('scroll', fadeList, true);
  if (selItem()) focusSel(); else { var cb = scrim.querySelector('.us-x'); if (cb) cb.focus(); }
  if (!barHook) {
    barHook = function(e){ if (sh && e.target && e.target.closest && e.target.closest('.pv-tabbar')) closeSheet(true); };
    document.addEventListener('click', barHook, true);
  }
  if (!keyFn) {
    keyFn = function(e){
      if (!sh) return;
      if (e.key === 'Escape') { if (sh.phase === 'reveal') revealClose(); else if (sh.phase === 'pick') closeSheet(); e.preventDefault(); return; }
      if (e.key === 'Tab') {   // keep focus inside the sheet
        var f = [].slice.call(sh.el.querySelectorAll('button:not([disabled]):not([tabindex="-1"])'));
        if (!f.length) return; var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { f[f.length - 1].focus(); e.preventDefault(); }
        else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { f[0].focus(); e.preventDefault(); }
      }
    };
    document.addEventListener('keydown', keyFn);
  }
  return true;
}
function closeSheet(quiet){
  if (!sh) return;
  var s = sh; sh = null;
  if (G.cancelAnimationFrame && s.raf) G.cancelAnimationFrame(s.raf);
  if (s.el && s.el.parentNode) s.el.parentNode.removeChild(s.el);
  if (barHook) { document.removeEventListener('click', barHook, true); barHook = null; }
  if (keyFn) { document.removeEventListener('keydown', keyFn); keyFn = null; }
  if (quiet !== true) { try { if (s.opener && s.opener.focus && s.opener.isConnected) s.opener.focus(); } catch (e) {} }
  if (root && mounted) render();
}
V.UpSheet = {
  open: function(kind, id){ return openSheet(kind, id); },
  close: function(){ closeSheet(); },
  isOpen: function(){ return !!sh; }
};

/* ---- the tab ---- */
var T = V.Tabs = V.Tabs || {};
var root = null, body = null, mounted = false, unsub = false;

function boughtBuys(){ var m = M(); return m.boughtCount ? m.boughtCount('cond') : 0; }
function capBuys(){ var m = M(); return m.maxTotal ? m.maxTotal('cond') : 30; }
function render(){
  if (!root) return;
  var m = M(), stats = m.stats ? m.stats() : {};
  body.innerHTML = '';
  var rule = el('p', 'rule');
  rule.innerHTML = 'You pick the upgrade. What you spend sets the odds of a bigger gain.<span class="n">' + boughtBuys() + ' / ' + capBuys() + ' bought</span>';
  body.appendChild(rule);
  var left = buysLeft(), vmax = visitMax();
  var vis = el('div', 'tb-visit' + (left <= 0 ? ' none' : '')); vis.id = 'tb-visit'; vis.setAttribute('role', 'status');
  vis.innerHTML = '<span class="vl">Rolls left this visit:<b id="tb-left">' + left + '</b></span><span class="pips" aria-hidden="true">' + pipsHtml(left, vmax) + '</span>';
  body.appendChild(vis);
  var g = el('div', 'tb-grid3');
  STATS.forEach(function(s){
    var lv = level(s.id), cp = capOf(s), max = lv >= cp;
    var t = el('div', 'tl' + (max ? ' mx' : ''));
    t.id = 'tb-' + s.id;
    t.innerHTML = '<div class="tb-ti">' + ico(s.icon) + '</div><div class="tn">' + s.name + '</div>' +
      '<div class="tv">' + (max ? 'MAX' : 'Lv ' + lv + ' / ' + cp) + '</div><div class="fx">' + effectOf(s.id, stats) + '</div><div class="per">Up to +3 steps per roll</div>' +
      '<div class="pv-bar"><div class="pv-bar__fill" style="--v:' + Math.min(100, Math.round(lv / cp * 100)) + '%"></div></div>';
    g.appendChild(t);
  });
  body.appendChild(g);
  var items = itemsList(), all = items.length > 0 && items.every(function(x){ return x.capped; });
  var cheap = null; items.forEach(function(x){ if (!x.capped && x.basicPrice != null && (cheap == null || x.basicPrice < cheap)) cheap = x.basicPrice; });
  var pn = el('div', 'pv-panel tb-pn');
  pn.innerHTML = (V.TabsA ? V.TabsA.cog(40) : COG_OLD) + '<div class="tx"><div class="r"><span class="pv-stencil pv-muted">Cheapest upgrade</span>' + (all ? '<span class="cr">ALL MAXED</span>' : (cheap != null ? '<span class="cr">' + fmt(cheap) + ' CR</span>' : '')) + '</div>' +
    '<div class="sm">' + (all ? 'Everything is at its cap.' : 'Choose an item, then how much to spend. Rifle and gear are in the list too.') + '</div></div>';
  body.appendChild(pn);
  body.appendChild(el('div', 'tb-spacer'));
  var btn = el('button', 'pv-btn tb-buy ' + (all ? '' : 'pv-btn--primary'));
  btn.type = 'button'; btn.setAttribute('data-open', 'upgrade');
  btn.innerHTML = '<span class="lbl">' + (all ? 'Everything maxed' : 'Upgrade') + '</span>';
  if (all) { btn.className += ' is-disabled'; btn.disabled = true; }
  btn.addEventListener('click', function(){ openSheet(); });
  body.appendChild(btn);
  var short = (!all && cheap != null) ? Math.max(0, cheap - credits()) : 0;
  body.appendChild(el('div', 'tb-note' + (short > 0 || left <= 0 ? ' is-warn' : ''), left <= 0 ? 'Your rolls for this visit are used. They come back after your next run.' : (short > 0 ? 'Need ' + fmt(short) + ' more credits for the cheapest upgrade' : '&nbsp;')));
}

T.upgrades = {
  id: 'upgrades', title: 'Upgrades', icon: 'upgrades',
  mount: function(host){
    injectCss();
    root = el('div', 'tb-up');
    body = el('div', 'body');
    root.appendChild(body);
    host.innerHTML = ''; host.appendChild(root);
    mounted = true;
    if (!unsub && M().onChange) { M().onChange(function(){ if (mounted) { render(); if (sh && sh.phase === 'pick') paint(); } }); unsub = true; }
    render();
  },
  show: function(){ closeSheet(true); if (root) render(); },
  hide: function(){ closeSheet(true); }
};
})();
