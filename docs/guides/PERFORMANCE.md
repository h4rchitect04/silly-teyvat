# Performance and hardware

Silly Teyvat draws a full scene over SillyTavern: backgrounds, sprites, a world map, battle animations and
music. This page says what it needs, which setting to choose for your device, and what to do if it is slow.

## What it needs

- **SillyTavern 1.19.0 or later** in a current Chrome, Edge, Firefox or Safari.
- **Hardware acceleration on in the browser.** Without it every blur, glow and animation is drawn on the
  processor. In Chrome and Edge: Settings → System → *Use graphics acceleration when available*. In Firefox:
  Settings → General → Performance. A remote desktop session usually has none.
- About **7 GB of free disk space** on the server computer for the game data.

## Graphics quality

**Settings → Display → Graphics quality** sets how much the browser is asked to draw. **Auto** is the default:
it reads what the browser reports about the device and names the level it chose, and why, under the setting.

| Level | Choose it for | What changes |
| --- | --- | --- |
| **High** | A desktop or laptop with a dedicated graphics card or Apple silicon, 6 or more processor cores, 8 GB of memory or more | Everything is drawn |
| **Balanced** | Laptops with integrated graphics, devices with 4 processor cores or 4 GB of memory, most phones and tablets | No frosted-glass blur behind panels; at most 60 frames a second |
| **Low** | Older or low-power devices (2 cores or 2 GB of memory), remote desktops, any browser with hardware acceleration off | Also no looping glows or pulses, no Burst splash art or battle particles, at most 30 frames a second |

Auto picks **Low** when the browser is drawing without a graphics card or reports 2 cores or 2 GB or less,
**Balanced** for 4 cores, 4 GB, a touch device or a system set to reduce motion, and **High** otherwise.
Browsers report memory only up to 8 GB and some report nothing, so if the game feels slow on Auto, choose a
lower level yourself. The setting belongs to the device: it is not copied by exports.

Other settings that lower the load:

- **Frame rate cap** (Display): 60 or lower saves power and heat on a high-refresh screen.
- **Card art in SillyTavern** (Display → Advanced): off leaves SillyTavern's character list as it is.
- **Scene CGs**, **Sprites & staging** and **Sounds** at the top of Settings switch whole features off.
- **Text speed** set to instant (Display → Text) skips the reveal animation.

SillyTavern's own **User Settings → Reduced Motion** and **No Blur Effect** help too, and apply to all of
SillyTavern.

## A large card library

The game ships 275 cards, and works alongside a library of any size. If SillyTavern itself is slow with
thousands of cards, its **character list page size** (the number beside the list) is the first thing to
lower: every card on the page is an element SillyTavern has to keep.

Versions up to 0.67a slowed down badly in a large library: opening a chat froze the page for about 10
seconds with 12,000 cards, and longer the more cards there were. That is fixed; see
[the record](../performance/2026-11-15-large-libraries.md). If you met it, update the extension.

## If it is too slow to use

1. Open **Extensions → Silly Teyvat** and turn the **Silly Teyvat** switch off. That unloads the game at
   once and leaves SillyTavern running as it does without it, with nothing to reload.
2. If the page is too slow to reach the switch, open SillyTavern's `settings.json` (in
   `data/default-user/`) with the server stopped, find `"genshin_dialogue_ui"` and add `"master": false`
   inside it, or move the folder `data/default-user/extensions/genshin-dialogue-ui` somewhere else, then
   start SillyTavern again.
3. Then try **Graphics quality → Low**, and tell us what device and browser you use.

## Removing Silly Teyvat

**Extensions → Manage extensions → Delete** removes the extension. As it goes, it gives SillyTavern back as
it was before the game data was installed:

- the theme you had before **Teyvat Slate** is restored, with its colours and custom CSS (SillyTavern's
  default theme if the game was installed before version 0.68a, which did not record yours), and the
  Teyvat Slate theme file is removed;
- the game's two lorebooks are no longer switched on for every chat.

**Settings → Share → Restore my SillyTavern theme** does the same without removing the extension.

Your files are left alone, because they may hold your own work: the character cards (tagged *Silly Teyvat*),
their sprites under `characters/`, uploaded files under `user/files/`, the Aether and Lumine personas and the
two lorebooks. Delete those in SillyTavern if you want the space back. If the extension folder was deleted
by hand instead, choose your own theme again under **User Settings → Themes** and switch the lorebooks off
under **World Info**.
