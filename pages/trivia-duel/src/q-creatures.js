var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));
(function () {
  var LIST = [
    { id: 'cr01', topic: 'creatures', tier: 'e', q: 'What is the name of the huge three-headed dog guarding the trapdoor?',
      a: ['Fluffy', 'Fang', 'Norbert', 'Buckbeak'], fact: 'Fluffy belongs to Hagrid and guards the trapdoor to the hidden stone.', book: 1, ch: null, filmKnown: true },
    { id: 'cr02', topic: 'creatures', tier: 'e', q: 'Buckbeak is what kind of magical creature?',
      a: ['Hippogriff', 'Griffin', 'Thestral', 'Phoenix'], fact: 'A hippogriff has a horse body and the head and wings of a giant eagle.', book: 3, ch: null, filmKnown: true },
    { id: 'cr03', topic: 'creatures', tier: 'e', q: 'What kind of magical bird is Fawkes, Dumbledore\'s pet?',
      a: ['Phoenix', 'Owl', 'Eagle', 'Raven'], fact: 'Fawkes bursts into flame and is reborn, and his tears can heal wounds.', book: 2, ch: null, filmKnown: true },
    { id: 'cr04', topic: 'creatures', tier: 'm', q: 'Which breed of dragon was Hagrid\'s baby Norbert?',
      a: ['Norwegian Ridgeback', 'Hungarian Horntail', 'Chinese Fireball', 'Welsh Green'], fact: 'Hagrid won the egg in a card game and raised Norbert in his hut.', book: 1, ch: null, filmKnown: false },
    { id: 'cr05', topic: 'creatures', tier: 'm', q: 'Which kind of creature is Ron most afraid of?',
      a: ['Spiders', 'Snakes', 'Bats', 'Rats'], fact: 'Ron\'s fear of spiders makes the trip into the Forbidden Forest very hard for him.', book: 2, ch: null, filmKnown: true },
    { id: 'cr06', topic: 'creatures', tier: 'm', q: 'Which winged horse-like creatures can only be seen by people who have witnessed death?',
      a: ['Thestrals', 'Hippogriffs', 'Abraxan horses', 'Unicorns'], fact: 'Harry first sees thestrals pulling the carriages after he watches a death.', book: 5, ch: null, filmKnown: true },
    { id: 'cr07', topic: 'creatures', tier: 'm', q: 'Which centaur rescues Harry from the hooded figure in the Forbidden Forest?',
      a: ['Firenze', 'Bane', 'Ronan', 'Magorian'], fact: 'Firenze is a palomino centaur who lets Harry climb onto his back and carries him to safety.', book: 1, ch: null, filmKnown: true },
    { id: 'cr08', topic: 'creatures', tier: 'h', q: 'What breed of dog is Hagrid\'s pet Fang?',
      a: ['Boarhound', 'Bloodhound', 'Wolfhound', 'Great Dane'], fact: 'Fang is a huge black boarhound, but he is a coward who is all bark and no bite.', book: 1, ch: null, filmKnown: false },
    { id: 'cr09', topic: 'creatures', tier: 'h', q: 'What is the name of Hagrid\'s giant half-brother?',
      a: ['Grawp', 'Karkus', 'Golgomath', 'Hagger'], fact: 'Hagrid brings Grawp back from the mountains and hides him in the Forbidden Forest.', book: 5, ch: null, filmKnown: false },
    { id: 'cr10', topic: 'creatures', tier: 'h', q: 'What was the name of the female acromantula who was Aragog\'s mate?',
      a: ['Mosag', 'Morag', 'Mosina', 'Magda'], fact: 'Mosag is the mate of Aragog, the giant spider Hagrid raised from an egg.', book: 2, ch: null, filmKnown: false }
  ];
  TD.QUESTIONS = (TD.QUESTIONS || []).concat(LIST);
  if (typeof module !== 'undefined') module.exports = LIST;
})();
