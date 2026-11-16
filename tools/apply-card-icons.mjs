#!/usr/bin/env node
// Give each game card its icon as its own image, so SillyTavern shows the same icon as the Characters menu
// when Card art in SillyTavern, or the whole extension, is off. The card picture the PNG carried until now
// must already be in assets/card-art (tools/build-card-art.mjs): a card without one there is left alone.
//
//   node tools/apply-card-icons.mjs --server http://127.0.0.1:8003 --user-dir <SillyTavern>/data/default-user [--apply] [--only "Klee,Amber"]
//
// Without --apply it only lists what would change. Needs Playwright on NODE_PATH (Chrome draws the icon PNGs)
// and the SillyTavern that owns --user-dir running at --server: images go through its own avatar endpoint, as
// Character Management's does, so its thumbnails are rebuilt. Every card's embedded data is kept byte for byte
// and checked, and each original PNG is copied to <data pack>/backups/card-icons-<time>/ first.
// An icon is drawn whole on SillyTavern's 512x768 avatar canvas, so its round and square crops both show all of it.
// The canvas is filled with one flat colour taken from the background of the card's own card picture, since
// SillyTavern shows a transparent avatar on black.
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const repo=fileURLToPath(new URL('../',import.meta.url)),assets=path.join(repo,'extension/genshin-dialogue-ui/assets');
const {values}=parseArgs({options:{server:{type:'string'},'user-dir':{type:'string'},'data-root':{type:'string'},apply:{type:'boolean',default:false},only:{type:'string',default:''}}});
if(!values.server||!values['user-dir'])throw Error('Pass --server <local SillyTavern> and --user-dir <its data/default-user>.');
const base=new URL(values.server);if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw Error('Use a local SillyTavern server.');
const user=path.resolve(values['user-dir']),data=path.resolve(values['data-root'] || path.join(repo,'../silly-teyvat-data'));
const only=values.only.split(',').map(name=>name.trim()).filter(Boolean);
const icons=JSON.parse(fs.readFileSync(path.join(assets,'avatar-icons/index.json'),'utf8')).icons,art=JSON.parse(fs.readFileSync(path.join(assets,'card-art/index.json'),'utf8')).art;
const CARD=208/248,TCG=420/720,cardShaped=(w,h)=>Math.abs(w/h-CARD)<.03||Math.abs(w/h-TCG)<.03;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function chunks(bytes){const out=[];for(let at=8;at<bytes.length;){const size=bytes.readUInt32BE(at),kind=bytes.toString('ascii',at+4,at+8),end=at+12+size;out.push({kind,bytes:bytes.subarray(at,end),body:bytes.subarray(at+8,at+8+size)});at=end;}return out;}
const textChunks=bytes=>chunks(bytes).filter(chunk=>['tEXt','iTXt','zTXt'].includes(chunk.kind)).map(chunk=>chunk.bytes);
function metadata(bytes){
    const out={};for(const chunk of chunks(bytes))if(chunk.kind==='tEXt'){const end=chunk.body.indexOf(0),key=chunk.body.toString('ascii',0,end);if(['chara','ccv3'].includes(key))out[key]=JSON.parse(Buffer.from(chunk.body.subarray(end+1).toString(),'base64').toString());}
    return out;
}
// SillyTavern rewrites the legacy block when it saves an avatar: put every original text chunk back.
function retainMetadata(image,original){
    const out=[image.subarray(0,8)];
    for(const chunk of chunks(image)){if(chunk.kind==='IEND')out.push(...textChunks(original));if(!['tEXt','iTXt','zTXt'].includes(chunk.kind))out.push(chunk.bytes);}
    return Buffer.concat(out);
}
const plan=[],left=[];
for(const file of fs.readdirSync(path.join(user,'characters')).filter(name=>name.toLowerCase().endsWith('.png')).sort()){
    const native=path.join(user,'characters',file),bytes=fs.readFileSync(native);let meta={};try{meta=metadata(bytes);}catch{continue;}
    const card=meta.ccv3 || meta.chara,info=card?.data || card || {};
    if(!card||!(info.tags || []).some(tag=>['genshin','genshin impact'].includes(String(tag).trim().toLowerCase())))continue;
    const name=info.extensions?.silly_teyvat?.baseName || info.name || file.replace(/\.png$/i,'');
    if(only.length&&!only.includes(name))continue;
    const icon=icons[name] || icons[file.replace(/\.png$/i,'')],size=[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
    if(!cardShaped(...size)){left.push(`${name}: its image is not a card picture (already an icon, or its own)`);continue;}
    if(!icon){left.push(`${name}: no icon in assets/avatar-icons`);continue;}
    if(!art[name]){left.push(`${name}: its card picture is not in assets/card-art yet (run tools/build-card-art.mjs)`);continue;}
    plan.push({name,file,native,bytes,meta,icon});
}
console.log(`${plan.length} cards ${values.apply?'will':'would'} get their icon as their image.`);
for(const line of left)console.log('  left alone: '+line);
if(!values.apply||!plan.length){if(!values.apply)console.log('Nothing was changed. Add --apply to do it.');process.exit(0);}

const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}).catch(()=>chromium.launch({headless:true})),page=await browser.newPage();
// The background colour of a card picture: the commonest colour along the top and upper sides of its art,
// just inside the frame (a character card's art sits inside a frame; a Genius Invokation card's fills it).
function cardBackground(image,kind){
    const w=image.width,h=image.height,canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const px=ctx.getImageData(0,0,w,h).data,buckets=new Map();
    const lines=kind==='tcg'?[[.08,.05,.92,.05],[.07,.05,.07,.45],[.93,.05,.93,.45]]:[[.22,.13,.78,.13],[.21,.13,.21,.5],[.79,.13,.79,.5]];
    for(const [x0,y0,x1,y1] of lines)for(let step=0;step<=80;step++){
        const cx=Math.round((x0+(x1-x0)*step/80)*w),cy=Math.round((y0+(y1-y0)*step/80)*h);
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
            const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=w||y>=h)continue;
            const at=(y*w+x)*4;if(px[at+3]<200)continue;
            const r=px[at],g=px[at+1],b=px[at+2],key=(r>>5)<<6|(g>>5)<<3|(b>>5),sum=buckets.get(key)||[0,0,0,0];
            sum[0]++;sum[1]+=r;sum[2]+=g;sum[3]+=b;buckets.set(key,sum);
        }
    }
    const best=[...buckets.values()].sort((a,b)=>b[0]-a[0])[0];
    return best?'#'+best.slice(1).map(v=>Math.round(v/best[0]).toString(16).padStart(2,'0')).join(''):'#000000';
}
await page.addScriptTag({content:cardBackground.toString()});
const iconPng=async item=>{
    const {png,colour}=await page.evaluate(async({webp,cardWebp,kind})=>{
        const load=async data=>createImageBitmap(await (await fetch(`data:image/webp;base64,${data}`)).blob());
        const image=await load(webp),colour=cardBackground(await load(cardWebp),kind);
        const canvas=new OffscreenCanvas(512,768),ctx=canvas.getContext('2d'),scale=Math.min(512/image.width,768/image.height),w=image.width*scale,h=image.height*scale;
        ctx.fillStyle=colour;ctx.fillRect(0,0,512,768);
        ctx.imageSmoothingQuality='high';ctx.drawImage(image,(512-w)/2,(768-h)/2,w,h);
        const blob=await canvas.convertToBlob({type:'image/png'});
        return {colour,png:await new Promise(done=>{const reader=new FileReader();reader.onload=()=>done(reader.result.split(',')[1]);reader.readAsDataURL(blob);})};
    },{webp:fs.readFileSync(path.join(assets,'avatar-icons',item.icon)).toString('base64'),cardWebp:fs.readFileSync(path.join(assets,'card-art',art[item.name].file)).toString('base64'),kind:art[item.name].kind});
    return {image:Buffer.from(png,'base64'),colour};
};
const cookies=new Map();
async function request(route,options={}){
    const headers=new Headers(options.headers);
    if(cookies.size)headers.set('Cookie',[...cookies].map(([k,v])=>`${k}=${v}`).join('; '));
    const response=await fetch(new URL(route,base),{...options,headers});
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}
    if(!response.ok)throw Error(`${route}: ${response.status}`);return response;
}
const csrf=await (await request('/csrf-token')).json();
const backup=path.join(data,'backups','card-icons-'+new Date().toISOString().replaceAll(':','-'));fs.mkdirSync(backup,{recursive:true});
const entries=[];
for(const item of plan){
    fs.writeFileSync(path.join(backup,item.file),item.bytes);
    const {image,colour}=await iconPng(item),form=new FormData();
    form.set('avatar_url',item.file);form.set('avatar',new Blob([image],{type:'image/png'}),item.file);
    await request('/api/characters/edit-avatar',{method:'POST',headers:{'X-CSRF-Token':csrf.token},body:form});
    const uploaded=fs.readFileSync(item.native),after=retainMetadata(uploaded,item.bytes);
    const temporary=item.native+'.card-icon.tmp';fs.writeFileSync(temporary,after);fs.renameSync(temporary,item.native);
    if(!Buffer.concat(textChunks(after)).equals(Buffer.concat(textChunks(item.bytes)))||JSON.stringify(metadata(after))!==JSON.stringify(item.meta)){
        fs.writeFileSync(item.native,item.bytes);throw Error(`${item.name}: embedded character data changed; the original was put back (copy in ${backup}).`);
    }
    await request('/thumbnail?type=avatar&file='+encodeURIComponent(item.file));
    entries.push({name:item.name,file:item.file,icon:item.icon,background:colour,beforeSHA256:sha(item.bytes),afterSHA256:sha(after)});
}
await browser.close();
fs.writeFileSync(path.join(backup,'installation.json'),JSON.stringify({date:new Date().toISOString(),server:base.origin,userDir:user,entries},null,1)+'\n');
console.log(`Done: ${entries.length} cards. Originals and a record are in ${backup}`);
process.exit(0);
