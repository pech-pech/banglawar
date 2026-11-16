// Z2: CourseSpin (owner T2). Old commands.js courseSpin(). ctx: clone, TRAIN_RNG, WM_RNG (commands.js helpers).
import { FLAGS } from '../../data/flags.js';
import { coachList, canCourse, courseWheel, spinResult } from '../../core/training.js';
import { metaWheel, recordSpin, afterResult } from '../../core/wheelmeta.js';

export function courseSpin(s, p, ctx) {
  const { clone, TRAIN_RNG, WM_RNG } = ctx;
  const id = p && p.coachId, T = s.training;
  if (!id || !canCourse(s, id).ok || (T.coursePending && T.coursePending.coachId === id)) return s;
  const c = coachList(s).find((x) => x.id === id);
  const wheel = metaWheel(courseWheel(c.step), 'course', s) /* flag off: the plain wheel (Dev otherMult adds phys) */, careful = p.careful && typeof p.careful === 'object' ? p.careful : !!p.careful;
  let n = clone(s), result = spinResult(TRAIN_RNG(s, 'course', id), wheel, careful);
  if (FLAGS.wheelMeta) { // Second Opinion etc.; the course counts 1 spin
    const a = afterResult(n, 'course', result, WM_RNG(s, 'course', id), { wheel }); n = clone(a.s); result = a.result;
    n = clone(recordSpin(n, 'course', { count: 1 }));
  }
  n.training.coursePending = { coachId: id, careful, wheel, result };
  return n;
}
