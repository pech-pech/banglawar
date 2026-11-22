"use strict";
const BUILD="st-ui2-1";
window.addEventListener("resize",()=>render());
loadData().then(()=>newPeriod(48213));
