const encoder=new TextEncoder();
const json=(value,status=200,extra={})=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const failure=(message,status=400)=>Object.assign(new Error(message),{status});

export class SubscriptionStore {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(request){
    const {action,...arg}=await request.json(),storage=this.ctx.storage;
    if(action==='session'){
      const existing=/^[a-f0-9-]{36}$/.test(arg.token||'')?await storage.get('session:'+arg.token):null;
      if(existing&&existing.expires>Date.now())return json({id:arg.token});
      const id=crypto.randomUUID();await storage.put('session:'+id,{expires:Date.now()+30*86400000});
      await storage.setAlarm(Date.now()+86400000);return json({id,fresh:true});
    }
    if(action==='status')return json({subscribed:!!await storage.get('signup:'+arg.id)});
    if(action==='subscribe'){
      const key='signup:'+arg.id,prior=await storage.get(key);
      if(prior?.time>Date.now()-60000)return json({error:'Wait a minute before updating your subscription.'},429);
      const digest=await crypto.subtle.digest('SHA-256',encoder.encode(arg.email));
      const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      if(prior?.hash&&prior.hash!==hash)await storage.delete('subscriber:'+prior.hash);
      await storage.put('subscriber:'+hash,{email:arg.email,consent:'GM product updates',subscribedAt:new Date().toISOString()});
      await storage.put(key,{time:Date.now(),hash});return json({ok:true});
    }
    if(action==='unsubscribe'){
      const prior=await storage.get('signup:'+arg.id);if(prior)await storage.delete('subscriber:'+prior.hash);
      await storage.delete('signup:'+arg.id);return json({ok:true});
    }
    if(action==='subscribers'){
      const rows=await storage.list({prefix:'subscriber:',limit:500,...(arg.after?{startAfter:arg.after}:{})});
      return json({entries:[...rows.values()],next:rows.size===500?[...rows.keys()].at(-1):null});
    }
    return json({error:'Unknown subscription operation.'},400);
  }
  async alarm(){
    const all=await this.ctx.storage.list(),cutoff=new Date(Date.now()-2*86400000).toISOString().slice(0,10),remove=[];
    for(const [key,value] of all)if((key.startsWith('day:')&&key.slice(4,14)<cutoff)||value.expires<Date.now()||(key.startsWith('signup:')&&value.time<Date.now()-30*86400000))remove.push(key);
    for(let i=0;i<remove.length;i+=128)await this.ctx.storage.delete(remove.slice(i,i+128));
    await this.ctx.storage.setAlarm(Date.now()+86400000);
  }
}


async function readBody(request){
  if(!request.headers.get('content-type')?.includes('application/json'))throw failure('Use JSON.',415);
  const reader=request.body?.getReader();if(!reader)throw failure('Missing request.');
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw failure('Request too large.',413);}chunks.push(value);}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(data));}catch{throw failure('Invalid JSON.');}
}
export async function subscriptionRequest(request,env){
  let cookie='';
  const reply=(value,status=200)=>json(value,status,cookie?{'set-cookie':cookie}:{});
  try{
    const url=new URL(request.url),path=url.pathname;
    if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)throw failure('Request origin not allowed.',403);
    const allowed=path==='/api/preferences'?['GET']:path==='/api/subscribers'?['GET']:['POST','DELETE'];
    if(!allowed.includes(request.method))throw failure('Method not allowed.',405);
    if(!env.SUBSCRIPTIONS)throw failure('Subscriptions unavailable.',503);
    const store=env.SUBSCRIPTIONS.get(env.SUBSCRIPTIONS.idFromName('gm-v1'));
    const call=async(action,args={})=>{const response=await store.fetch('https://subscriptions/internal',{method:'POST',body:JSON.stringify({action,...args})});const result=await response.json();if(!response.ok)throw failure(result.error,response.status);return result;};
    if(path==='/api/subscribers'){
      if(!env.MAILING_ADMIN_TOKEN||request.headers.get('authorization')!==`Bearer ${env.MAILING_ADMIN_TOKEN}`)throw failure('Not found.',404);
      const after=url.searchParams.get('after');if(after&&!/^subscriber:[a-f0-9]{64}$/.test(after))throw failure('Invalid cursor.');
      return reply(await call('subscribers',{after}));
    }
    const cookieName=url.protocol==='https:'?'__Host-gm_browser':'gm_browser';
    const token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    const session=await call('session',{token});
    if(session.fresh)cookie=`${cookieName}=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${url.protocol==='https:'?'; Secure':''}`;
    if(path==='/api/preferences')return reply({...await call('status',{id:session.id}),mailingList:env.MAILING_LIST_ENABLED==='true'});
    if(request.method==='DELETE')return reply(await call('unsubscribe',{id:session.id}));
    if(env.MAILING_LIST_ENABLED!=='true')throw failure('Subscriptions unavailable.',503);
    const body=await readBody(request),email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    if(body.website)return reply({ok:true});
    if(body.consent!==true||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw failure('Enter an email address and agree to receive updates.');
    return reply(await call('subscribe',{id:session.id,email}));
  }catch(error){return reply({error:error.status?error.message:'Subscriptions unavailable.'},error.status||503);}
}
