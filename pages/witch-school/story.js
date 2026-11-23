const STORY = {
  ver: 1,
  title: "The missing bell",
  order: ["open", "c1", "found", "c2", "c3", "s2", "end"],
  names: { sable: "Sable", ione: "Ione", pet: "Pebble" },
  scenes: [
    {
      id: "open", slot: "open", when: {},
      text: [
        "Morning on the Drift, and something is wrong.",
        "Your school is an old barge, tied to the marsh with knot-cords. Every dawn its bell rings from the bow. Today the bow is empty, and the Hush is creeping in, a fog that eats sound.",
        "Pebble, your tagalong kettle crab, clicks and hides under your hat."
      ]
    },
    {
      id: "c1", slot: "c1", when: {}, choiceKey: "c1",
      text: [
        "Without the bell, nobody will wake up in time. You need a friend with sharp eyes, fast. Who do you run to?"
      ],
      choices: [
        { id: "sable", label: "Run to Sable", chip: "Sable will remember this.", echo: "ran to Sable", friend: "sable" },
        { id: "ione", label: "Run to Ione", chip: "Ione will remember this.", echo: "ran to Ione", friend: "ione" }
      ]
    },
    {
      id: "found", slot: "found", when: {},
      text: [
        "{friend} pulls on a coat and follows you down the plank. Together you tiptoe through the wet reeds. The fog swallows your footsteps, so it feels like walking in a dream.",
        "Then you spot it. The bell lies in the mud, shining dully, with {pet} already poking it with one claw."
      ]
    },
    {
      id: "c2", slot: "c2", when: {}, choiceKey: "c2",
      text: [
        "The bell is heavy and cold. The Hush creeps closer. Should you ring it out loud, or wrap it in your knot-cord and sneak it home?"
      ],
      choices: [
        { id: "ring", label: "Ring it loud", chip: "The Drift will remember this.", echo: "rang it loud" },
        { id: "wrap", label: "Wrap it in your cord", chip: "Your cord will remember this.", echo: "wrapped it in your cord" }
      ]
    },
    {
      id: "c3", slot: "c3", when: {}, choiceKey: "c3",
      text: [
        "{pet} grabs the bell's rope in both claws and tugs, pulling hard toward the barge. Does it know the way? Do you trust it?"
      ],
      choices: [
        { id: "carry", label: "Let Pebble carry it", chip: "Pebble will remember this.", echo: "let Pebble carry it" },
        { id: "hold", label: "Hold Pebble back", chip: "Pebble will remember this.", echo: "held Pebble back" }
      ]
    },
    {
      id: "s2-sable", slot: "s2", when: { c1: "sable" },
      text: [
        "You {c2}.",
        "You {c3}.",
        "Up on the lookout deck, Sable waves a lantern high. \"This way! I can see the barge from up here!\" The tall mast creaks, the fog swirls below, and the lantern light makes a bright little path."
      ]
    },
    {
      id: "s2-ione", slot: "s2", when: {},
      text: [
        "You {c2}.",
        "You {c3}.",
        "Over on the garden barge, Ione is waiting among the cabbages and glowing mushrooms. \"Quick, through here!\" she whispers. Her lantern-moths flutter ahead, the damp leaves smell like soup, and one cabbage seems to be snoring."
      ]
    }
  ],
  endings: [
    {
      id: "CLEAR", when: { c2: "ring", c3: "carry" },
      title: "The Drift wakes up",
      text: [
        "Pebble marches onto the deck with the bell, and the ring rolls out across the marsh. The Hush shivers, shrinks, and slinks away like a cat that heard a vacuum cleaner.",
        "Every window opens. Everyone cheers, and Pebble takes a very small bow."
      ],
      because: "you rang the bell loud and let Pebble carry it."
    },
    {
      id: "TANGLE", when: { c2: "ring", c3: "hold" },
      title: "A very tangled morning",
      text: [
        "The bell clangs, but you are holding Pebble, so Pebble holds the rope, and the rope holds your boots. Everyone tumbles into one big knot.",
        "The Hush flees, laughing at you. The whole Drift wakes up to find you three in a heap, and nobody minds one bit."
      ],
      because: "you rang the bell loud and held Pebble back."
    },
    {
      id: "QUIET", when: { c2: "wrap", c3: "carry" },
      title: "The quiet little rescue",
      text: [
        "Pebble carries the cord-wrapped bell home, step by careful step. The Hush never even notices you pass, though it does sniff the air, puzzled.",
        "At the barge, you unwrap the bell and hang it up. It rings softly, like a happy hum, and the fog drifts off all on its own."
      ],
      because: "you wrapped the bell in your cord and let Pebble carry it."
    },
    {
      id: "ALONE", when: {},
      title: "You and the bell",
      text: [
        "You carry the wrapped bell yourself, puffing and slow. Pebble trails behind, sulking, with its claws crossed.",
        "At last the bell hangs in its place and the Hush wanders away. Later, a shiny button on your pillow says sorry. Pebble is not cross for long."
      ],
      because: "you wrapped the bell in your cord and held Pebble back."
    }
  ],
  steep: {
    prompt: "Hold the pot until the tea turns gold, then let go.",
    lines: {
      CLEAN: "Your tea comes out golden and smooth, and it warms you right down to your toes.",
      WOBBLY: "Your tea comes out a bit wobbly, but it still tastes sweet.",
      TANGLED: "Your tea comes out in tangles, but it makes everyone giggle."
    }
  }
};
if (typeof module !== 'undefined') module.exports = STORY;
