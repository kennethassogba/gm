import {PDFDocument} from 'pdf-lib';
import {PDF_PLAN_SCHEMA,PDF_INSTRUCTIONS,buildPDFModel} from './pdf-plan.js';

const MAX_BYTES=15*1024*1024,MAX_PAGES=100,RESERVE=.4,MODEL='gpt-5.4-mini';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const day=()=>new Date().toISOString().slice(0,10);

// One ledger serializes reservations across browsers and concurrent requests.
// It stores counters and random session IDs, never PDFs, prompts or model data.
export class PDFImportLimits {
 constructor(ctx){this.ctx=ctx;}
 async fetch(request){
  const {action,...arg}=await request.json(),storage=this.ctx.storage;
  return storage.transaction(async tx=>{
   if(action==='session'){
    if(/^[a-f0-9-]{36}$/.test(arg.id||'')&&(await tx.get('s:'+arg.id))?.expires>Date.now())return json({id:arg.id});
    const id=crypto.randomUUID();await tx.put('s:'+id,{expires:Date.now()+30*86400000});await storage.setAlarm(Date.now()+86400000);return json({id});
   }
   if(action==='reserve'){
    if(!((await tx.get('s:'+arg.id))?.expires>Date.now())||!arg.ip)return json({error:'Reopen the PDF importer and try again.'},401);
    const keys=['d:'+day()+':browser:'+arg.id,'d:'+day()+':network:'+arg.ip,'d:'+day()+':service'];
    const caps=[{cost:2,count:20,active:1},{cost:6,count:60,active:3},{cost:20,count:200,active:8}];
    const rows=await Promise.all(keys.map(async key=>await tx.get(key)||{cost:0,count:0,active:[]}));
    for(let i=0;i<rows.length;i++){
     rows[i].active=rows[i].active.filter(r=>r.until>Date.now());
     if(rows[i].active.length>=caps[i].active)return json({error:'An import is already running. Try again in a few minutes.'},429);
     if(rows[i].cost+RESERVE>caps[i].cost||rows[i].count>=caps[i].count)return json({error:'PDF imports are paused for today. Try again tomorrow.'},429);
    }
    const ticket=crypto.randomUUID();
    for(let i=0;i<rows.length;i++){rows[i].cost+=RESERVE;rows[i].count++;rows[i].active.push({ticket,until:Date.now()+240000});await tx.put(keys[i],rows[i]);}
    await tx.put('r:'+ticket,{keys,expires:Date.now()+86400000});return json({ticket});
   }
   if(action==='settle'){
    const reservation=await tx.get('r:'+arg.ticket);if(!reservation)return json({ok:true});
    const cost=Number.isFinite(arg.cost)&&arg.cost>=0?arg.cost:RESERVE;
    for(const key of reservation.keys){const row=await tx.get(key);if(row){row.cost=Math.max(0,row.cost-RESERVE+cost);row.active=row.active.filter(r=>r.ticket!==arg.ticket);await tx.put(key,row);}}
    await tx.delete('r:'+arg.ticket);return json({ok:true});
   }
   return json({error:'Not found.'},404);
  });
 }
 async alarm(){
  const rows=await this.ctx.storage.list(),cutoff=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
  const keys=[...rows].filter(([k,v])=>(k.startsWith('d:')&&k.slice(2,12)<cutoff)||v.expires<Date.now()).map(([k])=>k);
  for(let i=0;i<keys.length;i+=128)await this.ctx.storage.delete(keys.slice(i,i+128));
  await this.ctx.storage.setAlarm(Date.now()+86400000);
 }
}
async function readPDF(request){
 if(request.headers.get('content-type')!=='application/pdf')throw fail('Choose a PDF file.',415);
 if(Number(request.headers.get('content-length')||0)>MAX_BYTES)throw fail('Choose a PDF smaller than 15 MB, or export just the relevant pages.',413);
 const reader=request.body?.getReader();if(!reader)throw fail('Choose a PDF file.');
 let size=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw fail('Choose a PDF smaller than 15 MB, or export just the relevant pages.',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 if(!new TextDecoder().decode(bytes.subarray(0,8)).startsWith('%PDF-'))throw fail('This file is not a PDF. Choose another file.');
 return bytes;
}
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
export async function pdfImportRequest(request,env){
 let ticket=null,call,cost=null;
 try{
  const url=new URL(request.url),secure=url.protocol==='https:',cookieName=secure?'__Host-gm_pdf':'gm_pdf';
  if(!['GET','POST'].includes(request.method))throw fail('Method not allowed.',405);
  if(!env.OPENAI_API_KEY||!env.PDF_IMPORT_LIMITS)throw fail('PDF import is temporarily unavailable. Try again later.',503);
  const store=env.PDF_IMPORT_LIMITS.get(env.PDF_IMPORT_LIMITS.idFromName('pdf-v1'));
  call=async(action,args={})=>{const res=await store.fetch('https://limits/internal',{method:'POST',body:JSON.stringify({action,...args})});const data=await res.json();if(!res.ok)throw fail(data.error,res.status);return data;};
  const id=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(request.method==='GET'){
   const session=await call('session',{id});return json({available:true},200,{'set-cookie':`${cookieName}=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure?'; Secure':''}`});
  }
  if(request.headers.get('origin')!==url.origin)throw fail('Reopen the importer in GM and try again.',403);
  let name,hint;try{name=decodeURIComponent(request.headers.get('x-pdf-name')||'Specification.pdf').slice(0,180);hint=decodeURIComponent(request.headers.get('x-pdf-case')||'');}catch{throw fail('Choose the file again.');}
  if(hint.length>1500)throw fail('Keep the case description under 1,500 characters.');
  // Hash the edge-provided address with a secret and daily salt. Raw addresses are not stored.
  const ipBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.OPENAI_API_KEY+day()+(request.headers.get('cf-connecting-ip')||'local')));
  const ip=Array.from(new Uint8Array(ipBytes),b=>b.toString(16).padStart(2,'0')).join('');
  ({ticket}=await call('reserve',{id,ip}));cost=0;
  const bytes=await readPDF(request);let pages;
  try{pages=(await PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true})).getPageCount();}catch{throw fail('This PDF could not be read. Export an unlocked PDF and try again.');}
  if(!pages||pages>MAX_PAGES)throw fail('Export up to 100 relevant pages and try again.',413);
  const payload={model:MODEL,store:false,reasoning:{effort:'medium'},max_output_tokens:16000,
   instructions:PDF_INSTRUCTIONS,
   input:[{role:'user',content:[{type:'input_file',filename:'specification.pdf',file_data:'data:application/pdf;base64,'+base64(bytes)},{type:'input_text',text:`PDF has ${pages} pages. Requested case or additional dimensions: ${hint||'Choose the principal geometry if unambiguous.'}`}]}],
   text:{format:{type:'json_schema',name:'pdf_geometry',strict:true,schema:PDF_PLAN_SCHEMA}}};
  cost=null; // Unknown provider outcome keeps the conservative reservation.
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:'Bearer '+env.OPENAI_API_KEY,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(170000)});
  const result=await response.json();
  if(result.usage)cost=(result.usage.input_tokens*.75+result.usage.output_tokens*4.5)/1000000;
  if(!response.ok){if(response.status>=400&&response.status<500)cost=0;throw fail(response.status===429?'PDF import is busy. Try again in a few minutes.':'The document could not be converted. Choose fewer pages or try again later.',502);}
  if(result.status!=='completed')throw fail('This case needs a smaller scope. Choose one component or fewer pages.',422);
  const output=result.output?.flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
  if(!output)throw fail('No geometry could be extracted. Try a specification with dimensions.',422);
  let plan;try{plan=JSON.parse(output);}catch{throw fail('The conversion was incomplete. Try a smaller component.',422);}
  let built;try{built=buildPDFModel(plan,{name,pages,case:hint});}catch(error){throw fail(error.message,422);}
  return json(built);
 }catch(error){return json({error:error.status?error.message:'The import stopped. Try again, or choose fewer pages.'},error.status||503);}
 finally{if(ticket&&call)await call('settle',{ticket,cost}).catch(()=>{});}
}
