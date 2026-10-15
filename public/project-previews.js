import {geometryPreviewKey} from './project-store.js';

// A single worker serves visible cards serially. Cached images live with the
// project index; opening Home never creates a renderer for each project.
export function createProjectPreviews({store,state}){
 const queue=new Set(),failed=new Set();let running=false,worker;
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);queue.add(entry.target.dataset.previewId);}drain();},{rootMargin:'120px'});
 function paint(id,thumbnail){
  for(const host of document.querySelectorAll('[data-preview-id]'))if(host.dataset.previewId===id){
   host.replaceChildren();if(thumbnail.url){const img=new Image();img.src=thumbnail.url;img.alt='';img.width=320;img.height=200;host.append(img);}
   if(!host.hasAttribute('data-preview-small')){const label=document.createElement('span');label.className='preview-label';label.textContent=thumbnail.label||'';host.append(label);}
  }
 }
 function render(model){
  worker??=new Worker(new URL('./thumbnail-worker.js',import.meta.url),{type:'module'});
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{worker.terminate();worker=null;reject(new Error('Preview timed out.'));},30000);
   worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data);};
   worker.onerror=()=>{clearTimeout(timer);worker.terminate();worker=null;reject(new Error('Preview unavailable.'));};worker.postMessage(model);
  });
 }
 async function drain(){
  if(running)return;running=true;
  try{while(queue.size){
   const id=queue.values().next().value;queue.delete(id);
   if(!document.querySelector(`[data-preview-id="${CSS.escape(id)}"]`))continue;
   const current=state.documents.find(p=>p.id===id);if(current?.thumbnail)continue;
   try{
    const source=await store.getPreviewSource(id);if(!source)continue;
    const {model,project}=source,key=project.previewKey||await geometryPreviewKey(model),failureKey=id+':'+key;
    if(failed.has(failureKey)){paint(id,{label:'Preview unavailable'});continue;}
    let thumbnail;
    try{thumbnail=await render(model);}catch(error){failed.add(failureKey);throw error;}
    const next=await store.setThumbnail(id,{key,revision:project.revision,thumbnail});
    if(next){const index=state.documents.findIndex(p=>p.id===id);if(index>=0&&state.documents[index].revision===next.revision){state.documents[index]=next;paint(id,next.thumbnail);}}
   }catch{paint(id,{label:'Preview unavailable'});}
  }}finally{running=false;}
 }
 function observe(){observer.disconnect();for(const host of document.querySelectorAll('[data-preview-id]'))if(!state.documents.find(p=>p.id===host.dataset.previewId)?.thumbnail)observer.observe(host);}
 return{observe};
}
