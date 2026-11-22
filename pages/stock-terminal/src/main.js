"use strict";
const BUILD="st-slice-1";
window.addEventListener("resize",()=>render());
loadData().then(()=>newPeriod(48213));
