export function installWorkspaceMenus({state,menu,projects,select,selected,construction,mutate,home,openModel,createEmptyModel}){
 const $=id=>document.getElementById(id);
 function show(event,keyboard=false){
  const target=event.target;
  if(target.closest('input,textarea,select,a,[contenteditable=true],dialog[open],#view-3d,.section-view,canvas'))return;
  const position={anchor:target.closest('button,[tabindex]')||target,...(!keyboard?{x:event.clientX,y:event.clientY}:{})};
  const project=target.closest('[data-project-id]'),overflow=target.closest('[data-project-menu]');
  if(project||overflow){event.preventDefault();projects.showMenu(project?.dataset.projectId||overflow.dataset.projectMenu,position);return;}
  if(target.closest('#model-name')&&state.model&&state.page==='editor'){event.preventDefault();projects.showMenu(state.model.id,position);return;}
  const template=target.closest('[data-open]');
  if(template){event.preventDefault();menu.open([{label:'Open as new project',run:()=>template.click()}],{...position,label:'Example actions'});return;}
  const row=target.closest('[data-select]');
  if(state.page==='editor'&&(row||target.closest('#properties-pane,#tree-pane'))){
   event.preventDefault();
   if(row){const kind=row.dataset.select,id=Number(row.dataset.id);if(state.model.selection?.kind!==kind||state.model.selection?.id!==id)select(kind,id);position.anchor=document.querySelector(`[data-select="${kind}"][data-id="${id}"]`);}
   const kind=state.model.selection?.kind,x=selected(),solid=kind==='cell'&&x&&!x.background;
   const actions=[];
   if(x)actions.push({label:'Rename',run:()=>{$('editor').dataset.pane='properties';$('item-name')?.focus();$('item-name')?.select();}});
   if(solid)actions.push(
    {label:'Move',shortcut:'M',run:()=>construction.runAction('move')},
    {label:'Duplicate',shortcut:'Ctrl+D',run:()=>construction.runAction('duplicate')},
    {label:'Rotate',disabled:x.fill!=null,run:()=>construction.runAction('rotate')},
    {label:'Array',run:()=>construction.runAction('array')},
    {label:'Combine...',run:()=>construction.runAction('boolean')},null,
    {label:x.hidden?'Show':'Hide',run:()=>mutate(()=>x.hidden=!x.hidden)},
    {label:state.model.isolated===x.id?'Show all':'Isolate',run:()=>mutate(m=>m.isolated=m.isolated===x.id?null:x.id)},
    {label:'Delete',shortcut:'Delete',danger:true,run:()=>construction.runAction('delete')},null
   );
   if(kind==='lattice')actions.push({label:'Edit lattice',run:()=>document.querySelector('[data-edit-lattice]')?.click()});
   actions.push({label:'Add box',run:()=>construction.open('box')},{label:'Add cylinder',run:()=>construction.open('cylinder')},{label:'Add sphere',run:()=>construction.open('sphere')});
   menu.open(actions,{...position,label:(x?.name||'Geometry')+' actions'});return;
  }
  if(target.closest('#library,.header')){
   event.preventDefault();menu.open([{label:'New geometry',run:()=>openModel(createEmptyModel())},{label:'Import model',run:()=>$('import').click()},{label:'All projects',run:()=>{home();state.filter='projects';document.querySelector('[data-filter=projects]').click();}}],{...position,label:'Workspace actions'});
  }
 }
 document.addEventListener('contextmenu',event=>show(event));
 document.addEventListener('keydown',event=>{
  if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')show(event,true);
  if(event.key==='F2'&&event.target.closest('[data-project-id]')){event.preventDefault();projects.action('rename',event.target.closest('[data-project-id]').dataset.projectId);}
 },true);
}
