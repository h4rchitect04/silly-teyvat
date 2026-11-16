// SillyTavern crops avatars to 2:3 thumbnails, which slices Genshin card art (a
// front card over a tilted back card). For images shaped like a card these views show
// the full image so its own frame is the border and the back card adds depth, whoever made it.
// Other avatars get a frame the size of the card art's front card.
import {linkedCard} from './persona-link.js';
import {cardByAvatar,hasCard} from './card-index.js';
import {hasGenshinTag} from './character-properties.js';

const CARD_RATIO = 208 / 248;
// Genius Invokation TCG character cards (the enemy portraits) are shown whole as well.
const TCG_RATIO = 420 / 720;
const TARGETS = [
    '#right-nav-panel .character_select:not(.inline_avatar) .avatar img', // character list
    '#avatar_load_preview', // character editor
    '#right-nav-panel .hotswap .avatar img', // favorites above the character list
    '#right-nav-panel .group_member .avatar img', // group members / add members
    '#right-nav-panel .avatar_collage img', // group avatar collages
    '#right-nav-panel .group_select .avatar:not(.avatar_collage) img', // a group's own portrait in the character list
    '#group_avatar_preview .avatar img', // the group editor's portrait (a journey's stored card copy)
    '#chat .recentChat .avatar img', // Recent Chats on the welcome screen
    'body.gi-history #chat .mes .avatar img', // Dialogue Review
    'body.gi-classic #chat .mes .avatar img', // the classic chat, with Dialogue view off
    '#user_avatar_block .avatar img', // Persona Management
].join(',');
const full = file => `/characters/${encodeURIComponent(file)}`;
const personaFull = file => `/User Avatars/${encodeURIComponent(file)}`;
const verdicts = new Map(); // avatar file -> true (card art) | 'tcg' (TCG card) | false
// Shapes are remembered between visits: telling a card's shape takes its whole image, megabytes for some cards,
// and a library of thousands would otherwise be downloaded and decoded again on every page of the character list.
const SHAPES = 'gi-card-shapes', SHAPE_LIMIT = 40000, CODES = [false, true, 'tcg'];
try { for (const [file, code] of Object.entries(JSON.parse(globalThis.localStorage?.getItem(SHAPES) || '{}'))) if (code in CODES) verdicts.set(file, CODES[code]); } catch { /* unreadable or blocked storage: look again */ }
let saving = 0;
function remember(key, verdict) {
    if (verdict === undefined) verdicts.delete(key); else verdicts.set(key, verdict);
    if (saving) return;
    saving = setTimeout(() => {
        saving = 0;
        try { globalThis.localStorage?.setItem(SHAPES, JSON.stringify(Object.fromEntries([...verdicts].slice(-SHAPE_LIMIT).map(([file, v]) => [file, CODES.indexOf(v)])))); } catch { /* full or blocked storage */ }
    }, 2000);
}
// A card that is not part of the game keeps its thumbnail while its shape is found out in the background, two
// images at a time, and only once it has scrolled into view: a list page can hold hundreds of cards.
// Only the game's own cards are swapped for the whole image at once.
const PROBES = 2, waiting = new Map();
let probing = 0;
function probeLater(key, url) {
    if (waiting.has(key)) return;
    waiting.set(key, url); pumpProbes();
}
function pumpProbes() {
    while (probing < PROBES && waiting.size) {
        const [key, url] = waiting.entries().next().value, probe = new Image();
        waiting.delete(key); probing++;
        const done = verdict => {
            probing--; remember(key, verdict);
            if (verdict) for (const img of document.querySelectorAll('img[data-gi-file]')) if (img.dataset.giFile === key && img.isConnected) reapply?.(img);
            pumpProbes();
        };
        probe.onload = () => done(verdictOf(probe.naturalWidth / probe.naturalHeight)); probe.onerror = () => done(false);
        probe.decoding = 'async'; probe.src = url;
    }
}
let reapply = null; // set while Card art is mounted
const seen = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target; seen.unobserve(img);
        if (img.dataset.giFile && img.dataset.giUrl && !verdicts.has(img.dataset.giFile)) probeLater(img.dataset.giFile, img.dataset.giUrl);
    }
}, {rootMargin: '200px'});

function thumbFile(src, type = 'avatar') {
    try { const url = new URL(src, location.href); return url.pathname.endsWith('/thumbnail') && url.searchParams.get('type') === type ? url.searchParams.get('file') : null; }
    catch { return null; }
}
const verdictOf = ratio => Math.abs(ratio - CARD_RATIO) < .03 ? true : Math.abs(ratio - TCG_RATIO) < .03 ? 'tcg' : false;
export const cardShape = (width, height) => height > 0 ? verdictOf(width / height) : false;
function mark(img, kind) {
    const box = img.closest('.avatar');
    img.classList.toggle('gi-card-img', kind === 'art' || kind === 'tcg');img.classList.toggle('gi-card-img-tcg', kind === 'tcg');img.classList.toggle('gi-card-img-frame', kind === 'frame');
    if (!box) return;
    if (box.classList.contains('avatar_collage')) {
        const count = box.querySelectorAll('img').length;
        box.classList.toggle('gi-card-collage', Boolean(kind)); box.style.setProperty('--gi-cards', count);
        box.style.setProperty('--gi-card-w', `${(box.clientHeight || 90) * CARD_RATIO * (count > 2 ? .7 : .8)}px`); return;
    }
    box.classList.toggle('gi-card-art', kind === 'art' || kind === 'tcg'); box.classList.toggle('gi-card-frame', kind === 'frame');
}
function clear(img) { delete img.dataset.giThumb; delete img.dataset.giFile; delete img.dataset.giUrl; mark(img, null); }
// A solo journey's portrait is a cropped copy stored in the group, so it is drawn from the card it was taken from.
// The group editor's portrait has no row naming its group, so it is the group whose stored portrait it shows.
function journeyCard(img, ctx) {
    const row = img.closest('[data-group], .group_select'), id = row?.dataset.group ?? row?.dataset.grid ?? row?.getAttribute('grid');
    const src = img.getAttribute('src');
    const group = id ? ctx.groups?.find(g => String(g.id) === String(id)) : img.closest('#group_avatar_preview') ? ctx.groups?.find(g => g.avatar_url === src) : null;
    return group?.silly_teyvat_journey?.source?.avatar || null;
}
// What an avatar shows: a character card, or a persona's own image, which is often card art too.
function sourceOf(img, src, ctx) {
    const persona = thumbFile(src, 'persona');
    if (persona) return {key: `persona:${persona}`, url: personaFull(persona)};
    const file = thumbFile(src) || (src.startsWith('data:') ? journeyCard(img, ctx) : null);
    if (!file) return null;
    // A journey the player began as a persona without a character card names the persona ("persona:File.png"):
    // it shows that persona's own image whole, as Persona Management does.
    if (typeof file === 'string' && file.startsWith('persona:') && !hasCard(ctx, file)) return {key: file, url: personaFull(file.slice('persona:'.length))};
    return {key: file, url: hasCard(ctx, file) ? full(file) : ''};
}
// eager: one of the game's own menus, which draw a handful of cards and show each whole at once.
function apply(img, ctx, eager = false) {
    if (img.closest('.mes')) { applyMessage(img, ctx); return; }
    const src = img.getAttribute('src') || '', found = sourceOf(img, src, ctx);
    if (!found) { if (!(img.dataset.giUrl && src === img.dataset.giUrl)) clear(img); return; }
    // A new thumbnail (first render, or SillyTavern reusing this element for another card).
    const {key, url} = found;
    img.dataset.giThumb = src; img.dataset.giFile = key; img.dataset.giUrl = url;
    if (!url || verdicts.get(key) === false) { mark(img, 'frame'); return; }
    // Someone else's card of unknown shape: frame its thumbnail now and look at the image later.
    // A journey's stored portrait (a data: image) belongs to the game as well.
    if (!eager && !src.startsWith('data:') && !verdicts.has(key) && !key.startsWith('persona:') && !hasGenshinTag(ctx, cardByAvatar(ctx, key))) { mark(img, 'frame'); if (seen) seen.observe(img); else probeLater(key, url); return; }
    mark(img, verdicts.get(key) === 'tcg' ? 'tcg' : 'art');
    if (!verdicts.has(key)) {
        const check = () => {
            if (img.dataset.giFile !== key || img.getAttribute('src') !== url) return;
            const verdict = verdictOf(img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 0);
            remember(key, verdict); if (verdict === 'tcg') mark(img, 'tcg'); else if (!verdict) { img.src = img.dataset.giThumb; apply(img, ctx); } // shown as a frame
        };
        img.addEventListener('load', check, {once: true}); img.addEventListener('error', () => { remember(key, false); if (img.dataset.giFile === key) { img.src = img.dataset.giThumb; apply(img, ctx); } }, {once: true});
    }
    // Whole cards are large: leave the ones in a closed drawer or far down a list until they are looked at.
    img.loading = 'lazy'; img.src = url;
}
// Chat avatars keep their native src: SillyTavern's zoom reads it, and other extensions rewrite it.
// The card is painted behind the invisible thumbnail instead. Review also lines up the player's own
// messages, using their linked card or a frame around their persona.
function applyMessage(img, ctx) {
    const src = img.getAttribute('src') || '', box = img.closest('.avatar');
    const persona = thumbFile(src, 'persona'), file = persona ? linkedCard(ctx, persona)?.avatar : thumbFile(src);
    const card = cardByAvatar(ctx, file);
    const paint = verdict => {
        if (img.getAttribute('src') !== src) return;
        box.classList.toggle('gi-mes-card', Boolean(verdict)); box.classList.toggle('gi-mes-card-tcg', verdict === 'tcg');
        if (verdict) { box.style.setProperty('--gi-mes-card', `url("${full(file)}")`); mark(img, null); box.classList.add('gi-card-art'); }
        else mark(img, persona || file ? 'frame' : null);
    };
    if (!card) { paint(false); return; }
    if (verdicts.has(file)) { paint(verdicts.get(file)); return; }
    const probe = new Image();
    probe.onload = () => { remember(file, verdictOf(probe.naturalWidth / probe.naturalHeight)); paint(verdicts.get(file)); };
    probe.onerror = () => { remember(file, false); paint(false); };
    probe.src = full(file);
}
// A card as the character list shows it, for menus SillyTavern does not draw.
export function cardPortrait(ctx, card) {
    const box = document.createElement('span'), img = document.createElement('img');
    box.className = 'avatar'; img.alt = ''; img.loading = 'lazy';
    img.src = `/thumbnail?type=avatar&file=${encodeURIComponent(card.avatar)}`;
    box.append(img); apply(img, ctx, true); return box;
}

// One read of the setting answers true, so SillyTavern's next upload keeps the whole image.
function skipCropOnce(settings) {
    const saved = settings.never_resize_avatars;
    Object.defineProperty(settings, 'never_resize_avatars', {configurable: true, enumerable: true, get() {
        Object.defineProperty(settings, 'never_resize_avatars', {configurable: true, enumerable: true, writable: true, value: saved});
        return true;
    }});
}
async function isCardImage(file) {
    try { const image = await createImageBitmap(file), shape = cardShape(image.width, image.height); image.close(); return Boolean(shape); }
    catch { return false; }
}

export function mountCardArt({getContext, root = document, loadPowerUser = () => import('/scripts/power-user.js')}) {
    let frame = 0, passing = false, replaced = '';
    // SillyTavern's crop dialog cuts every upload to 2:3, which would stop a card image being a card.
    async function keepCardShape(event) {
        const input = event.target;
        if (passing || input.id !== 'add_avatar_button' || !input.files?.[0]) return;
        event.stopImmediatePropagation();
        replaced = root.querySelector('#avatar_url_pole')?.value || '';
        if (await isCardImage(input.files[0])) { try { skipCropOnce((await loadPowerUser()).power_user); } catch (error) { console.warn('[Silly Teyvat] Card upload', error); } }
        passing = true; input.dispatchEvent(new Event('change', {bubbles: true})); passing = false;
    }
    // A replaced image can change the card's shape, so look at it afresh.
    async function cardEdited(event) {
        const file = event?.detail?.character?.avatar;
        if (!file || file !== replaced) return;
        replaced = ''; remember(file, undefined);
        await fetch(full(file), {cache: 'reload'}).catch(() => {});
        for (const img of root.querySelectorAll('img[data-gi-file]')) if (img.dataset.giFile === file) img.src = img.dataset.giThumb;
        const preview = root.querySelector('#avatar_load_preview');
        if (preview?.getAttribute('src')?.startsWith('data:')) preview.src = `/thumbnail?type=avatar&file=${encodeURIComponent(file)}`;
        scan();
    }
    function scan() { frame = 0; const ctx = getContext(); for (const img of root.querySelectorAll(TARGETS)) apply(img, ctx); }
    reapply = img => apply(img, getContext());
    const queue = () => { if (!frame) frame = requestAnimationFrame(scan); };
    const observer = new MutationObserver(queue);
    const panel = root.querySelector('#right-nav-panel') || root.body;
    if (panel) observer.observe(panel, {childList: true, subtree: true, attributes: true, attributeFilter: ['src']});
    const personas = root.querySelector('#persona-management-block');
    if (personas && personas !== panel) observer.observe(personas, {childList: true, subtree: true, attributes: true, attributeFilter: ['src']});
    // The chat streams constantly; only react when the welcome screen's Recent Chats change, or, while every message
    // shows its avatar (Review, the classic chat), when elements arrive outside a message's text. A reply being
    // written changes only its text, timer and token count, and a scan reads every avatar in the page.
    const chat = root.querySelector('#chat');
    const element = node => node.nodeType === 1;
    const recent = new MutationObserver(list => {
        const everyMessage = document.body.classList.contains('gi-history') || document.body.classList.contains('gi-classic');
        if (list.some(m => everyMessage && !m.target.closest?.('.mes_text, .mes_reasoning') && [...m.addedNodes].some(element)
            || m.target.closest?.('.recentChatList') || [...m.addedNodes].some(n => element(n) && (n.matches('.recentChat, .recentChatList') || n.querySelector('.recentChat'))))) queue();
    });
    if (chat) recent.observe(chat, {childList: true, subtree: true});
    const {eventSource, eventTypes} = getContext();
    root.addEventListener('change', keepCardShape, true);
    eventSource?.on?.(eventTypes?.CHARACTER_EDITED, cardEdited);
    document.body.classList.add('gi-card-art-on'); scan();
    return {
        refresh: scan,
        dispose() {
            observer.disconnect(); recent.disconnect(); cancelAnimationFrame(frame); reapply = null; waiting.clear(); seen?.disconnect();
            root.removeEventListener('change', keepCardShape, true);
            eventSource?.removeListener?.(eventTypes?.CHARACTER_EDITED, cardEdited);
            for (const img of root.querySelectorAll(TARGETS)) { if (img.dataset.giThumb && img.dataset.giUrl && img.getAttribute('src') === img.dataset.giUrl) img.src = img.dataset.giThumb; clear(img); }
            document.body.classList.remove('gi-card-art-on');
        },
    };
}
