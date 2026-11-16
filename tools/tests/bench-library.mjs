#!/usr/bin/env node
// Times the game inside a real SillyTavern whose card library is far larger than the game's cast.
// The preview-based checks (bench-perf.mjs) mock a small library, so they cannot see work that grows
// with the number of cards a player already has.
//
//   node tools/tests/bench-library.mjs --url http://127.0.0.1:8003 [--cpu 1] [--char Klee] [--shot /path/prefix]
//
// Needs Playwright on NODE_PATH and a throwaway SillyTavern profile with game data and a few thousand
// extra cards; docs/performance/2026-11-15-large-libraries.md has the recipe. Never point it at a
// profile you play on: it opens a chat and sends a message. Each step prints its main-thread cost, long
// tasks, and the functions (the extension's own, inclusive) that took the time.
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const arg=(name,fallback)=>{const i=process.argv.indexOf(`--${name}`);return i>0?process.argv[i+1]:fallback;};
const URL=arg('url',''),CPU=Number(arg('cpu',4)),NAME=arg('char','Klee');
if(!URL||/:8000\b/.test(URL)){console.error('Give --url for a throwaway SillyTavern (not the one on port 8000).');process.exit(2);}
setTimeout(()=>{console.error('bench-library: timed out');process.exit(2);},500000).unref();
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1366,height:768}});
const page=await context.newPage(),cdp=await context.newCDPSession(page);
const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
await cdp.send('Performance.enable');
await page.addInitScript(()=>{window.__long=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration));}).observe({entryTypes:['longtask']});});
await page.goto(URL,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>!document.querySelector('#preloader'),null,{timeout:300000});
await page.waitForTimeout(6000);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:CPU});
await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});
const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
async function step(name,action,settle=8000){
    await page.evaluate(()=>{window.__long.length=0;});
    await cdp.send('Profiler.start');const a=await metrics(),t=Date.now();
    let note='';try{await action();}catch(e){note=e.message.split('\n')[0];}
    const took=Date.now()-t;await page.waitForTimeout(settle);
    const b=await metrics(),{profile}=await cdp.send('Profiler.stop'),long=await page.evaluate(()=>window.__long.slice());
    const d=k=>Math.round((b[k]-a[k])*1000);
    console.log(`\n== ${name}: action ${took}ms task ${d('TaskDuration')} script ${d('ScriptDuration')} style ${d('RecalcStyleDuration')} layout ${d('LayoutDuration')} long ${long.length} (worst ${Math.max(0,...long)}, total ${long.reduce((s,x)=>s+x,0)}) nodes ${b.Nodes} ${note}`);
    const byId=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map(),parent=new Map(),incl=new Map();
    for(const n of profile.nodes)for(const c of n.children||[])parent.set(c,n.id);
    profile.samples.forEach((id,i)=>{const f=byId.get(id).callFrame,dt=profile.timeDeltas[i]/1000;if(/^\((idle|program)\)$/.test(f.functionName))return;
        const key=`${f.functionName||'(anon)'} ${f.url.split('/').slice(-1)[0]}:${f.lineNumber+1}`;self.set(key,(self.get(key)||0)+dt);
        const seen=new Set();let cur=id;while(cur){const g=byId.get(cur).callFrame;if(g.url.includes('genshin-dialogue-ui')){const k=`${g.functionName||'(anon)'} ${g.url.split('/').pop()}:${g.lineNumber+1}`;if(!seen.has(k)){seen.add(k);incl.set(k,(incl.get(k)||0)+dt);}}cur=parent.get(cur);}
        if(seen.size)incl.set('ANY EXT',(incl.get('ANY EXT')||0)+dt);});
    const top=(m,n)=>[...m].sort((x,y)=>y[1]-x[1]).slice(0,n).filter(x=>x[1]>=8).map(([k,v])=>`${Math.round(v)} ${k}`).join(' | ');
    console.log(' self: '+top(self,14));console.log(' ext inclusive: '+top(incl,22));
}

await step(`open ${NAME}`,async()=>{
    await page.evaluate(async name=>{const ctx=SillyTavern.getContext(),i=ctx.characters.findIndex(c=>c.name===name);await ctx.selectCharacterById(i);},NAME);
    await page.waitForFunction(()=>document.querySelector('#chat > .mes'),null,{timeout:120000});
},12000);
await step('idle in chat',async()=>{},5000);
await step('open Paimon menu',async()=>{await page.evaluate(()=>document.querySelector('#gi-launcher').click());},3000);
const act=name=>page.evaluate(n=>document.querySelector(`#gi-toolbar [data-gi-action="${n}"]`).click(),name);
await step('open Map',async()=>{await act('map');},6000);
await step('close Map',async()=>{await page.keyboard.press('Escape');},2500);
await step('open Characters',async()=>{await page.evaluate(()=>{if(document.querySelector('#gi-toolbar').inert)document.querySelector('#gi-launcher').click();});await page.waitForTimeout(400);await act('wardrobe');},7000);
if(arg('shot'))await page.screenshot({path:`${arg('shot')}-characters.png`});
await step('close Characters',async()=>{await page.keyboard.press('Escape');},2500);
await step('open Inventory',async()=>{await page.evaluate(()=>{if(document.querySelector('#gi-toolbar').inert)document.querySelector('#gi-launcher').click();});await page.waitForTimeout(400);await act('inventory');},5000);
await step('close Inventory',async()=>{await page.keyboard.press('Escape');},2000);
await step('send a message (no API)',async()=>{await page.fill('#send_textarea','Hello there');await page.evaluate(()=>document.querySelector('#send_but').click());},8000);
await step('close menu, open Extensions drawer',async()=>{await page.keyboard.press('Escape');await page.evaluate(()=>document.querySelector('#extensions-settings-button .drawer-toggle').click());
    await page.waitForFunction(()=>{const el=document.querySelector('#rm_extensions_block');return el&&getComputedStyle(el).display!=='none';},null,{timeout:120000});},4000);
await step('open Manage extensions',async()=>{await page.evaluate(()=>document.querySelector('#extensions_details').click());await page.waitForSelector('.extensions_info',{timeout:120000});},3000);
if(arg('shot'))await page.screenshot({path:`${arg('shot')}.png`});
if(errors.length)console.log('errors:',[...new Set(errors)].slice(0,8).join('\n  '));
await browser.close();process.exit(0);
