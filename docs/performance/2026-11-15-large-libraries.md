# Large card libraries, card art and uninstalling — 2026-11-15

A player with a fast computer (an i9, 128 GB of memory) and "a lot of cards already" reported that the
extension slowed SillyTavern to a crawl, that it took 15 minutes to reach the extension manager, and that
deleting it left a theme behind. The hardware was not the cause. The cost grew with the size of the
player's own card library, which no existing check measured: the preview mocks a few dozen cards.

## Fixture

A throwaway SillyTavern 1.19.0 (`--dataRoot`, another port) with the game data installed and 12,000
copies of SillyTavern's default card added to the 279 game cards. `cp -c` (an APFS clone) copies a live
profile and makes the extra cards without using disk space:

```sh
cp -cR "<SillyTavern>/data/default-user" /tmp/teyvat-library/default-user   # leave out secrets.json and backups
cd /tmp/teyvat-library/default-user/characters
for i in $(seq 1 12000); do cp -c default_Seraphina.png "Bulk Card $i.png"; done
node server.js --dataRoot /tmp/teyvat-library --port 8003 --listen false --browserLaunchEnabled false
SILLY_TEYVAT_LIVE=/tmp/teyvat-library/default-user/extensions/genshin-dialogue-ui tools/sync-live.sh
node tools/tests/bench-library.mjs --url http://127.0.0.1:8003
```

Headless Chrome on the development Mac, no CPU slowdown unless stated.

## What was found

1. **Every roster searched the whole library once per card.** `locationResidents` filtered every card and
   asked `isGuildStaff` about each; that called `findKatheryne`, which ran a regular expression over every
   card. 12,279 cards meant 150 million tests per roster, and a roster is read whenever the scene's
   signature changes. Opening Klee's chat took **11.1 s**, 9.8 s of it one unbroken task, with 17.8 s of
   script in the extension. At 3,279 cards with the CPU slowed six times it was 16 s. The cost
   is quadratic, so a library twice the size takes four times as long.
2. **More than sixty other places searched the library for one avatar**, several of them on every refresh
   (`characterProperties`, `linkedCard`, `abyssAvatar` once per waypoint in the world prompt).
3. **Card art fetched every listed card whole.** To learn whether an avatar is card-shaped, the character
   list's thumbnails were swapped for the full PNG, for every card on the page whoever made it, on every
   page load (the answer was kept only in memory). With 500 cards a page that was 502 requests,
   **332 MB** transferred and about 400 MB of decoded images at start, before the list was opened.
4. **Deleting the extension restored nothing.** The delete hook ran `dispose`, which only removes the
   interface. The game data's first import had replaced the player's theme values in SillyTavern's
   settings without recording them, and switched the game's lorebooks on for every chat.

The transparent menu backgrounds in the report could not be reproduced on SillyTavern 1.19.0: with the
extension folder removed and Teyvat Slate still selected, every panel kept an opaque background. The
player had also run a clean-up of their own before describing it, so what produced that state is unknown.

## What changed

- `card-index.js` keeps one lookup of the library by avatar and by name, rebuilt when SillyTavern refills
  its array. `findKatheryne` is remembered with it, and a roster starts from the avatars that live at the
  place, not from the library.
- Card art asks about a card's shape only for cards scrolled into view, two at a time, and remembers the
  answers in the browser (`gi-card-shapes` in local storage). Only the game's own cards are swapped for the
  whole image at once, and those load lazily, so a closed drawer fetches nothing.
- `uninstall()` is the delete hook: it restores the recorded look (or SillyTavern's default theme for an
  install that predates the record), removes the Teyvat Slate theme file and switches off the lorebooks
  the import switched on. Settings → Share has the same action.
- Imports compare existing file names without regard to case, so a player's `klee.png` is not replaced by
  the game's `Klee.png` on Windows or macOS. This is a precaution: the report mentioned five cards whose
  created date changed, and no path was found that rewrites an existing card.
- Settings → Display → Graphics quality (`graphics.js`, `performance.css`).

## After

| 12,279 cards | Before | After |
| --- | --- | --- |
| Open a chat: time until the first message | 11.1 s | 1.3 s |
| Open a chat: longest unbroken task | 9.8 s | 0.24 s |
| Open a chat: script time in the extension | 17.8 s | 1.2 s |
| Open the map | 0.36 s | 0.17 s |
| Send a message (prompt building) | 0.28 s | 0.12 s |
| Start-up: full-size card images fetched | 502 (332 MB) | 2 (15 MB) |
| Start-up: decoded image memory | 402 MB | 30 MB |

About 0.55 s of the remaining chat-open time is sprite trimming (`sprite-trim.js` reads each sprite's
pixels on the main thread); it does not depend on the library and was left alone.

Graphics quality was compared in Chrome with `--disable-gpu` and the CPU slowed six times, opening and
closing the Paimon menu over a chat: main-thread time fell from 7.0 s (High) to 6.6 s (Balanced) and 5.7 s
(Low). Painting and compositing happen off the main thread and are not in those numbers, so they understate
the difference on a device without a graphics card; no such device was available to measure.
