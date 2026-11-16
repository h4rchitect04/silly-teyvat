// Deleting the extension gives SillyTavern back as it was: the player's own look instead of the game's
// theme, and the game's lorebooks no longer active in every chat. A look the player chose later is kept.
import assert from 'node:assert/strict';
import {restoreSillyTavern,usingGameTheme} from '../../extension/genshin-dialogue-ui/share-package.js';
import fs from 'node:fs';

const KEY='genshin_dialogue_ui',calls=[];
const themes=[{name:'Dark Lite',blur_tint_color:'rgba(23, 23, 23, 1)',custom_css:'',main_text_color:'white'}];
const fetcher=async(url,options)=>{calls.push([url,JSON.parse(options.body || '{}')]);return {ok:true,json:async()=>({themes})};};
const world=()=>{const selected=['My Lore','Genshin Impact Lorebook','Paimon - Companion Notes'];return {selected_world_info:selected,world_info:{globalSelect:selected}};};
const context=(power,prefs)=>({powerUserSettings:power,extensionSettings:{[KEY]:prefs},getRequestHeaders:()=>({})});

// The look recorded at install comes back exactly, including a value that was unset before.
let power={theme:'Teyvat Slate',custom_css:'/* game */',blur_tint_color:'rgba(24, 30, 45, 0.97)',shadow_width:1,font_scale:1.1};
let prefs={nativeLook:{theme:'My Theme',values:{custom_css:'/* mine */',blur_tint_color:'red',shadow_width:null}},activatedLorebooks:['Genshin Impact Lorebook']};
let info=world(),ctx=context(power,prefs);
assert.equal(usingGameTheme(ctx),true);
let done=await restoreSillyTavern(ctx,{fetcher,loadWorldInfo:async()=>info});
assert.deepEqual(power,{theme:'My Theme',custom_css:'/* mine */',blur_tint_color:'red',font_scale:1.1});
assert.deepEqual(done,{look:true,lorebooks:['Genshin Impact Lorebook']});
// Only the lorebook this install switched on is switched off; the list SillyTavern holds is changed in place.
assert.deepEqual(info.selected_world_info,['My Lore','Paimon - Companion Notes']);
assert.equal(info.world_info.globalSelect,info.selected_world_info);
assert.deepEqual(calls.at(-1),['/api/themes/delete',{name:'Teyvat Slate'}]);
assert.equal('nativeLook' in prefs||'activatedLorebooks' in prefs,false);

// An install from before looks were recorded falls back to SillyTavern's default theme and the published lorebooks.
power={theme:'Teyvat Slate',custom_css:'/* game */',blur_tint_color:'x'};prefs={};info=world();
const release={parts:{'lorebooks/Genshin Impact Lorebook':{},'lorebooks/Paimon - Companion Notes':{},theme:{}}};
done=await restoreSillyTavern(context(power,prefs),{fetcher,loadWorldInfo:async()=>info,release});
assert.equal(power.theme,'Dark Lite');assert.equal(power.custom_css,'');assert.equal(power.blur_tint_color,'rgba(23, 23, 23, 1)');
assert.deepEqual(info.selected_world_info,['My Lore']);

// No default theme on the server either: the game's styling still comes off.
power={theme:'Teyvat Slate',custom_css:'/* game */'};themes.length=0;
await restoreSillyTavern(context(power,{}),{fetcher,loadWorldInfo:async()=>world()});
assert.deepEqual(power,{theme:'',custom_css:''});

// A player who has since chosen another theme keeps it, and no theme file is deleted.
power={theme:'Cappuccino',custom_css:'/* theirs */'};prefs={nativeLook:{theme:'Old',values:{custom_css:'old'}}};calls.length=0;
done=await restoreSillyTavern(context(power,prefs),{fetcher,loadWorldInfo:async()=>world()});
assert.deepEqual(power,{theme:'Cappuccino',custom_css:'/* theirs */'});assert.equal(done.look,false);assert.equal(calls.length,0);

// SillyTavern's Delete runs this through the manifest, and index.js exports the function it names.
const root=new URL('../../extension/genshin-dialogue-ui/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
assert.equal(manifest.hooks.delete,'uninstall');
assert.match(fs.readFileSync(new URL('index.js',root),'utf8'),/export async function uninstall\(\)/);
console.log('uninstall restore: ok');
