// Z2: registers every spin handler, keyed by its command name. commands.js imports this once and dispatches these types via spinHandler.
import { registerSpin } from '../spin-registry.js';
import { spotSpin } from './spot.js';
import { courseSpin } from './course.js';
import { hypeSpin } from './hype.js';
import { tossSpin } from './toss.js';
import { pepSpin } from './pep.js';
import { scoutSpin } from './scout.js';
import { finalsSpin } from './finals.js';
import { findSpin } from './find.js';
import { wheelOver } from './match.js';
import { goldenStart, goldenTap, goldenCal } from './golden.js';

registerSpin('Spin', spotSpin); // T2
registerSpin('CourseSpin', courseSpin); // T2
registerSpin('HypeSpin', hypeSpin); // T3
registerSpin('TossSpin', tossSpin); // T3
registerSpin('PepSpin', pepSpin); // T3
registerSpin('ScoutSpin', scoutSpin); // T4
registerSpin('FinalsSpin', finalsSpin); // T4
registerSpin('PickActivity', findSpin); // T4: the Find reel part of PickActivity
registerSpin('WheelOver', wheelOver); // T1
registerSpin('GoldenStart', goldenStart);
registerSpin('GoldenTap', goldenTap);
registerSpin('GoldenCal', goldenCal);
