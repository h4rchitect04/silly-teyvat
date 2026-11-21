import {isNarrator} from './narrator.js';
import {activeGroup} from './party.js';

// Hide only our generated groups and the hidden Narrator card. Their chat files and native group records
// remain intact and can be continued from the Journeys list (Paimon menu, or Saved journeys on the map).
export function isJourneyGroup(group){
    return Boolean(group?.silly_teyvat_journey?.version===1 ||
        (/^Teyvat journey:/.test(group?.name || '')&&[group.chat_id,...(group.chats || [])].some(id=>String(id).startsWith('Silly-Teyvat-'))));
}
// Groups made before the single updating group per chat are leftovers.
export const isLegacyJourneyGroup=group=>isJourneyGroup(group)&&group.silly_teyvat_journey?.managed!==true;
// Delete journey groups made before the single updating group per chat. Returns the ids removed; the open group is left alone.
export async function purgeLegacyJourneys(ctx,fetchImpl=fetch){
    const removed=[];
    for(const group of [...(ctx.groups || [])].filter(isLegacyJourneyGroup)){
        if(ctx.groupId!=null&&String(group.id)===String(ctx.groupId))continue;
        const response=await fetchImpl('/api/groups/delete',{method:'POST',headers:ctx.getRequestHeaders(),body:JSON.stringify({id:group.id})});
        if(response.ok)removed.push(group.id);
    }
    return removed;
}
// ---- The Journeys list ------------------------------------------------------------------------------
const PREFIX=/^Teyvat journey:\s*/i;
// The name shown in the list: the group name without the "Teyvat journey:" it is created with.
export const journeyTitle=group=>String(group?.name || '').replace(PREFIX,'').trim() || 'Journey';
export const isSoloJourney=group=>String(group?.silly_teyvat_journey?.source?.chatId || '').startsWith('solo:');
// SillyTavern stamps date_last_chat each time the group's chat is saved. A group id is its creation time.
export const lastPlayed=group=>Number(group?.date_last_chat) || Date.parse(group?.create_date || '') || Number(group?.id) || 0;
// Every journey, most recently played first.
export const journeyList=ctx=>(ctx?.groups || []).filter(isJourneyGroup).sort((a,b)=>lastPlayed(b)-lastPlayed(a));
const dayStart=time=>{const d=new Date(time);d.setHours(0,0,0,0);return d.getTime();};
export function playedLabel(time,now=Date.now()){
    if(!time)return '';
    const days=Math.round((dayStart(now)-dayStart(time))/864e5);
    if(days<=0)return 'Played today';
    if(days===1)return 'Played yesterday';
    if(days<7)return `Played ${days} days ago`;
    const date=new Date(time);
    return 'Played '+date.toLocaleDateString(undefined,{day:'numeric',month:'short',...(date.getFullYear()===new Date(now).getFullYear()?{}:{year:'numeric'})});
}
// Keeps the open journey's place on its group record, so the Journeys list can name it without loading the
// chat. Nothing is posted here: SillyTavern saves the group record with every group chat save
// (saveGroupChat -> editGroup), and travel always saves the chat. Returns whether the record changed.
export function noteJourneyPlace(ctx,place){
    const journey=activeGroup(ctx)?.silly_teyvat_journey;
    if(journey?.version!==1||!place?.label)return false;
    const next={id:String(place.id || ''),label:String(place.label),region:String(place.region || '')},last=journey.lastPlace;
    if(last&&last.id===next.id&&last.label===next.label&&last.region===next.region)return false;
    journey.lastPlace=next;return true;
}
export const filterJourneyEntities=entities=>entities.filter(entity=>entity.type==='group'?!isJourneyGroup(entity.item):!isNarrator(entity.item));
export function createJourneyLibraryAdapter({loadScript=()=>import('/script.js'),loadGroups=()=>import('/scripts/group-chats.js')}={}){
    return {
        async install(){
            const script=await loadScript(),filters=script.entitiesFilter?.filterFunctions;
            if(!filters)throw new Error('The native character library filter is unavailable.');
            const previous=filters.silly_teyvat_journeys;
            filters.silly_teyvat_journeys=filterJourneyEntities;
            // The native filter only runs for keys present in its filter data.
            const data=script.entitiesFilter.filterData;if(data&&!('silly_teyvat_journeys' in data))data.silly_teyvat_journeys=true;
            script.printCharactersDebounced?.();
            return ()=>{if(data)delete data.silly_teyvat_journeys;if(filters.silly_teyvat_journeys===filterJourneyEntities){if(previous)filters.silly_teyvat_journeys=previous;else delete filters.silly_teyvat_journeys;script.printCharactersDebounced?.();}};
        },
        async open(id){const groups=await loadGroups();return groups.openGroupById(id);},
    };
}
