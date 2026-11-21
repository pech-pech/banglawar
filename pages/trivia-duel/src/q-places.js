var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));
(function () {
  var LIST = [
    { id: 'pl01', topic: 'places', tier: 'e', q: 'On which street do the Dursleys live in Little Whinging?',
      a: ['Privet Drive', 'Magnolia Crescent', 'Grimmauld Place', 'Acacia Road'],
      fact: 'Number four, Privet Drive is where Harry grows up with his aunt, uncle and cousin.', book: 1, ch: 1, filmKnown: true },
    { id: 'pl02', topic: 'places', tier: 'e', q: 'Which goblin-run institution stores wizard gold deep under London?',
      a: ['Gringotts', 'Borgin and Burkes', 'Eeylops', 'Gambol and Japes'],
      fact: 'Gringotts is the wizarding bank, reached from Diagon Alley and guarded by goblins.', book: 1, ch: 5, filmKnown: true },
    { id: 'pl03', topic: 'places', tier: 'e', q: 'Which platform at King’s Cross does the Hogwarts Express leave from?',
      a: ['Nine and three-quarters', 'Seven and a half', 'Ten and a quarter', 'Eleven'],
      fact: 'Students reach it by walking straight through the barrier between platforms nine and ten.', book: 1, ch: 6, filmKnown: true },
    { id: 'pl04', topic: 'places', tier: 'm', q: 'Where did Harry sleep at the Dursleys’ before his Hogwarts letters came?',
      a: ['A cupboard under the stairs', 'The attic', 'A garden shed', 'Dudley’s spare room'],
      fact: 'Harry’s tiny bedroom under the stairs was filled with spiders, and he stayed there for years.', book: 1, ch: null, filmKnown: true },
    { id: 'pl05', topic: 'places', tier: 'm', q: 'What is the name of the home of the Weasley family?',
      a: ['The Burrow', 'The Hollow', 'Hawthorn Lodge', 'Fox Court'],
      fact: 'The Burrow is a crooked, ramshackle house that has been added to by magic over the years.', book: 2, ch: null, filmKnown: true },
    { id: 'pl06', topic: 'places', tier: 'm', q: 'Where in the castle is the entrance to the Chamber of Secrets hidden?',
      a: ['A second-floor girls’ toilet', 'Dumbledore’s office', 'The Restricted Section', 'The Great Hall cellars'],
      fact: 'The entrance is concealed behind a sink in the bathroom haunted by Moaning Myrtle.', book: 2, ch: null, filmKnown: true },
    { id: 'pl07', topic: 'places', tier: 'm', q: 'Which all-wizard village do Hogwarts students visit from their third year?',
      a: ['Hogsmeade', 'Godric’s Hollow', 'Little Whinging', 'Diagon Alley'],
      fact: 'Hogsmeade has Honeydukes, Zonko’s and the Three Broomsticks, and lies near the school.', book: 3, ch: null, filmKnown: true },
    { id: 'pl08', topic: 'places', tier: 'h', q: 'In which Ministry office does Arthur Weasley work?',
      a: ['Misuse of Muggle Artefacts', 'Improper Use of Magic', 'Goblin Liaison Office', 'Auror Office'],
      fact: 'He deals with Muggle objects that have been enchanted, and he adores Muggle gadgets.', book: 2, ch: null, filmKnown: false },
    { id: 'pl09', topic: 'places', tier: 'h', q: 'Near which village in Devon does the Weasley family home stand?',
      a: ['Ottery St Catchpole', 'Little Whinging', 'Hogsmeade', 'Great Hangleton'],
      fact: 'The Weasleys live on the outskirts of Ottery St Catchpole in the south-west of England.', book: 2, ch: null, filmKnown: false },
    { id: 'pl10', topic: 'places', tier: 'h', q: 'Which run-down London department store hides the entrance to the wizarding hospital?',
      a: ['Purge and Dowse Ltd', 'Slug and Jiggers', 'Flourish and Blotts', 'Madam Malkin’s'],
      fact: 'Visitors lean on the window beside a dummy and step through into the hospital reception.', book: 5, ch: 22, filmKnown: false }
  ];
  TD.QUESTIONS = (TD.QUESTIONS || []).concat(LIST);
  if (typeof module !== 'undefined') module.exports = LIST;
})();
