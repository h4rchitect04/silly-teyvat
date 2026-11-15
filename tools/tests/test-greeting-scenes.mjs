import assert from 'node:assert/strict';
import {followGreeting,startCharacterAtHome} from '../../extension/genshin-dialogue-ui/character-location.js';
import {greetingIndex,normalizeScenes} from '../../extension/genshin-dialogue-ui/greeting-scenes.js';
import {writtenGreetings} from '../../extension/genshin-dialogue-ui/location-greetings.js';
import {cardUpdate} from '../../extension/genshin-dialogue-ui/card-profile.js';
import {setCharacterHome} from '../../extension/genshin-dialogue-ui/location-cast.js';
globalThis.location=new URL('http://localhost/');
const point=(id,residents=[])=>({id,label:id,path:'/background.webp',waypoint:{mapId:'teyvat',x:1,y:1},residents});
const klee={name:'Klee',avatar:'Klee.png',first_mes:'At HQ.',data:{first_mes:'At HQ.',alternate_greetings:['At the lake.','Also at HQ.'],extensions:{silly_teyvat:{greetings:[null,{location:'lake',scenario:'Fish blasting at Starfell Lake.'}]}}}};
const world=()=>({characters:[klee],characterId:0,groupId:null,groups:[],chat:[{mes:'At HQ.',swipe_id:0,swipes:['At HQ.','At the lake.','Also at HQ.']}],chatMetadata:{},
    extensionSettings:{genshin_dialogue_ui:{defaultCharacterLocations:{'Klee.png':'hq'},backgroundRegions:[{id:'mond',name:'Mondstadt',locations:[point('hq',['Klee.png']),point('lake'),point('winery')]}]}},saveSettingsDebounced(){},saveMetadataDebounced(){}});
const at=ctx=>ctx.chatMetadata.silly_teyvat_world.location.id;

let ctx=world();
assert.equal(greetingIndex(ctx),0);
assert.equal(startCharacterAtHome(ctx),true);
assert.equal(at(ctx),'hq','a greeting with no waypoint starts at home');
assert.equal(ctx.chatMetadata.scenario,undefined);
console.log('PASS an unlinked greeting starts at home with the card scenario');

ctx.chat[0].swipe_id=1;ctx.chat[0].mes='At the lake.';
assert.equal(followGreeting(ctx),true);
assert.equal(at(ctx),'lake');
assert.equal(ctx.chatMetadata.scenario,'Fish blasting at Starfell Lake.');
assert.equal(ctx.chatMetadata.silly_teyvat_cast.placements['Klee.png'],'lake');
assert.equal(ctx.chatMetadata.silly_teyvat_cast.opening.locationId,'lake');
console.log('PASS swiping to a linked greeting moves the opening scene there with its scenario');

ctx.chat[0].swipe_id=2;
assert.equal(followGreeting(ctx),true);
assert.equal(at(ctx),'hq');
assert.equal(ctx.chatMetadata.scenario,undefined,'our scenario override is cleared again');
console.log('PASS swiping back to an unlinked greeting returns home and clears the scenario');

ctx.chatMetadata.scenario='My own scenario.';ctx.chat[0].swipe_id=1;followGreeting(ctx);
assert.equal(ctx.chatMetadata.scenario,'My own scenario.','a scenario the player wrote is kept');
console.log('PASS a player-written scenario override is never replaced');

ctx=world();ctx.chat[0].swipe_id=1;startCharacterAtHome(ctx);
ctx.chatMetadata.silly_teyvat_cast.opening.active=false;ctx.chat[0].swipe_id=0;
followGreeting(ctx);
assert.equal(at(ctx),'lake','after the party has moved on, a swipe does not move it');
console.log('PASS a new chat on a linked greeting starts there, and a swipe after travelling stays put');

ctx=world();ctx.chat[0].swipe_id=5;
assert.equal(greetingIndex(ctx),-1);
assert.equal(followGreeting(ctx),false);
console.log('PASS a generated swipe past the greetings belongs to no greeting');

assert.deepEqual(writtenGreetings(klee,'lake','hq'),['At the lake.']);
assert.deepEqual(writtenGreetings(klee,'hq','hq'),['At HQ.','Also at HQ.']);
assert.deepEqual(writtenGreetings(klee,'winery','hq'),[]);
console.log('PASS meeting alone uses the greetings written for that place');

const update=cardUpdate(klee,{greetings:[{text:'A',location:'',scenario:''},{text:'B',location:'lake',scenario:' S '},{text:'C',location:'',scenario:''}]});
assert.equal(update.data.first_mes,'A');
assert.deepEqual(update.data.alternate_greetings,['B','C']);
assert.deepEqual(update.data.extensions.silly_teyvat.greetings,[null,{location:'lake',scenario:'S'}]);
assert.throws(()=>cardUpdate(klee,{greetings:[{text:' '}]}),/first greeting/);
assert.deepEqual(normalizeScenes([{location:'x'}],3),[{location:'x'}]);
console.log('PASS saving greetings writes the first message, alternates and their scenes in order');

ctx=world();setCharacterHome(ctx,'Klee.png','winery');
const regions=ctx.extensionSettings.genshin_dialogue_ui.backgroundRegions[0].locations;
assert.deepEqual(regions.find(l=>l.id==='winery').residents,['Klee.png']);
assert.deepEqual(regions.find(l=>l.id==='hq').residents,[]);
assert.equal(ctx.extensionSettings.genshin_dialogue_ui.defaultCharacterLocations['Klee.png'],'winery');
startCharacterAtHome(ctx);assert.equal(at(ctx),'winery');
console.log('PASS setting a home from Profile moves the resident and the default start');
