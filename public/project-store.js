// Models and the small project index commit together. Listing projects never
// loads every geometry, and saving one project never rewrites another one.
export async function geometryPreviewKey(model){
 const source=JSON.stringify([model.surfaces,model.cells,model.materials,model.universes,model.lattices,model.rootUniverse??0,!!model.cutaway]);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
export class ProjectStore{
 constructor(factory=globalThis.indexedDB){
  this.revisions=new Map();this.queue=Promise.resolve();
  this.ready=new Promise((resolve,reject)=>{
   if(!factory){reject(new Error('Browser storage is unavailable.'));return;}
   const request=factory.open('gm-projects',1);
   request.onupgradeneeded=()=>{for(const name of ['projects','documents','settings'])request.result.createObjectStore(name,{keyPath:'id'});};
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
   request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Close other GM tabs and try again.'));
  });
 }
 async transaction(mode,work){
  const db=await this.ready;
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['projects','documents','settings'],mode),stores=Object.fromEntries(['projects','documents','settings'].map(name=>[name,tx.objectStore(name)]));let result,error;
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error||tx.error||new Error('The project could not be saved.'));tx.onerror=()=>{};
   try{work(stores,value=>result=value,cause=>{error=cause;tx.abort();});}catch(cause){error=cause;tx.abort();}
  });
 }
 write(work){const result=this.queue.then(work);this.queue=result.catch(()=>{});return result;}
 async migrate(storage){
  const sources=[];
  for(const key of ['gm.documents.v2','gm.studio.model.v1']){
   const raw=storage?.getItem(key);if(!raw)continue;const parsed=JSON.parse(raw);sources.push(...(Array.isArray(parsed)?parsed:[parsed]));
  }
  await this.transaction('readwrite',(s,done)=>{
   const marker=s.settings.get('legacy-migration');marker.onsuccess=()=>{
    if(marker.result){done();return;}
    const seen=new Set();for(const model of sources){if(model?.schema!=='gm-openmc-model/v1'||!model.id||seen.has(model.id))continue;seen.add(model.id);const old=s.projects.get(model.id);old.onsuccess=()=>{if(old.result)return;const now=Date.now();s.projects.put({id:model.id,name:model.name,createdAt:now,updatedAt:now,revision:1});s.documents.put({id:model.id,model});};}
    s.settings.put({id:'legacy-migration',complete:true});
   };
  });
 }
 async list(){
  const result=await this.transaction('readonly',(s,done)=>{const request=s.projects.getAll();request.onsuccess=()=>done(request.result);});
  for(const p of result)if(!this.revisions.has(p.id))this.revisions.set(p.id,p.revision);
  return result.sort((a,b)=>b.updatedAt-a.updatedAt);
 }
 async get(id){
  return this.transaction('readonly',(s,done)=>{
   const metadata=s.projects.get(id),document=s.documents.get(id);
   metadata.onsuccess=()=>{if(metadata.result)this.revisions.set(id,metadata.result.revision);};
   document.onsuccess=()=>done(document.result?.model||null);
  });
 }
 put(model){
  const snapshot=structuredClone(model);
  return this.write(async()=>{
   const previewKey=await geometryPreviewKey(snapshot);
   const metadata=await this.transaction('readwrite',(s,done,abort)=>{
    const request=s.projects.get(snapshot.id);request.onsuccess=()=>{
     const old=request.result;
     if(old&&(this.revisions.get(snapshot.id)??0)!==old.revision){abort(new Error('This project changed in another tab. Duplicate it to keep your edits.'));return;}
     const now=Date.now(),next={id:snapshot.id,name:snapshot.name,createdAt:old?.createdAt??now,updatedAt:now,revision:(old?.revision??0)+1,previewKey,...(old?.previewKey===previewKey&&old.thumbnail?{thumbnail:old.thumbnail}:{}),...(old?.deletedAt?{deletedAt:old.deletedAt}:{})};
     s.projects.put(next);s.documents.put({id:snapshot.id,model:snapshot});done(next);
    };
   });
   this.revisions.set(snapshot.id,metadata.revision);return metadata;
  });
 }
 async getPreviewSource(id){
  // Reading for a background preview must not adopt a newer edit revision:
  // that would let a stale editing tab overwrite another tab's changes.
  return this.transaction('readonly',(s,done)=>{
   let project,model;const metadata=s.projects.get(id),document=s.documents.get(id);
   const finish=()=>{if(project&&model)done({project,model});};
   metadata.onsuccess=()=>{project=metadata.result;finish();};document.onsuccess=()=>{model=document.result?.model;finish();};
  });
 }
 setThumbnail(id,{key,revision,thumbnail}){
  return this.write(()=>this.transaction('readwrite',(s,done,abort)=>{
   if(thumbnail.url&&(!/^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/.test(thumbnail.url)||thumbnail.url.length>180000)){abort(new Error('Invalid project preview.'));return;}
   const request=s.projects.get(id);request.onsuccess=()=>{
    const old=request.result;if(!old||(old.previewKey?old.previewKey!==key:old.revision!==revision)){done(null);return;}
    const next={...old,previewKey:key,thumbnail:{...thumbnail,key}};s.projects.put(next);done(next);
   };
  }));
 }
 setDeleted(id,deleted){
  return this.write(async()=>{
   const metadata=await this.transaction('readwrite',(s,done,abort)=>{
    const request=s.projects.get(id);request.onsuccess=()=>{
     const old=request.result;if(!old){abort(new Error('Project not found.'));return;}
     if((this.revisions.get(id)??0)!==old.revision){abort(new Error('This project changed in another tab. Reopen it first.'));return;}
     const next={...old,updatedAt:Date.now(),revision:old.revision+1};if(deleted)next.deletedAt=Date.now();else delete next.deletedAt;s.projects.put(next);done(next);
    };
   });
   this.revisions.set(id,metadata.revision);return metadata;
  });
 }
}

export function duplicateProject(model,names=[]){
 const copy=structuredClone(model),base=model.name+' copy';let name=base,index=2;
 while(names.includes(name))name=base+' '+index++;
 copy.id=crypto.randomUUID();copy.name=name;return copy;
}
