import * as THREE from 'three';

export class SectionViews{
 constructor(host,onPick,onError){
  this.host=host;this.onError=onError;this.maps=new Map();this.settings=new Map();this.serial=0;this.queue=[];
  this.worker=new Worker('/section-worker.js',{type:'module'});
  this.worker.onmessage=({data})=>{
   const job=this.running;this.running=null;
   if(job?.id===data.id){
    if(job.format){if(data.error)job.reject(new Error(data.error));else job.resolve(data);}
    else if(job.id===this.latest){
     for(const map of job.maps){const svg=host.querySelector('#view-'+map.axis),status=svg.parentElement.querySelector('.section-status');svg.removeAttribute('aria-busy');status.hidden=true;}
     if(data.error){for(const map of job.maps){const svg=host.querySelector('#view-'+map.axis);svg.replaceChildren();this.maps.delete(map.axis);}onError(data.error);}
     else for(const section of data.sections){
      const svg=host.querySelector('#view-'+section.map.axis),doc=new DOMParser().parseFromString(section.svg,'image/svg+xml').documentElement;
      svg.setAttribute('viewBox',doc.getAttribute('viewBox'));svg.innerHTML=doc.innerHTML;svg.dataset.revision=job.revision;svg.dataset.toleranceCm=section.tolerance;this.maps.set(section.map.axis,section.map);
     }
    }
   }
   this.dispatch();
  };
  this.worker.onerror=()=>{
   this.failed=true;this.worker.terminate();const error=new Error('Section calculation failed. Reload the workspace.');
   this.running?.reject?.(error);for(const job of this.queue)job.reject?.(error);this.running=null;this.queue=[];this.maps.clear();
   for(const svg of host.querySelectorAll('.section-view')){svg.removeAttribute('aria-busy');svg.replaceChildren();const status=svg.parentElement.querySelector('.section-status');status.textContent='Section unavailable';status.hidden=false;}
   onError(error.message);
  };
  for(const axis of ['xy','xz','yz']){
   const svg=host.querySelector('#view-'+axis),frame=svg.parentElement;
   const status=document.createElement('span');status.className='section-status';status.setAttribute('role','status');status.hidden=true;status.textContent='Updating section...';frame.append(status);
   const controls=document.createElement('div');controls.className='orbit-tools';
   for(const [name,label,action] of [['Fit section','Fit',()=>this.change(axis,{reset:true})],['Zoom out','-',()=>this.change(axis,{factor:1.25})],['Zoom in','+',()=>this.change(axis,{factor:.8})]]){
    const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label',axis.toUpperCase()+' '+name.toLowerCase());button.title=button.getAttribute('aria-label');button.onclick=action;controls.append(button);
   }frame.append(controls);
   svg.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey)return;event.preventDefault();this.change(axis,{factor:event.deltaY>0?1.15:1/1.15});},{passive:false});
   svg.addEventListener('keydown',event=>{
    const key=event.key;if(!['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','f','F'].includes(key))return;event.preventDefault();event.stopPropagation();
    if(key==='f'||key==='F')this.change(axis,{reset:true});else if(['+','=','-'].includes(key))this.change(axis,{factor:key==='-'?1.25:.8});
    else this.change(axis,{dx:key==='ArrowLeft'?-.15:key==='ArrowRight'?.15:0,dy:key==='ArrowDown'?-.15:key==='ArrowUp'?.15:0});
   });
   let down;
   svg.addEventListener('pointerdown',event=>{if(svg.getAttribute('aria-busy')==='true')return;down={x:event.clientX,y:event.clientY,map:this.maps.get(axis)};svg.setPointerCapture(event.pointerId);});
   svg.addEventListener('pointermove',event=>{if(!down?.map)return;const r=svg.getBoundingClientRect(),map=down.map,dx=(event.clientX-down.x)/r.width*map.width*map.scale,dy=(event.clientY-down.y)/r.height*map.height*map.scale;svg.setAttribute('viewBox',`${map.cx-map.width*map.scale/2-dx} ${-map.cy-map.height*map.scale/2-dy} ${map.width*map.scale} ${map.height*map.scale}`);});
   svg.addEventListener('pointerup',event=>{if(!down)return;const previous=down;down=null;const r=svg.getBoundingClientRect();if(previous.map&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)>4)this.change(axis,{dx:-(event.clientX-previous.x)/r.width,dy:(event.clientY-previous.y)/r.height});else onPick(event,axis,false);});
   svg.addEventListener('pointercancel',()=>{down=null;this.update();});
   svg.addEventListener('dblclick',event=>{if(svg.getAttribute('aria-busy')!=='true')onPick(event,axis,true);});
  }
 }
 palette(){
  const colors={},materials=new Map(this.model.materials.map(m=>[m.id,m.color]));
  for(const cell of this.model.cells){const color=this.model.colorBy==='universe'?new THREE.Color().setHSL((cell.universe*.137)%1,.3,.57):new THREE.Color(materials.get(cell.material)||'#91939b');if(this.selected.has(cell.id))color.lerp(new THREE.Color('#ffffff'),.14);colors[cell.id]='#'+color.getHexString();}
  return colors;
 }
 map(axis,exporting=false){
  const b=this.bounds,svg=this.host.querySelector('#view-'+axis),r=svg.getBoundingClientRect(),a=axis==='yz'?1:0,c=axis==='xy'?1:2,normal=axis==='xy'?2:axis==='xz'?1:0;
  const width=Math.max(1,Math.round(r.width||1200)),height=Math.max(1,Math.round(r.height||800)),setting=this.settings.get(axis)||{zoom:1};
  const scale=Math.max((b[a*2+1]-b[a*2])/width,(b[c*2+1]-b[c*2])/height)*1.1*setting.zoom,ratio=exporting?Math.max(1,1600/width):1;
  return{axis,a,c,normal,width:Math.round(width*ratio),height:Math.round(height*ratio),scale:scale/ratio,cx:setting.cx??(b[a*2]+b[a*2+1])/2,cy:setting.cy??(b[c*2]+b[c*2+1])/2,cut:this.model.section??(b[normal*2]+b[normal*2+1])/2};
 }
 update(model=this.model,selected=this.selected,bounds=this.bounds,revision=this.revision){
  if(!model||this.failed)return;const focus=JSON.stringify([model.id,model.focus]);if(this.focus!==focus){this.settings.clear();this.focus=focus;}
  this.model=model;this.selected=selected;this.bounds=bounds;this.revision=revision;
  const maps=['xy','xz','yz'].filter(axis=>{const r=this.host.querySelector('#view-'+axis).getBoundingClientRect();return r.width>0&&r.height>0;}).map(axis=>this.map(axis));
  if(!maps.length)return;
  const key=JSON.stringify([model,Array.from(selected),maps]);if(key===this.lastKey)return;this.lastKey=key;
  const job={id:++this.serial,model:structuredClone(model),maps,palette:this.palette(),revision};this.latest=job.id;
  this.queue=this.queue.filter(job=>job.format);this.queue.push(job);
  for(const map of maps){const svg=this.host.querySelector('#view-'+map.axis);svg.setAttribute('aria-busy','true');svg.parentElement.querySelector('.section-status').hidden=false;}
  this.dispatch();
 }
 change(axis,{factor=1,dx=0,dy=0,reset=false}){
  if(!this.model)return;const map=this.map(axis),previous=this.settings.get(axis)||{zoom:1};
  if(reset)this.settings.delete(axis);else this.settings.set(axis,{zoom:Math.max(1e-5,Math.min(1e4,previous.zoom*factor)),cx:map.cx+dx*map.width*map.scale,cy:map.cy+dy*map.height*map.scale});this.update();
 }
 dispatch(){if(this.running||!this.queue.length)return;this.running=this.queue.shift();const {resolve,reject,...message}=this.running;this.worker.postMessage(message);}
 export(axis,format){return new Promise((resolve,reject)=>{if(this.failed){reject(new Error('Section calculation failed. Reload the workspace.'));return;}if(!this.model){reject(new Error('Open a model first.'));return;}this.queue.push({id:++this.serial,model:structuredClone(this.model),maps:[this.map(axis,true)],palette:this.palette(),format,resolve,reject});this.dispatch();});}
}
