import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {PDFImportLimits,PDFImportJob} from '../src/pdf-import.js';

function ledger(){
 const rows=new Map();
 const storage={
  get:async key=>structuredClone(rows.get(key)),
  put:async(key,value)=>rows.set(key,structuredClone(value)),
  delete:async key=>rows.delete(key),
  setAlarm:async()=>{},
  transaction:async action=>action(storage)
 };
 const limits=new PDFImportLimits({storage});
 const call=body=>limits.fetch(new Request('https://limits/internal',{method:'POST',body:JSON.stringify(body)}));
 return{limits,call};
}

test('Each browser gets two daily PDF attempts and reopening the importer preserves the quota',async()=>{
 const {call}=ledger(),{id}=await(await call({action:'session'})).json();
 for(let i=0;i<2;i++){
  const reservation=await call({action:'reserve',id,ip:'network'});
  assert.equal(reservation.status,200);
  const {ticket}=await reservation.json();
  await call({action:'settle',ticket,cost:.01,consume:true});
 }
 const reopened=await(await call({action:'session',id})).json();
 assert.equal(reopened.id,id);
 const third=await call({action:'reserve',id:reopened.id,ip:'network'});
 assert.equal(third.status,429);
 assert.match((await third.json()).error,/2 PDF imports.*keff\.uk/);
 const other=await(await call({action:'session'})).json();
 assert.equal((await call({action:'reserve',id:other.id,ip:'network'})).status,200);
});

test('Concurrent imports cannot bypass the daily allowance; invalid files release their slot',async()=>{
 const {call}=ledger(),{id}=await(await call({action:'session'})).json();
 const reserve=()=>call({action:'reserve',id,ip:'network'});
 const first=await(await reserve()).json();
 assert.equal((await reserve()).status,429);
 await call({action:'settle',ticket:first.ticket,cost:0,consume:false});
 for(let i=0;i<2;i++){
  const response=await reserve();assert.equal(response.status,200);
  const {ticket}=await response.json();await call({action:'settle',ticket,cost:.01,consume:true});
 }
 assert.equal((await reserve()).status,429);
});

test('200-page PDFs reach interpretation; 201-page PDFs are rejected without using an attempt',async t=>{
 const {limits}=ledger();
 const job=new PDFImportJob({}, {OPENAI_API_KEY:'test-key',PDF_IMPORT_LIMITS:{idFromName:name=>name,get:()=>({fetch:(input,init)=>limits.fetch(new Request(input,init))})}});
 const url='https://gm.invalid/api/import/pdf';
 const session=await job.fetch(new Request(url)),cookie=session.headers.get('set-cookie').split(';')[0];
 let interpretations=0;
 t.mock.method(globalThis,'fetch',async endpoint=>{
  assert.equal(endpoint,'https://api.openai.com/v1/responses');interpretations++;
  return Response.json({error:{message:'Simulated provider outage'}},{status:503});
 });
 async function submit(pages){
  const pdf=await PDFDocument.create();for(let i=0;i<pages;i++)pdf.addPage();
  return job.fetch(new Request(url,{method:'POST',headers:{origin:'https://gm.invalid',cookie,'content-type':'application/pdf'},body:await pdf.save()}));
 }
 const oversized=await submit(201);assert.equal(oversized.status,413);
 assert.match((await oversized.json()).error,/200 pages.*keff\.uk/);assert.equal(interpretations,0);
 assert.equal((await submit(200)).status,502);assert.equal(interpretations,1);
 assert.equal((await submit(1)).status,502);assert.equal(interpretations,2);
 assert.equal((await submit(1)).status,429);assert.equal(interpretations,2);
});
