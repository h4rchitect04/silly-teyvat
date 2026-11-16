// A player's card library can be far larger than the game's cast. Lookups must not scan it per card, the
// index must notice when SillyTavern refills the library, and Graphics quality must pick sensible levels.
import assert from 'node:assert/strict';
import {cardByAvatar,hasCard,cardPosition,cardsByName,cardByName,libraryMemo} from '../../extension/genshin-dialogue-ui/card-index.js';
import {findKatheryne,isGuildStaff} from '../../extension/genshin-dialogue-ui/guild.js';
import {locationResidents} from '../../extension/genshin-dialogue-ui/location-encounters.js';
import {recommendGraphics,graphicsLevel,effectsAllowed,applyGraphics,removeGraphics} from '../../extension/genshin-dialogue-ui/graphics.js';

const card=(name,avatar=`${name}.png`)=>({name,avatar,data:{}});
const library=n=>Array.from({length:n},(_,i)=>card(`Bulk ${i}`));
const characters=[...library(20000),card('Klee'),card('Katheryne'),card('Amber'),...library(10).map((c,i)=>card(`Tail ${i}`))];
const ctx={characters,chatMetadata:{},extensionSettings:{genshin_dialogue_ui:{backgroundRegions:[{id:'mondstadt',name:'Mondstadt',locations:[
    {id:'guild',label:'Adventurers’ Guild',residents:['Amber.png','Missing.png']},{id:'lake',label:'Starfell Lake',residents:['Klee.png']}]}]}}};

assert.equal(cardByAvatar(ctx,'Klee.png'),characters[20000]);
assert.equal(cardByAvatar(ctx,'Nobody.png'),undefined);
assert.equal(hasCard(ctx,'Amber.png'),true);
assert.equal(cardPosition(ctx,'Klee.png'),20000);
assert.equal(cardPosition(ctx,'Nobody.png'),-1);
assert.equal(cardByName(ctx,'Katheryne').avatar,'Katheryne.png');
assert.equal(findKatheryne(ctx),characters[20001]);
assert.equal(isGuildStaff(ctx,'Katheryne.png'),true);
assert.equal(isGuildStaff(ctx,'Klee.png'),false);

// Residents come back in library order, Katheryne stands at the Guild, and a home naming a missing card is ignored.
assert.deepEqual(locationResidents(ctx,'guild').map(c=>c.name),['Katheryne','Amber']);
assert.deepEqual(locationResidents(ctx,'lake').map(c=>c.name),['Klee']);

// The whole library is not searched again for each card: 200 rosters over 20,000 cards stay well under a second
// (the scan this replaces took minutes at this size).
const started=performance.now();
for(let i=0;i<200;i++){locationResidents(ctx,'guild');for(const c of characters.slice(0,500))isGuildStaff(ctx,c.avatar);}
assert.ok(performance.now()-started<1500,`rosters took ${Math.round(performance.now()-started)} ms`);

// SillyTavern refills the same array with new card objects: every answer follows.
let scans=0;
const count=()=>libraryMemo(ctx,'count',list=>{scans++;return list.length;});
count();count();assert.equal(scans,1);
characters.splice(0,characters.length,card('Katheryne','kath2.png'),card('Klee'),card('Klee','klee-2.png'));
assert.equal(findKatheryne(ctx).avatar,'kath2.png');
assert.equal(cardByAvatar(ctx,'Amber.png'),undefined);
assert.deepEqual(cardsByName(ctx,'Klee').map(c=>c.avatar),['Klee.png','klee-2.png']);
assert.equal(count(),3);assert.equal(scans,2);
// One card replaced in the middle, with the ends untouched: a hit is checked before it is trusted.
characters.splice(1,1,card('Diluc'));
assert.equal(cardByAvatar(ctx,'Klee.png'),undefined);
assert.equal(cardByAvatar(ctx,'Diluc.png').name,'Diluc');
assert.equal(cardByAvatar({characters:undefined},'Klee.png'),undefined);

// Graphics quality.
assert.equal(recommendGraphics({cores:16,memory:8,renderer:'ANGLE (NVIDIA GeForce RTX 3080)'}).level,'high');
assert.equal(recommendGraphics({cores:16,memory:8,renderer:'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))'}).level,'low');
assert.equal(recommendGraphics({cores:16,memory:8,renderer:'llvmpipe (LLVM 15.0.7, 256 bits)'}).level,'low');
assert.equal(recommendGraphics({cores:2,memory:8,renderer:'Intel HD Graphics 4000'}).level,'low');
assert.equal(recommendGraphics({cores:8,memory:2,renderer:'Mali-G52'}).level,'low');
assert.equal(recommendGraphics({cores:4,memory:8,renderer:'Intel UHD Graphics 620'}).level,'balanced');
assert.equal(recommendGraphics({cores:8,memory:8,renderer:'Apple GPU',coarse:true}).level,'balanced');
assert.equal(recommendGraphics({cores:12,memory:8,renderer:'Apple M2',reducedMotion:true}).level,'balanced');
// Browsers that report nothing are treated as capable rather than slowed down by guesswork.
assert.equal(recommendGraphics({}).level,'high');
for(const item of [{cores:1,renderer:'x'},{cores:4,renderer:'x'},{memory:4,renderer:'x'},{}])assert.ok(recommendGraphics(item).reason.length>10);
assert.equal(graphicsLevel({graphics:'low'}),'low');
assert.equal(graphicsLevel({graphics:'nonsense'}),graphicsLevel({graphics:'auto'}));
assert.equal(effectsAllowed({graphics:'low'}),false);
assert.equal(effectsAllowed({graphics:'balanced'}),true);
const classes=new Set(),body={classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n))}};
globalThis.requestAnimationFrame ??= ()=>0;
assert.equal(applyGraphics({graphics:'low'},body),'low');assert.deepEqual([...classes].sort(),['gi-gfx-balanced','gi-gfx-low']);
assert.equal(applyGraphics({graphics:'balanced'},body),'balanced');assert.deepEqual([...classes],['gi-gfx-balanced']);
assert.equal(applyGraphics({graphics:'high'},body),'high');assert.equal(classes.size,0);
applyGraphics({graphics:'low'},body);removeGraphics(body);assert.equal(classes.size,0);
console.log('large library and graphics quality: ok');
