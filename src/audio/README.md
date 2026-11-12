# Tabletop sound effects

The clips in `tabletop.mp3` are mixed from these [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) recordings:

| Source | Used for |
| --- | --- |
| [Dice Rolling on Table, Flem0527](https://freesound.org/people/Flem0527/sounds/629982/) | First dice roll |
| [dice roll_wooden table_2.wav, ekfink](https://freesound.org/people/ekfink/sounds/235489/) | Second dice roll |
| [Wood block clacking.wav, 200221-WeanBekker](https://freesound.org/people/200221-WeanBekker/sounds/543705/) | Lobby, placements, robber moves, awards, and the turn clock |
| [Casino Audio 1.1, Kenney](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips) | Third dice roll, chat and ready taps, and card handling |
| [Singular Coin Dropping.wav, Flem0527](https://freesound.org/people/Flem0527/sounds/630018/) | New trade offers |
| [Two falling coins – Short, Wastefield](https://freesound.org/people/Wastefield/sounds/692071/) | Completed trades |
| [metal_clang_01.wav, Department64](https://freesound.org/people/Department64/sounds/95269/) and [low gong bash, hiddenpersuader](https://freesound.org/people/hiddenpersuader/sounds/155460/) | Seven and required discard warnings |
| [Fractanimal Acoustic Drum Kit, Low Tom 1, johnnydekk](https://freesound.org/people/johnnydekk/sounds/581467/) | Warnings and Largest Army |
| [Ship Bell Two Chimes, Sojan](https://freesound.org/people/Sojan/sounds/353232/) and [bell ding 1.wav, 5ro4](https://freesound.org/people/5ro4/sounds/611113/) | Your turn and Longest Route, respectively |
| [Concert Harp, Versilian Community Sample Library](https://github.com/sgossner/VCSL/tree/master/Chordophones/Composite%20Chordophones/Concert%20Harp) | Match start and results |

The recordings were trimmed, filtered, level matched, and mixed. Some were layered or played slightly faster or slower. The app serves the pack locally and decodes it once for playback.

`tabletop.json` indexes each clip as `[offset, duration]` in seconds. When replacing a clip, update both files together and leave a short silent gap between clips. Dice rolls, roads, and settlements alternate between recordings in `../sound-player.js`.
