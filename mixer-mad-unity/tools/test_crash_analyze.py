"""Self-check for crash_analyze.py (no pytest needed): python3 tools/test_crash_analyze.py

A scripted R-restart loop fires every ~60 frames. The camera window (60 steps after the cut) used to reach into the
NEXT restart's cut and report it as a 5 m glide after this one (2026-11-02, RestartMidAir t=140.187).
"""
import contextlib, io, os, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crash_analyze as ca  # noqa: E402

COLS = 'frame,t,scenario,simTime,simState,slowScale,slowMode,simX,simY,simAng,rootX,rootY,rootAng,bodyY,visScaleX,visScaleY,susp0,susp1,spin0,camX,camY,camZ,liveCam,blending,emotion,toast,finish,inGas,inBrake,note'


def write_run(folder, restart_frames, glide_at=None):
    """Truck drives +0.12 m/frame from x 5; each restart frame jumps it (and the camera, a clean cut) back to x 5."""
    rows, events, x = [], ['frame,t,scenario,event,detail,simX,simY,simAng'], 5.0
    for f in range(400):
        t = f / 60.0
        if f in restart_frames:
            events.append(f'{f},{t:.4f},Loop,restart,Loop,{x:.3f},1.2,0')
            events.append(f'{f},{t:.4f},Loop,teleported,,5.05,1.2,0')
            x = 5.0
        else:
            x += 0.12
        cam = x + (3.0 if glide_at is not None and f == glide_at else 0.0)
        rows.append(f'{f},{t:.4f},Loop,{t:.4f},drive,1,None,{x:.3f},1.2,0,{x:.3f},1.2,0,-0.8,1,1,-0.65,-0.65,0,{cam:.3f},2.9,-34,CM_Main,0,GasGrin,,0,1,0,')
    with open(folder + '/frames.csv', 'w') as fh: fh.write(COLS + '\n' + '\n'.join(rows) + '\n')
    with open(folder + '/events.csv', 'w') as fh: fh.write('\n'.join(events) + '\n')


def camera_fails(folder):
    frames, events = ca.load(folder)
    out = []
    for e in events:
        if e['event'] == 'restart':
            out.append(ca.analyse_teleport(frames, events, e['t'], 'restart', e['scenario'])['camera_ok'])
    return out


def test_fast_restart_loop_is_not_scored_against_its_own_next_cut():
    with tempfile.TemporaryDirectory() as d:
        write_run(d, {60, 118, 178})              # 58 and 60 frames apart: inside the 60-step camera window
        assert camera_fails(d) == [True, True, True], camera_fails(d)


def test_a_real_glide_after_the_cut_still_fails():
    with tempfile.TemporaryDirectory() as d:
        write_run(d, {60, 200}, glide_at=90)      # a 3 m camera jump half a second after the first cut
        assert camera_fails(d)[0] is False


if __name__ == '__main__':
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    for fn in tests:
        with contextlib.redirect_stdout(io.StringIO()): fn()
        print('ok', fn.__name__)
    print(len(tests), 'passed')
