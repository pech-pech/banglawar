"""Analyse a -mmCrashRepro run: one block per crash and per scripted restart.

Usage: python3 crash_analyze.py <folder with frames.csv and events.csv> [--json out.json]
Checks (each prints PASS/FAIL with numbers):
  freeze      real seconds from Crash to Respawn (sim 0.7 s, stretched by slow-mo)
  slowmo      slow-mo scale back to 1.0 within 0.5 s after a respawn / restart
  upright     |angle| < 0.35 rad 0.5 s after the respawn, no Crash within 3 s (crash loop)
  camera      largest camera step in the 1 s after the teleport vs the snap frame (no blend/glide > 1.5 m/frame after the snap)
  rig         truck root equals the sim pose; Visual scale back to 1 +-0.03 by 0.6 s; body y stable; suspension steps < 0.08 m/frame
  driver      no CrashDaze 0.6 s after the respawn / restart
  hud         toast empty and finish card hidden 0.3 s after a restart
"""
import csv, json, math, sys
from collections import defaultdict

def load(folder):
    with open(folder + '/frames.csv') as f: frames = list(csv.DictReader(f))
    with open(folder + '/events.csv') as f: events = list(csv.DictReader(f))
    for r in frames:
        for k in ('t', 'simTime', 'slowScale', 'simX', 'simY', 'simAng', 'rootX', 'rootY', 'bodyY', 'visScaleX', 'visScaleY', 'susp0', 'susp1', 'camX', 'camY', 'camZ'):
            r[k] = float(r[k]) if r[k] not in ('', None) else math.nan
        r['frame'] = int(r['frame'])
    for e in events:
        e['t'] = float(e['t']); e['frame'] = int(e['frame'])
    return frames, events

def window(frames, t0, t1):
    return [r for r in frames if t0 <= r['t'] <= t1]

def cam_step(a, b):
    return math.dist((a['camX'], a['camY'], a['camZ']), (b['camX'], b['camY'], b['camZ']))

def analyse_teleport(frames, events, t_tp, label, scenario):
    out = {'label': label, 'scenario': scenario, 't': round(t_tp, 3)}
    after = window(frames, t_tp, t_tp + 3.0)
    if len(after) < 5:
        out['note'] = 'run ended'; return out
    # slow-mo
    late = [r for r in after if r['t'] >= t_tp + 0.5]
    out['slow_at_0.5s'] = late[0]['slowScale'] if late else math.nan
    out['slowmo_ok'] = bool(late) and late[0]['slowScale'] > 0.99
    # upright and crash loop
    r05 = late[0] if late else after[-1]
    out['angle_0.5s'] = round(r05['simAng'], 3)
    loops = [e for e in events if e['event'] == 'Crash' and t_tp < e['t'] <= t_tp + 3.0]
    out['crash_within_3s'] = len(loops)
    out['upright_ok'] = abs(r05['simAng']) < 0.35 and not loops
    # camera: the snap frame may jump; after it, per-frame steps must look like normal follow (< 1.5 m)
    steps = [cam_step(a, b) for a, b in zip(after, after[1:])]
    out['cam_snap_m'] = round(steps[0], 2) if steps else 0
    out['cam_max_after_snap_m'] = round(max(steps[1:61]) if len(steps) > 1 else 0, 2)
    glide = sum(1 for s in steps[1:61] if s > 0.6)
    out['cam_glide_frames'] = glide
    out['live_cams'] = sorted({r['liveCam'] for r in after[:60]})
    out['blending_frames'] = sum(1 for r in after[:60] if r['blending'] == '1')
    out['camera_ok'] = out['cam_max_after_snap_m'] < 1.5 and glide <= 3
    # rig
    root_err = max(abs(r['rootX'] - r['simX']) + abs(r['rootY'] - r['simY']) for r in after[:120])
    vis = [r for r in after if r['t'] >= t_tp + 0.6][:1]
    out['vis_scale_0.6s'] = (round(vis[0]['visScaleX'], 3), round(vis[0]['visScaleY'], 3)) if vis else None
    body = [r['bodyY'] for r in after[:180]]
    out['body_y_range'] = round(max(body) - min(body), 3)
    susp_steps = [max(abs(b['susp0'] - a['susp0']), abs(b['susp1'] - a['susp1'])) for a, b in zip(after[1:], after[2:120])]
    out['susp_max_step'] = round(max(susp_steps) if susp_steps else 0, 3)
    out['rig_ok'] = root_err < 0.25 and (not vis or abs(vis[0]['visScaleY'] - 1) < 0.03) and out['body_y_range'] < 0.02 and out['susp_max_step'] < 0.08
    out['root_err'] = round(root_err, 3)
    # driver
    d = [r for r in after if r['t'] >= t_tp + 0.6][:1]
    out['emotion_0.6s'] = d[0]['emotion'] if d else ''
    out['driver_ok'] = not d or d[0]['emotion'] != 'CrashDaze'
    # hud
    h = [r for r in after if r['t'] >= t_tp + 0.3][:1]
    out['toast_0.3s'] = h[0]['toast'] if h else ''
    out['finish_0.3s'] = h[0]['finish'] if h else '0'
    out['hud_ok'] = not h or (h[0]['finish'] == '0' and (label != 'restart' or h[0]['toast'] == ''))
    return out

def main():
    folder = sys.argv[1]
    frames, events = load(folder)
    blocks = []
    crash_t = None
    for e in events:
        if e['event'] == 'Crash': crash_t = e['t']
        if e['event'] == 'Respawn':
            b = analyse_teleport(frames, events, e['t'], 'respawn', e['scenario'])
            if crash_t is not None:
                b['freeze_real_s'] = round(e['t'] - crash_t, 3)
                fr = window(frames, crash_t, e['t'])
                b['freeze_min_slow'] = round(min(r['slowScale'] for r in fr), 2) if fr else None
            blocks.append(b); crash_t = None
        if e['event'] == 'restart' and e['detail'] != 'scenario start':
            # the scripted R press: what state was it pressed in?
            before = [r for r in frames if r['t'] <= e['t']][-1:] or [None]
            b = analyse_teleport(frames, events, e['t'], 'restart', e['scenario'])
            b['pressed_in'] = (before[0]['simState'] + '/' + before[0]['slowMode']) if before[0] else ''
            blocks.append(b); crash_t = None
    keys = ('slowmo_ok', 'upright_ok', 'camera_ok', 'rig_ok', 'driver_ok', 'hud_ok')
    fails = defaultdict(int)
    for b in blocks:
        bad = [k for k in keys if k in b and not b[k]]
        for k in bad: fails[k] += 1
        print(f"{b['scenario']:<18} {b['label']:<8} t={b['t']:>8} {'FAIL ' + ','.join(bad) if bad else 'ok'}")
        print('   ', {k: v for k, v in b.items() if k not in keys + ('scenario', 'label', 't')})
    print('\nSUMMARY', len(blocks), 'teleports;', dict(fails) if fails else 'all checks pass')
    if '--json' in sys.argv:
        with open(sys.argv[sys.argv.index('--json') + 1], 'w') as f: json.dump({'blocks': blocks, 'fails': fails}, f, indent=1)

if __name__ == '__main__':
    main()
