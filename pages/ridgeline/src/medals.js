// Medal thresholds and grading. Pure: cfg is passed in.
export const MEDALS = ['Summit', 'Gold', 'Silver', 'Bronze'];

export function medalTimes(course, cfg) {
  const gates = course.gatesInRange(-1, course.length + 1).length;
  const gold = course.length / cfg.medalPace + gates * cfg.medalGateSec;
  return {
    summit: gold * cfg.medalSummit,
    gold,
    silver: gold * cfg.medalSilver,
    bronze: gold * cfg.medalBronze,
  };
}

export function medalFor(t, times) {
  let name = null;
  if (t <= times.summit) name = 'Summit';
  else if (t <= times.gold) name = 'Gold';
  else if (t <= times.silver) name = 'Silver';
  else if (t <= times.bronze) name = 'Bronze';
  const order = ['summit', 'gold', 'silver', 'bronze'];
  const i = name ? MEDALS.indexOf(name) : order.length;
  if (i === 0) return { name, next: null, gap: null };
  const nk = order[i - 1];
  return { name, next: MEDALS[i - 1], gap: t - times[nk] };
}
