import {journeyList,journeyTitle,isSoloJourney,lastPlayed,playedLabel,createJourneyLibraryAdapter} from './journey-library.js';
import {cardByAvatar,hasCard} from './card-index.js';

// Journeys: every saved journey as a card, newest first, to continue, rename or delete. Opened from the
// Paimon menu's "Continue journey" on the welcome page, and from Saved journeys on the world map.
const CLOSE='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const NAME_MAX=100;

export function createJourneyMenuAdapter(getContext,{fetchImpl=(...args)=>fetch(...args),library=createJourneyLibraryAdapter()}={}){
    const post=async(path,data,what)=>{
        const response=await fetchImpl(path,{method:'POST',headers:getContext().getRequestHeaders(),body:JSON.stringify(data)});
        if(!response.ok)throw new Error(`The journey could not be ${what} (${response.status}).`);
    };
    return {
        open:id=>library.open(id),
        async rename(group,name){await post('/api/groups/edit',{...group,name},'renamed');group.name=name;await getContext().getCharacters?.();},
        // Deletes the group and its chat files, as SillyTavern's own Delete group does, without clearing the open chat.
        async remove(group){
            const ctx=getContext();
            await post('/api/groups/delete',{id:group.id},'deleted');
            for(const chatId of group.chats || [])await ctx.eventSource?.emit?.(ctx.eventTypes?.GROUP_CHAT_DELETED,chatId);
            const index=(ctx.groups || []).indexOf(group);if(index>=0)ctx.groups.splice(index,1);
            // SillyTavern's deleteGroup also forgets the group's tags; tag_map is saved with the settings.
            if(ctx.tagMap&&Object.hasOwn(ctx.tagMap,group.id)){delete ctx.tagMap[group.id];ctx.saveSettingsDebounced?.();}
            await ctx.getCharacters?.();
        },
    };
}

export function mountJourneyMenu({host,getContext,adapter=createJourneyMenuAdapter(getContext),announce=()=>{},onChange=()=>{}}){
    const dialog=document.createElement('dialog');dialog.id='gi-journeys';dialog.setAttribute('aria-labelledby','gi-journeys-title');
    dialog.innerHTML=`<header class="gi-journeys-top"><h2 id="gi-journeys-title">Journeys</h2><button type="button" class="gi-journeys-close" aria-label="Close Journeys">${CLOSE}</button></header>
        <section class="gi-journeys-list" aria-label="Saved journeys"></section>
        <footer class="gi-journeys-foot"><p role="status" aria-live="polite"></p><small>Each journey keeps its own place, party, bag and Trust.</small></footer>`;
    host.append(dialog);
    const abort=new AbortController(),$=s=>dialog.querySelector(s),list=$('.gi-journeys-list');
    // One row at a time is being renamed or asked to confirm a delete; one request at a time is in flight.
    // draft is the name being saved, so a failed rename keeps what the player typed.
    let editing='',confirming='',working='',draft='';
    const status=text=>{$('.gi-journeys-foot p').textContent=text;};
    const openId=()=>{const id=getContext().groupId;return id==null?'':String(id);};
    function portrait(ctx,group){
        if(group.avatar_url)return group.avatar_url;
        const avatar=group.silly_teyvat_journey?.source?.avatar;
        return avatar&&hasCard(ctx,avatar)?ctx.getThumbnailUrl?.('avatar',avatar) || '':'';
    }
    function subtitle(ctx,group){
        const source=group.silly_teyvat_journey?.source,with_=!isSoloJourney(group)&&source?.avatar?cardByAvatar(ctx,source.avatar)?.name:'';
        const kind=isSoloJourney(group)?'Solo journey':with_?`Journey with ${with_}`:'Journey';
        const place=group.silly_teyvat_journey?.lastPlace;
        return [kind,place?.label?[place.label,place.region].filter(Boolean).join(', '):''].filter(Boolean).join(' · ');
    }
    function button(label,action,id,cls=''){const b=el('button',cls,label);b.type='button';b.dataset.journey=action;b.dataset.id=id;b.disabled=Boolean(working);return b;}
    function row(ctx,group){
        const id=String(group.id),open=id===openId(),title=journeyTitle(group),card=el('article','gi-journey');card.dataset.id=id;
        if(open)card.dataset.open='true';
        const src=portrait(ctx,group);let art=el('img','gi-journey-art');
        const initial=()=>{const s=el('span','gi-journey-art',title.charAt(0).toUpperCase());s.setAttribute('aria-hidden','true');return s;};
        if(src){art.alt='';art.draggable=false;art.loading='lazy';art.src=src;art.addEventListener('error',()=>art.replaceWith(initial()),{once:true});}
        const text=el('div','gi-journey-text');
        if(editing===id){
            const input=el('input','gi-journey-name');input.type='text';input.maxLength=NAME_MAX;input.value=draft || title;input.disabled=Boolean(working);input.setAttribute('aria-label',`New name for ${title}`);input.dataset.id=id;
            text.append(input);
        }else text.append(el('h3','',title));
        text.append(el('p','',subtitle(ctx,group)));
        const played=playedLabel(lastPlayed(group));
        if(open||played)text.append(el('small','',open?'Open now':played));
        const actions=el('div','gi-journey-actions');
        if(editing===id)actions.append(button('Save','save',id,'gi-journey-primary'),button('Cancel','cancel',id));
        else if(confirming===id){
            const ask=el('p','gi-journey-confirm',`Delete “${title}” and its chat? This cannot be undone.`);ask.id=`gi-journey-confirm-${id}`;
            const yes=button('Delete','delete-yes',id,'gi-journey-danger');yes.setAttribute('aria-describedby',ask.id);
            actions.append(ask,yes,button('Keep','cancel',id));
        }else{
            const go=button(open?'You are here':'Continue','continue',id,'gi-journey-primary');go.disabled ||= open;
            const rename=button('Rename','rename',id);rename.setAttribute('aria-label',`Rename ${title}`);
            const remove=button('Delete','delete',id);remove.setAttribute('aria-label',`Delete ${title}`);
            // The open journey can't be deleted from under the chat that is showing it.
            if(open){remove.disabled=true;remove.title='Leave this journey before deleting it';}
            actions.append(go,rename,remove);
        }
        card.append(src?art:initial(),text,actions);
        return card;
    }
    function paint({focus=''}={}){
        const ctx=getContext(),journeys=journeyList(ctx);
        if(!journeys.some(g=>String(g.id)===editing))editing='';
        if(!journeys.some(g=>String(g.id)===confirming))confirming='';
        list.replaceChildren(...journeys.map(g=>row(ctx,g)));
        if(!journeys.length)list.append(el('p','gi-journeys-empty','No saved journeys yet. Start a solo journey from the Paimon menu, or travel with a character from their chat.'));
        dialog.dataset.empty=String(!journeys.length);
        const target=focus&&list.querySelector(focus);if(target){target.focus({preventScroll:false});if(target.select)target.select();}
    }
    const find=id=>journeyList(getContext()).find(g=>String(g.id)===id);
    async function run(id,label,job){
        working=id;paint();
        try{return await job();}
        catch(error){console.warn('[Silly Teyvat] Journeys',error);status(error.message || `The journey could not be ${label}.`);announce(error.message || `The journey could not be ${label}.`);return false;}
        finally{working='';if(dialog.open)paint();}
    }
    async function save(id){
        const group=find(id),input=list.querySelector(`.gi-journey-name[data-id="${CSS.escape(id)}"]`),name=input?.value.trim().slice(0,NAME_MAX) || '';
        if(!group)return;
        if(!name){status('Give the journey a name.');input?.focus();return;}
        if(name===journeyTitle(group)){editing='';paint({focus:`[data-journey="rename"][data-id="${CSS.escape(id)}"]`});return;}
        draft=name;const done=await run(id,'renamed',async()=>{await adapter.rename(group,name);return true;});
        if(done){editing=draft='';status(`Renamed to “${name}”.`);onChange();paint({focus:`[data-journey="rename"][data-id="${CSS.escape(id)}"]`});}
        else if(dialog.open)list.querySelector(`.gi-journey-name[data-id="${CSS.escape(id)}"]`)?.focus();
    }
    async function action(name,id){
        if(working)return;
        const group=find(id);if(!group&&name!=='cancel')return;
        if(name==='continue'){
            // Close first, so the loading screen of the journey being opened is not hidden behind the list.
            const title=journeyTitle(group);let error='';working=id;if(dialog.open)dialog.close();
            try{if(!await adapter.open(group.id))error=`${title} could not be opened.`;}
            catch(failure){console.warn('[Silly Teyvat] Journeys',failure);error=failure.message || `${title} could not be opened.`;}
            finally{working='';}
            if(error){announce(error);api.open();status(error);}else onChange();
            return;
        }
        if(name==='rename'){editing=id;confirming=draft='';status('');paint({focus:`.gi-journey-name[data-id="${CSS.escape(id)}"]`});return;}
        if(name==='save'){await save(id);return;}
        if(name==='delete'){confirming=id;editing='';status('');paint({focus:`[data-journey="delete-yes"][data-id="${CSS.escape(id)}"]`});return;}
        if(name==='delete-yes'){
            const title=journeyTitle(group);
            const done=await run(id,'deleted',async()=>{await adapter.remove(group);return true;});
            if(done){confirming='';status(`Deleted “${title}”.`);onChange();paint({focus:'[data-journey="continue"]:not(:disabled), .gi-journeys-close'});}
            return;
        }
        if(name==='cancel'){const back=editing===id?'rename':confirming===id?'delete':'continue';editing=confirming=draft='';status('');paint({focus:`[data-journey="${back}"][data-id="${CSS.escape(id)}"]`});}
    }
    dialog.addEventListener('click',event=>{
        if(event.target===dialog){api.close();return;}
        if(event.target.closest('.gi-journeys-close')){api.close();return;}
        const b=event.target.closest('[data-journey]');if(b&&!b.disabled)void action(b.dataset.journey,b.dataset.id);
    },{signal:abort.signal});
    dialog.addEventListener('keydown',event=>{
        const input=event.target.closest?.('.gi-journey-name');if(!input)return;
        // Through action(), which refuses while a request is in flight, so a second Enter sends nothing.
        if(event.key==='Enter'){event.preventDefault();void action('save',input.dataset.id);}
    },{signal:abort.signal});
    // Escape backs out of a rename or a delete question before it closes the list.
    dialog.addEventListener('cancel',event=>{if(working)event.preventDefault();else if(editing||confirming){event.preventDefault();void action('cancel',editing || confirming);}},{signal:abort.signal});
    const api={
        get isOpen(){return dialog.open;},
        open(){
            editing=confirming=draft='';status('');paint();
            if(!dialog.open)dialog.showModal();
            ($('[data-journey="continue"]:not(:disabled)') || $('.gi-journeys-close')).focus({preventScroll:true});
        },
        close(){if(working)return;editing=confirming=draft='';if(dialog.open)dialog.close();},
        refresh(){if(dialog.open&&!working&&!editing)paint();},
        dispose(){abort.abort();if(dialog.open)dialog.close();dialog.remove();},
    };
    return api;
}
