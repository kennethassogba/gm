import {duplicateProject} from './project-store.js';
import {createProjectPreviews} from './project-previews.js';

export function installProjects({state,store,pending,save,openModel,home,notice,download,esc,menu,refresh}){
 const $=id=>document.getElementById(id),active=()=>state.documents.filter(p=>!p.deletedAt);let renameId;
 const overflow=id=>`<button class="project-more" data-project-menu="${esc(id)}" aria-label="Project actions for ${esc(state.documents.find(p=>p.id===id)?.name||'project')}" aria-haspopup="menu" title="Project actions">...</button>`;
 const modelFor=id=>pending.get(id)?.model??store.get(id);
 const previews=createProjectPreviews({store,state});
 function metadata(next){const index=state.documents.findIndex(p=>p.id===next.id);if(index<0)state.documents.unshift(next);else state.documents[index]=next;refresh();}
 function renderSidebar(){
  $('recent').innerHTML='<div class="projects-heading"><h2>Recent</h2><button data-project-library-menu aria-haspopup="menu" aria-label="Project library actions" title="Project library actions"'+(state.filter==='trash'?' data-active="true"':'')+'>...</button></div><div class="project-list">'+active().sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,3).map(p=>`<div class="project-row" data-project-id="${esc(p.id)}"><button data-project-open="${esc(p.id)}" title="${esc(p.name)}">${esc(p.name)}</button></div>`).join('')+'</div>';
 }
 function renderGrid(trash,query){
  const list=state.documents.filter(p=>!!p.deletedAt===trash&&p.name.toLowerCase().includes(query)).sort((a,b)=>b.updatedAt-a.updatedAt);
  return list.map(p=>`<article class="project-card" data-project-id="${esc(p.id)}"><button class="project-open" data-project-${trash?'restore':'open'}="${esc(p.id)}"><span class="project-preview" data-preview-id="${esc(p.id)}">${p.thumbnail?.url?`<img src="${esc(p.thumbnail.url)}" alt="" width="320" height="200"><span class="preview-label">${esc(p.thumbnail.label||'')}</span>`:`<span class="preview-label">${esc(p.thumbnail?.label||'Loading preview...')}</span>`}</span><span class="project-caption"><strong>${esc(p.name)}</strong><span>${trash?'Restore project':new Date(p.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></span></button>${overflow(p.id)}</article>`).join('')||'<p class="hint">'+(query?'No matching projects.':trash?'Trash is empty.':'Create a geometry or open an example to start a project.')+'</p>';
 }
 async function open(id){const model=await modelFor(id);if(!model)throw new Error('Project not found. Import an exported copy to recover it.');openModel(model);}
 async function action(kind,id){
  if(kind==='open')return open(id);
  if(kind==='rename'){
   const p=state.documents.find(p=>p.id===id);if(!p)return;renameId=id;$('project-name-input').value=p.name;$('project-name-error').textContent='';$('rename-project-dialog').showModal();$('project-name-input').focus();$('project-name-input').select();return;
  }
  if(kind==='duplicate'){
   const model=await modelFor(id);if(!model)throw new Error('Project not found.');const copy=duplicateProject(model,state.documents.map(p=>p.name));await save(copy);openModel(copy);return;
  }
  if(kind==='export'){const model=await modelFor(id);if(model)download('model.gm.json',JSON.stringify(model,null,2),'application/json');return;}
  if(kind==='trash'||kind==='restore'){
   const waiting=pending.get(id);if(waiting)await waiting.promise;
   metadata(await store.setDeleted(id,kind==='trash'));
   if(kind==='trash'&&state.model?.id===id){state.model=null;state.undo=[];state.redo=[];home();}
   notice(kind==='trash'?'Moved to Trash. You can restore it from Home.':'Project restored.');
   if(kind==='restore')await open(id);
  }
 }
 function showMenu(id,position={}){
  const p=state.documents.find(p=>p.id===id);if(!p)return;
  menu.open(p.deletedAt?[{label:'Restore',run:()=>action('restore',id)},{label:'Download JSON',run:()=>action('export',id)}]:[
   {label:'Open',run:()=>open(id)},{label:'Rename',shortcut:'F2',run:()=>action('rename',id)},
   {label:'Duplicate',run:()=>action('duplicate',id)},{label:'Download JSON',run:()=>action('export',id)},null,
   {label:'All projects',run:()=>{home();state.filter='projects';refresh();}},
   {label:'Move to Trash',danger:true,run:()=>action('trash',id)}
  ],{...position,label:p.name+' project actions'});
 }
 $('rename-project-form').onsubmit=async event=>{
  event.preventDefault();const name=$('project-name-input').value.trim();if(!name){$('project-name-error').textContent='Enter a project name.';$('project-name-input').focus();return;}
  const button=$('project-name-save');button.disabled=true;
  try{const model=await modelFor(renameId);if(!model)throw new Error('Project not found.');model.name=name;await save(model);if(state.model?.id===renameId){state.model.name=name;$('model-name').textContent=name;document.title=name+' - GM';}$('rename-project-dialog').close();refresh();(state.page==='editor'?$('model-name'):document.querySelector('[data-project-id="'+CSS.escape(renameId)+'"] [data-project-open]'))?.focus();}
  catch(error){$('project-name-error').textContent=error.message;}finally{button.disabled=false;}
 };
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-project-library-menu')){menu.open([{label:'All projects',current:state.filter==='projects',run:()=>{state.filter='projects';refresh();}},{label:'Trash',current:state.filter==='trash',run:()=>{state.filter='trash';refresh();}}],{anchor:button,label:'Project library'});return;}
  if(button.dataset.projectMenu){showMenu(button.dataset.projectMenu,{anchor:button});return;}
  const kind=button.dataset.projectOpen?'open':button.dataset.projectRestore?'restore':null;
  if(kind)action(kind,button.dataset.projectOpen||button.dataset.projectRestore).catch(error=>notice(error.message));
 });
 return{renderSidebar,renderGrid,showMenu,action,open,metadata,active,observePreviews:previews.observe};
}
