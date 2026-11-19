# Moonstep polish contract (2026-11-19)
Repo /home/user/banglawar, game folder pages/gravity-moonstep/ (plain scripts, UMD, no libs, no network, seeded RNG only in engine/gen, 0 paid art).
Order in index.html: audio, engine, gen, fx, draw, game. Read docs/gravity-moonstep/CONTRACT.md only if you need engine API. Fold first: 344x882 and 475x638. Reduced motion = no shake/pulse/flash.
Slices (one owner per file, never edit another's file):
- A audio.js: richer MoonAudio. Keep API (init,setEnabled,charge,jump,land,chain,tideLevel,over). Add medal(name), near(), bounce(), crumble(), tick(). Layered tones, landing thump scaled by vn, chain pitch ladder, tide rumble. Never throw.
- B fx.js (NEW, global MoonFX, UMD, no DOM): MoonFX.make({reduced}) -> f. f.event(name,data) names: jump{x,y,charge01}, land{x,y,vn,body}, chain{x,y,n}, bounce{x,y}, crumble{x,y}, over{x,y,cause}. f.update(dt). f.shake()->{x,y} px offset (0 if reduced). f.pause()->seconds of hit-pause remaining (game freezes sim while >0, 0.04-0.09 s on hard land/chain). f.draw(ctx,view,w2s) draws world-space trail + particles (w2s(x,y)->[sx,sy]); f.trail(x,y) called each frame while airborne. Pooled arrays, no per-frame allocation. Self-test in tests/fx.js (node).
- C engine.js/gen.js/tests/bots.js (Opus): balance + variety. Medal bands: skilled bot Moon <=5%, Gold ~15-25%, human-like Bronze>=90% still. Options: tide cap 60->70-80, Moon at 2000 m. More variety: new kinds or generator patterns (clusters, long hops, rest bodies), keep reachability + determinism + replay hash. Update tests; report bot rows (200 seeds).
- D look mockups (docs/gravity-moonstep/look/<name>.html + .png at 344x882 dpr2): same fixed scene each (start body, 4 bodies incl spin/crumble/repel, runner mid-jump with dotted arc, tide band, HUD pill height+medal, thumb zone). Pure canvas/CSS, no assets.
Integration (lead): wire fx+audio into game.js, chosen look into draw.js.
Reply 5 lines + paths. No web, no extra skills.
