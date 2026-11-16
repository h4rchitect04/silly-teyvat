#!/usr/bin/env node
// Build assets/card-art: each game card's Genshin card picture, kept apart from the character's own image.
//
// Card art in SillyTavern shows these in the character list (card-art-store.js). A character's own image
// is their icon (tools/apply-card-icons.mjs), so the card picture has to live somewhere else. This copies
// it out of the card PNGs that still carry it: every card in the given characters folder with a Genshin
// tag whose image is shaped like a character card (208:248) or a Genius Invokation card (420:720).
//
//   node tools/build-card-art.mjs --characters <SillyTavern>/data/default-user/characters [--dry-run]
//
// Needs Playwright on NODE_PATH (Chrome scales the pictures and writes the WebP files; no Pillow).
// A name already in index.json is left alone, so running it again after the cards have become icons
// changes nothing. Then register the new media:
//   python3 tools/game-data.py migrate --dry-run --only extension/genshin-dialogue-ui/assets/card-art
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>0?process.argv[i+1]:'';};
const DRY=process.argv.includes('--dry-run'),FOLDER=arg('characters');
if(!FOLDER){console.error('Give --characters <folder of card PNGs>.');process.exit(2);}
const OUT=path.join(path.dirname(fileURLToPath(import.meta.url)),'../extension/genshin-dialogue-ui/assets/card-art');
const HEIGHT=512,CARD=208/248,TCG=420/720;

// The character data SillyTavern embeds in a card PNG; the newer "ccv3" chunk wins over "chara".
export function cardJson(bytes){
    const found={};let at=8;
    while(at+8<=bytes.length){
        const length=bytes.readUInt32BE(at),kind=bytes.toString('latin1',at+4,at+8);
        if(kind==='tEXt'){const body=bytes.subarray(at+8,at+8+length),zero=body.indexOf(0);if(zero>0)found[body.toString('latin1',0,zero)]=body.subarray(zero+1);}
        else if(kind==='IEND')break;
        at+=12+length;
    }
    const raw=found.ccv3 || found.chara;
    return raw?JSON.parse(Buffer.from(raw.toString('latin1'),'base64').toString('utf8')):null;
}
export const pngSize=bytes=>[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
const shape=(width,height)=>Math.abs(width/height-CARD)<.03?'art':Math.abs(width/height-TCG)<.03?'tcg':null;

const indexPath=path.join(OUT,'index.json');
const index=fs.existsSync(indexPath)?JSON.parse(fs.readFileSync(indexPath,'utf8')):{version:1,art:{}};
const wanted=[],skipped=[];
for(const file of fs.readdirSync(FOLDER).filter(name=>name.toLowerCase().endsWith('.png')).sort()){
    const bytes=fs.readFileSync(path.join(FOLDER,file));
    let card=null;try{card=cardJson(bytes);}catch{/* not a card */}
    const data=card?.data || card || {},tags=(data.tags || []).map(tag=>String(tag).trim().toLowerCase());
    if(!card||!tags.some(tag=>tag==='genshin'||tag==='genshin impact'))continue;
    const name=data.extensions?.silly_teyvat?.baseName || data.name || file.replace(/\.png$/i,'');
    if(index.art[name])continue;
    const [width,height]=pngSize(bytes),kind=shape(width,height);
    if(!kind){skipped.push(`${file} (${width}x${height})`);continue;}
    wanted.push({name,kind,bytes,width,height});
}
if(wanted.length&&!DRY){
    const {chromium}=createRequire(import.meta.url)('playwright');
    const browser=await chromium.launch({channel:'chrome',headless:true}).catch(()=>chromium.launch({headless:true}));
    const page=await browser.newPage();
    fs.mkdirSync(OUT,{recursive:true});
    for(const item of wanted){
        const webp=Buffer.from(await page.evaluate(async({png,height})=>{
            const image=await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
            const h=Math.min(height,image.height),w=Math.round(image.width*h/image.height),canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d');
            ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,w,h);
            const blob=await canvas.convertToBlob({type:'image/webp',quality:.9});
            return new Promise(done=>{const reader=new FileReader();reader.onload=()=>done(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
        },{png:item.bytes.toString('base64'),height:HEIGHT}),'base64');
        const slug=item.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'card';
        const file=`${slug}-${createHash('sha256').update(webp).digest('hex').slice(0,6)}.webp`;
        if(!fs.existsSync(path.join(OUT,file)))fs.writeFileSync(path.join(OUT,file),webp);
        index.art[item.name]={file,kind:item.kind};
    }
    await browser.close();
    index.art=Object.fromEntries(Object.entries(index.art).sort(([a],[b])=>a.localeCompare(b)));
    fs.writeFileSync(indexPath,JSON.stringify(index,null,1)+'\n');
}
console.log(`${wanted.length} card pictures ${DRY?'would be ':''}added; ${Object.keys(index.art).length+(DRY?wanted.length:0)} in the index.`);
if(skipped.length)console.log(`${skipped.length} tagged cards are not card-shaped and get no card art: ${skipped.slice(0,12).join(', ')}${skipped.length>12?' ...':''}`);
process.exit(0);
