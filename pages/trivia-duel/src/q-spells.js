var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));
(function () {
  var LIST = [
    { id: 'sp01', topic: 'spells', tier: 'e', q: 'Which spell makes an object rise and float in the air?',
      a: ['Wingardium Leviosa', 'Locomotor Mortis', 'Reparo', 'Descendo'],
      fact: 'Wingardium Leviosa is the Levitation Charm that first-years practise in Charms class.', book: 1, ch: null, filmKnown: true },
    { id: 'sp02', topic: 'spells', tier: 'e', q: 'Which spell unlocks a locked door?',
      a: ['Alohomora', 'Colloportus', 'Reducto', 'Incendio'],
      fact: 'Alohomora is the Unlocking Charm. Hermione uses it on a locked door in the first book.', book: 1, ch: null, filmKnown: true },
    { id: 'sp03', topic: 'spells', tier: 'e', q: 'Which incantation conjures a Patronus to drive off Dementors?',
      a: ['Expecto Patronum', 'Expelliarmus', 'Riddikulus', 'Protego'],
      fact: 'Expecto Patronum calls up a silvery guardian. It needs one very happy memory to work.', book: 3, ch: null, filmKnown: true },
    { id: 'sp04', topic: 'spells', tier: 'm', q: 'Which spell did Hermione cast on the train to mend Harry\'s broken glasses?',
      a: ['Oculus Reparo', 'Wingardium Leviosa', 'Lumos', 'Finite Incantatem'],
      fact: 'Hermione mended Harry\'s taped-up glasses with Oculus Reparo on the Hogwarts Express.', book: 1, ch: null, filmKnown: false },
    { id: 'sp05', topic: 'spells', tier: 'm', q: 'Which spell did Hermione use to lock Neville\'s body stiff and rigid?',
      a: ['Petrificus Totalus', 'Impedimenta', 'Stupefy', 'Incarcerous'],
      fact: 'Petrificus Totalus is the Full Body-Bind Curse. Hermione used it on Neville when he blocked the way.', book: 1, ch: null, filmKnown: true },
    { id: 'sp06', topic: 'spells', tier: 'm', q: 'Which spell did Draco use at the duelling club to make a snake appear?',
      a: ['Serpensortia', 'Anguis Vipera', 'Reptilio', 'Draconifors'],
      fact: 'Serpensortia conjures a snake from the tip of the wand. Harry then spoke to it in Parseltongue.', book: 2, ch: null, filmKnown: true },
    { id: 'sp07', topic: 'spells', tier: 'm', q: 'Which spell forces a Boggart to turn into something funny?',
      a: ['Riddikulus', 'Obliviate', 'Impervius', 'Silencio'],
      fact: 'Riddikulus works when you imagine your fear looking comical and laugh at it.', book: 3, ch: null, filmKnown: true },
    { id: 'sp08', topic: 'spells', tier: 'h', q: 'Which charm makes a wizard\'s voice louder so a whole stadium can hear?',
      a: ['Sonorus', 'Quietus', 'Silencio', 'Amplificus'],
      fact: 'Sonorus magnifies the voice. Quietus is the counter-charm that returns it to normal.', book: 4, ch: null, filmKnown: false },
    { id: 'sp09', topic: 'spells', tier: 'h', q: 'What is the name of the effect that makes a wand replay its most recent spells?',
      a: ['Priori Incantatem', 'Prior Reversus', 'Finite Incantatem', 'Reparifarge'],
      fact: 'Priori Incantatem shows echoes of a wand\'s last spells, most recent first.', book: 4, ch: null, filmKnown: false },
    { id: 'sp10', topic: 'spells', tier: 'h', q: 'Which Unforgivable Curse takes over the victim\'s will so they obey the caster?',
      a: ['Imperius Curse', 'Cruciatus Curse', 'Confundus Charm', 'Killing Curse'],
      fact: 'The Imperius Curse controls the target\'s actions. Moody demonstrated it on spiders in class.', book: 4, ch: null, filmKnown: false }
  ];
  TD.QUESTIONS = (TD.QUESTIONS || []).concat(LIST);
  if (typeof module !== 'undefined') module.exports = LIST;
})();
