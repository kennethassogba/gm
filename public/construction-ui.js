import {STARTERS,createEmptyModel,recipes,translateCell,cloneOccurrence,validateModel} from './model.js';
import {createCell,createPin,createUniform,createLattice,placeUniverse,enableDomain,syncDomains,combineCells,duplicateCells,deleteCells,groupCells,focusUniverse,canContain,getCellBounds,geometryDiagnostics,serializeRegion} from './builder.js';
import {getRecipe,resolveSpec,applyRecipeStep} from './recipes.js';
import {compileModel,locate,parseRegion} from './csg.js';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const title={cylinder:'Cylinder',sphere:'Sphere',box:'Box',hexprism:'Hexagonal prism',pin:'Fuel pin',lattice:'Lattice',universe:'Universe',boolean:'Combine cells',place:'Place universe',boundary:'Model boundary',move:'Move cells',group:'Make universe'};
const field=(name,label,value,type='number')=>'<label class="build-field">'+label+'<input name="'+name+'" type="'+type+'" '+(type==='number'?'step="any"':'')+' value="'+esc(value)+'" required></label>';
const option=(v,label,current)=>'<option value="'+v+'"'+(String(v)===String(current)?' selected':'')+'>'+esc(label)+'</option>';
 const select=(name,label,html)=>'<div class="build-field"><label for="build-'+name+'">'+label+'</label><select id="build-'+name+'" name="'+name+'">'+html+'</select></div>';
const xyz=(prefix,values,labels=['X','Y','Z'])=>'<div class="build-grid three">'+values.map((v,i)=>field(prefix+i,labels[i]+' - cm',v)).join('')+'</div>';
export function booleanArt(op){return '<svg viewBox="0 0 100 60" aria-hidden="true"><defs><clipPath id="clip-'+op+'"><circle cx="61" cy="30" r="22"/></clipPath><mask id="mask-'+op+'"><rect width="100" height="60" fill="white"/><circle cx="61" cy="30" r="22" fill="black"/></mask></defs><g stroke="#a9acb7" fill="none"><circle cx="39" cy="30" r="22"/><circle cx="61" cy="30" r="22"/></g><g fill="#7379e8" stroke="none">'+(op==='union'?'<circle cx="39" cy="30" r="22"/><circle cx="61" cy="30" r="22"/>':'<circle cx="39" cy="30" r="22" '+(op==='intersection'?'clip-path="url(#clip-'+op+')"':'mask="url(#mask-'+op+')"')+'/>')+'</g></svg>';}

export function installConstruction(api){
 const {state,mutate,selected,notice,openModel,save,renderEditor,finishTransaction}=api;
 let tool=null,preview=null,previewFrame=0;
 const materials=(value)=>option('','Void',value??'')+state.model.materials.map(m=>option(m.id,m.name,value)).join('');
 const universes=(value,predicate=()=>true)=>state.model.universes.filter(predicate).map(u=>option(u.id,u.name+' - U'+u.id,value)).join('');
 const input=name=>$('build-form').elements.namedItem(name);
 const value=name=>input(name)?.value;
 const num=name=>Number(value(name));
 const mat=name=>value(name)===''?null:num(name);
 const selectionIds=()=>state.multi?.length?state.multi:(state.model.selection?.kind==='cell'?[state.model.selection.id]:[]);
 function scopeCells(m,ids){
  if(state.scope!=='occurrence'||!state.occurrence?.path?.length||state.clonedOccurrence===state.model.selection.id)return ids;
  const result=cloneOccurrence(m,state.occurrence.path,state.model.selection.id);m.selection={kind:'cell',id:result.cellId};m.focus={universe:m.cells.find(c=>c.id===result.cellId).universe,path:result.path};return ids.map(id=>result.cellMap.get(id)||id);
 }

 function defaults(type){
  const m=state.model,x=selected(),u=m.universes.find(u=>u.id===m.focus.universe),b=u.bounds;
  if(type==='pin')return {name:'Fuel pin',pitch:1.26,height:30,coolant:4,layers:[{name:'Fuel',radius:.41,material:1},{name:'Gap',radius:.418,material:2},{name:'Cladding',radius:.475,material:3}]};
  if(type==='lattice'){
   const fill=x?.fill!=null&&m.universes.some(u=>u.id===x.fill)?x.fill:m.selection?.kind==='universe'&&x.id!==0?x.id:m.universes.find(u=>u.id!==0)?.id;
   const bounds=m.universes.find(u=>u.id===fill)?.bounds||[-.63,.63,-.63,.63,-15,15];return {name:'Assembly',type:'rectangular',fill,columns:17,rows:17,levels:1,rings:3,pitch:bounds[1]-bounds[0],pitchY:bounds[3]-bounds[2],height:bounds[5]-bounds[4],outerMaterial:4,pattern:'all'};
  }
  if(type==='boolean'){const cells=m.cells.filter(c=>c.universe===(x?.universe??m.focus.universe)&&!c.background&&c.fill==null),ids=selectionIds();return {a:ids[0]??cells[0]?.id,b:ids[1]??cells.find(c=>c.id!==(ids[0]??cells[0]?.id))?.id,operation:'difference',name:x?.name||'Combined cell',material:x?x.material:cells[0]?.material,keepTool:false};}
  if(type==='place')return {name:'',fill:m.universes.find(u=>u.id!==m.focus.universe)?.id,target:m.focus.universe,position:[0,0,0]};
  if(type==='boundary')return {bounds:[...b],material:m.cells.find(c=>c.id===u.domain?.cell)?.material??null,boundary:u.domain?.boundary||'vacuum',auto:u.domain?.auto??true};
  if(type==='move')return {position:selectionIds().length>1?[0,0,0]:selected()?.editorTranslation||selected()?.translation||[0,0,0],relative:selectionIds().length>1};
  if(type==='group')return {name:'Component'};
  return {name:title[type]||'Cell',radius:.6,height:2,width:2,size:[1.6,1.6,2],position:[0,0,0],material:type==='universe'?4:1,axis:'z',target:m.focus.universe};
 }
 function layerRows(layers){return layers.map((l,i)=>'<div class="layer-row" data-layer="'+i+'"><input name="layer-name-'+i+'" aria-label="Layer '+(i+1)+' name" value="'+esc(l.name)+'" required><input name="layer-radius-'+i+'" aria-label="Layer '+(i+1)+' outer radius" type="number" step=".001" min=".001" value="'+l.radius+'" required><select name="layer-material-'+i+'" aria-label="Layer '+(i+1)+' material">'+materials(l.material)+'</select><button type="button" data-remove-layer="'+i+'" aria-label="Remove layer '+(i+1)+'">&times;</button></div>').join('');}
 function formHTML(t,s){
  let html='';
  if(!['boolean','boundary','move','place'].includes(t))html+=field('name','Name',s.name,'text');
  if(['cylinder','sphere','box','hexprism'].includes(t)){
   html+='<div class="build-grid">'+(t==='sphere'||t==='cylinder'?field('radius','Radius - cm',s.radius):'')+(t==='cylinder'||t==='hexprism'?field('height','Height - cm',s.height):'')+(t==='hexprism'?field('width','Across flats - cm',s.width):'')+'</div>';
   if(t==='box')html+=xyz('size-',s.size,['Width X','Depth Y','Height Z']);
   if(t==='cylinder')html+=select('axis','Axis',['x','y','z'].map(a=>option(a,a.toUpperCase(),s.axis)).join(''));
   html+=select('material','Material',materials(s.material))+'<h3>Position</h3>'+xyz('position-',s.position||[0,0,0]);
  }
  if(t==='pin')html+='<div class="build-grid">'+field('pitch','Pitch - cm',s.pitch)+field('height','Height - cm',s.height)+'</div><div class="layer-head"><span>Layer</span><span>Outer r - cm</span><span>Material</span></div><div id="build-layers">'+layerRows(s.layers)+'</div><button type="button" id="add-layer" class="subtle">+ Add layer</button>'+select('coolant','Outside layers',materials(s.coolant));
  if(t==='universe')html+=select('material','Fill material',materials(s.material));
  if(t==='lattice'){
   const owner=tool.context.editLattice!=null?state.model.cells.find(c=>c.fill===tool.context.editLattice)?.universe:null;
   const fills=universes(s.fill,u=>u.id!==0&&(owner==null||canContain(state.model,u.id,owner)));html+=select('fill','Repeat universe',fills||'<option value="">Create a pin or universe first</option>');
   html+=select('lattice-type','Layout',option('rectangular','Rectangular',s.type)+option('hexagonal','Hexagonal',s.type));
   html+='<div data-lattice-shape="rectangular"'+(s.type==='hexagonal'?' hidden':'')+'><div class="build-grid three">'+field('columns','Columns',s.columns||3)+field('rows','Rows',s.rows||s.columns||3)+field('levels','Axial levels',s.levels||1)+'</div><div class="build-grid">'+field('pitch','Pitch X - cm',s.pitch)+field('pitch-y','Pitch Y - cm',s.pitchY||s.pitch)+'</div></div>';
   html+='<div data-lattice-shape="hexagonal"'+(s.type!=='hexagonal'?' hidden':'')+'><div class="build-grid">'+field('rings','Rings',s.rings||3)+field('hex-pitch','Pitch - cm',s.pitch)+'</div>'+select('orientation','Orientation',option('x','X',s.orientation||'x')+option('y','Y',s.orientation||'x'))+'</div>';
   html+=field('height','Height - cm',s.height)+(s.outer!=null?select('outer','Outer universe',universes(s.outer,u=>u.id!==0&&(owner==null||canContain(state.model,u.id,owner)))):select('outer-material','Outer material',materials(s.outerMaterial??4)));
   html+=select('pattern','Pattern',[['all','All positions'],['pwr-guides','PWR 17 x 17 guide tubes'],['bwr-channel','BWR 9 x 9 water channel'],['round','Circular core'],...(s.pattern==='beavrs'?[['beavrs','Published core map']]:[])].map(([v,l])=>option(v,l,s.pattern||'all')).join(''));
   if(tool.context.editLattice!=null)html+='<label class="build-check"><input name="preserve-map" type="checkbox" checked> Keep painted positions</label>';
  }
  if(t==='boolean'){
   const cells=state.model.cells.filter(c=>!c.background&&c.fill==null&&c.universe===(selected()?.universe??state.model.focus.universe)),opts=v=>cells.map(c=>option(c.id,c.name+' - C'+c.id,v)).join('');
   html+='<div class="build-grid">'+select('a','Cell A',opts(s.a))+select('b','Cell B',opts(s.b))+'</div><div class="boolean-choices" role="group" aria-label="Boolean operation">'+[['union','Union','A or B'],['intersection','Intersection','A and B'],['difference','Subtract','A minus B']].map(([v,l,h])=>'<button type="button" data-operation="'+v+'" aria-pressed="'+(s.operation===v)+'">'+booleanArt(v)+'<strong>'+l+'</strong><span>'+h+'</span></button>').join('')+'</div>'+field('name','Result name',s.name,'text')+select('material','Result material',materials(s.material))+'<label class="build-check"><input name="keep-tool" type="checkbox"'+(s.keepTool?' checked':'')+'> Keep cell B</label><p id="boolean-effect" class="hint"></p>';
  }
  if(t==='place')html+=select('fill','Universe',universes(s.fill,u=>canContain(state.model,u.id,s.target??state.model.focus.universe)))+xyz('position-',s.position||[0,0,0]);
  if(t==='boundary'){
   html+='<div class="build-grid">'+s.bounds.map((v,i)=>field('bound-'+i,'XYZ'[i>>1]+(i%2?' max':' min')+' - cm',v)).join('')+'</div>'+select('boundary','Boundary condition',['vacuum','reflective','white','transmission'].map(v=>option(v,v,s.boundary)).join(''))+select('material','Background material',materials(s.material))+'<label class="build-check"><input name="auto-boundary" type="checkbox"'+(s.auto?' checked':'')+'> Fit boundary to geometry</label>';
  }
  if(t==='move')html+='<p class="hint">'+(s.relative?'Offset from current positions':'Position of the selected cell')+'</p>'+xyz('position-',s.position);
  if(!tool.context.recipe&&!['boolean','move','group','boundary'].includes(t)&&!tool.context.editPin&&tool.context.editLattice==null){
   html+=select('target','Add to universe',universes(s.target??state.model.focus.universe,u=>t!=='place'||canContain(state.model,s.fill,u.id)));
   if(['pin','universe','lattice'].includes(t))html+='<label class="build-check"><input name="place" type="checkbox"'+(s.place===false?'':' checked')+'> Place in geometry</label>';
  }
  if(tool.context.replace!=null)html+='<p class="hint">Replaces the selected placement.</p>';
  return html;
 }
 function open(type,initial={},context={}){
  finishTransaction();if(!state.model)openModel(createEmptyModel());
  if(!state.model.materials.length){recipes(state.model);save();}
  tool={type,spec:{...defaults(type),...structuredClone(initial)},context,ids:selectionIds()};
  $('add-dialog').close();$('build-title').textContent=title[type]||'Create geometry';$('build-fields').innerHTML=formHTML(type,tool.spec);$('build-submit').textContent=context.recipe?'Add step':context.editPin?'Apply layers':context.editLattice!=null?'Apply lattice':type==='boolean'?'Apply '+(tool.spec.operation==='difference'?'subtraction':tool.spec.operation):['move','boundary'].includes(type)?'Apply':type==='group'?'Make universe':'Create '+(type==='place'?'placement':title[type].toLowerCase());
  $('build-dialog').showModal();$('build-form').querySelector('input,select,button')?.focus();updatePreview();
 }
 function read(){
  const t=tool.type,s={...tool.spec};s.name=value('name')??s.name;s.target=input('target')?num('target'):(s.target??state.model.focus.universe);
  if(['cylinder','sphere','box','hexprism'].includes(t)){s.type=t;s.material=mat('material');s.position=[0,1,2].map(i=>num('position-'+i));s.radius=num('radius');s.height=num('height');s.width=num('width');s.size=[0,1,2].map(i=>num('size-'+i));s.axis=value('axis')||'z';s.universe=s.target;}
  if(t==='pin'){s.pitch=num('pitch');s.height=num('height');s.coolant=mat('coolant');s.layers=[...$('build-layers').children].map(row=>{const i=row.dataset.layer;return {name:value('layer-name-'+i),radius:num('layer-radius-'+i),material:mat('layer-material-'+i)};});}
  if(t==='universe')s.material=mat('material');
  if(t==='lattice'){s.type=value('lattice-type');s.fill=num('fill');s.columns=num('columns');s.rows=num('rows');s.levels=num('levels');s.rings=num('rings');s.pitch=num(s.type==='hexagonal'?'hex-pitch':'pitch');s.pitchY=num('pitch-y');s.orientation=value('orientation');s.height=num('height');if(input('outer'))s.outer=num('outer');else s.outerMaterial=mat('outer-material');s.pattern=value('pattern');}
  if(t==='boolean'){s.a=num('a');s.b=num('b');s.material=mat('material');s.keepTool=input('keep-tool').checked;}
  if(t==='place'){s.fill=num('fill');s.position=[0,1,2].map(i=>num('position-'+i));}
  if(t==='boundary'){s.bounds=[0,1,2,3,4,5].map(i=>num('bound-'+i));s.boundary=value('boundary');s.material=mat('material');s.auto=input('auto-boundary').checked;}
  if(t==='move')s.position=[0,1,2].map(i=>num('position-'+i));
  s.preserveMap=input('preserve-map')?.checked??false;s.place=input('place')?.checked??true;return s;
 }
 function execute(m,s){
  const t=tool.type,ctx=tool.context;let id;
  if(ctx.recipe){const recipe=m.recipe,step=getRecipe(recipe.id)[recipe.step];id=applyRecipeStep(m,step,s);recipe.refs[step.key]=id;recipe.step++;return id;}
  if(['move','boolean','group'].includes(t)){
   const ids=scopeCells(m,t==='boolean'?[s.a,s.b]:tool.ids);
   if(t==='move'){for(const id of ids){const c=m.cells.find(c=>c.id===id);if(c&&!c.background)translateCell(m,c,s.relative?(c.editorTranslation||c.translation||[0,0,0]).map((v,i)=>v+s.position[i]):s.position);}syncDomains(m);return;}
   if(t==='boolean')return combineCells(m,{...s,a:ids[0],b:ids[1]});
   return groupCells(m,ids,s.name);
  }
  if(t==='boundary'){
   if(s.bounds.some((v,i)=>!Number.isFinite(v)||(i%2&&v<=s.bounds[i-1])))throw new Error('Each maximum must be greater than its minimum.');
   if(!s.auto)for(const c of m.cells.filter(c=>c.universe===m.focus.universe&&!c.background)){const b=getCellBounds(m,c);if(b.every(v=>Math.abs(v)<1e5)&&b.some((v,i)=>i%2?v>s.bounds[i]+1e-8:v<s.bounds[i]-1e-8))throw new Error('The boundary must enclose '+c.name+'. Resize the cell or use Fit boundary.');}
   const u=m.universes.find(u=>u.id===m.focus.universe);enableDomain(m,u.id,s.material,s.boundary);u.bounds=s.bounds;u.domain.auto=s.auto;u.domain.boundary=s.boundary;m.cells.find(c=>c.id===u.domain.cell).material=s.material;syncDomains(m);return;
  }
  const target=s.target??m.focus.universe;
  if(ctx.editPin==null&&ctx.editLattice==null&&(!m.cells.some(c=>c.universe===target)||target===(m.rootUniverse??0)))enableDomain(m,target,null);
  if(['cylinder','sphere','box','hexprism'].includes(t))return createCell(m,s);
  if(t==='pin')id=createPin(m,s,ctx.editPin);
  if(t==='universe')id=createUniform(m,s);
  if(t==='lattice')id=createLattice(m,s,ctx.editLattice);
  if(ctx.editPin!=null||ctx.editLattice!=null){focusUniverse(m,id);if(ctx.editLattice!=null){m.selection={kind:'lattice',id:ctx.editLattice};m.view='layout';}return id;}
  if(t==='place')id=s.fill;
  if(s.place){const placed=placeUniverse(m,id,{target,position:s.position||[0,0,0],replace:ctx.replace});return placed;}
  focusUniverse(m,id);return id;
 }
 function drawPreview(m){
  const canvas=$('build-preview'),ctx=canvas.getContext('2d'),w=280,h=260;canvas.width=w;canvas.height=h;const compiled=compileModel(m),b=m.universes.find(u=>u.id===m.focus.universe).bounds;
  const scale=Math.max((b[1]-b[0])/w,(b[3]-b[2])/h)*1.12,cx=(b[0]+b[1])/2,cy=(b[2]+b[3])/2,z=(b[4]+b[5])/2,image=ctx.createImageData(w,h),colors=new Map(m.materials.map(x=>[x.id,parseInt(x.color.slice(1),16)]));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const hit=locate(compiled,[cx+(x-w/2)*scale,cy+(h/2-y)*scale,z]),c=hit?.cell;const color=c?(c.material==null?0x343740:colors.get(c.material)||0x9b9da2):0x17191e,i=(y*w+x)*4;image.data[i]=color>>16&255;image.data[i+1]=color>>8&255;image.data[i+2]=color&255;image.data[i+3]=255;}ctx.putImageData(image,0,0);
  canvas.dataset.cells=m.cells.length;$('preview-scale').textContent=(b[1]-b[0]).toFixed(3)+' x '+(b[3]-b[2]).toFixed(3)+' cm';
 }
 function updatePreview(){
  cancelAnimationFrame(previewFrame);previewFrame=requestAnimationFrame(()=>{
   if(!tool)return;try{const spec=read();preview=structuredClone(state.model);execute(preview,spec);
    if(tool.type==='boolean'){
     const c=preview.cells.find(c=>c.id===preview.selection.id);preview.isolated=c.id;preview.cells=preview.cells.filter(x=>x.universe!==c.universe||x.id===c.id);
     input('keep-tool').disabled=spec.operation!=='difference';$('boolean-effect').textContent=spec.operation==='difference'&&spec.keepTool?'Cell A is cut. Cell B stays.':'The result replaces cells A and B.';
    }
    drawPreview(preview);const overlaps=['cylinder','sphere','box','hexprism'].includes(tool.type)?geometryDiagnostics(preview).filter(x=>x.kind==='overlap'):[];$('build-error').textContent=overlaps.length?'Overlapping cells. Use Combine after creating, or change the position.':'';$('build-preview').removeAttribute('aria-invalid');
   }catch(error){preview=null;$('build-error').textContent=error.message;$('build-preview').setAttribute('aria-invalid','true');}
  });
 }
 $('build-form').addEventListener('input',updatePreview);
 $('build-form').addEventListener('change',e=>{
  if(e.target.name==='a'&&tool.type==='boolean'){const c=state.model.cells.find(c=>c.id===num('a'));if(c){input('name').value=c.name;input('material').value=c.material??'';}}
  if(e.target.name==='lattice-type')document.querySelectorAll('[data-lattice-shape]').forEach(el=>el.hidden=el.dataset.latticeShape!==e.target.value);
  if(e.target.name==='fill'&&tool.type==='lattice'){const b=state.model.universes.find(u=>u.id===num('fill'))?.bounds;if(b){input('pitch').value=b[1]-b[0];input('pitch-y').value=b[3]-b[2];input('hex-pitch').value=b[1]-b[0];input('height').value=b[5]-b[4];}}
  updatePreview();
 });
 $('build-form').onsubmit=e=>{e.preventDefault();try{const s=read(),draft=structuredClone(state.model);execute(draft,s);state.multi=[];state.occurrence=null;state.scope='shared';if(!mutate(m=>Object.assign(m,draft),{fit:true}))return;$('build-dialog').close();renderGuide();notice(tool.type==='boolean'?'Cells combined. Undo to restore operands.':tool.type==='move'?'Cells moved.':'Geometry updated.');}catch(error){$('build-error').textContent=error.message;}};
 $('build-dialog').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.operation){tool.spec.operation=b.dataset.operation;$('build-submit').textContent='Apply '+(tool.spec.operation==='difference'?'subtraction':tool.spec.operation);$('build-form').querySelectorAll('[data-operation]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));updatePreview();}
  if(b.id==='add-layer'||b.dataset.removeLayer!=null){const s=read();if(b.id==='add-layer')s.layers.push({name:'Layer '+(s.layers.length+1),radius:(s.layers.at(-1)?.radius||0)+.02,material:3});else s.layers.splice(Number(b.dataset.removeLayer),1);$('build-layers').innerHTML=layerRows(s.layers);updatePreview();}
 });
 function addMenu(){
  $('add-target').textContent='In '+(state.model.universes.find(u=>u.id===state.model.focus.universe)?.name||'Geometry');$('add-dialog').showModal();
 }
 function runAction(action){
  const ids=selectionIds(),x=selected();
  if(action==='delete'){if(!ids.length)return;state.multi=[];mutate(m=>{deleteCells(m,scopeCells(m,ids));state.occurrence=null;});notice('Cells deleted. Ctrl+Z to restore.');}
  if(action==='duplicate'){if(!ids.length)return;const c=state.model.cells.find(c=>c.id===ids[0]),b=getCellBounds(state.model,c),offset=Math.min(100,Math.max(.2,b[1]-b[0]+.1));mutate(m=>{state.multi=duplicateCells(m,scopeCells(m,ids),[offset,0,0]);state.occurrence=null;},{fit:true});}
  if(action==='move')open('move');if(action==='boolean')open('boolean');if(action==='group')open('group');
  if(action==='repeat'){
   if(x?.fill!=null&&state.model.universes.some(u=>u.id===x.fill))open('lattice',{}, {replace:x.id});
   else if(state.model.selection?.kind==='universe'&&x.id!==0){const placement=state.model.cells.find(c=>c.fill===x.id&&c.universe===(state.model.rootUniverse??0));open('lattice',{target:state.model.rootUniverse??0},{replace:placement?.id});}
   else if(ids.length){mutate(m=>groupCells(m,ids,selected()?.name||'Component'));open('lattice',{}, {replace:state.model.selection.id});}
  }
 }
 function renderGuide(){
  const recipe=state.model?.recipe,pane=$('recipe-guide');if(!recipe){pane.hidden=true;return;}pane.hidden=false;const steps=getRecipe(recipe.id),t=STARTERS.find(t=>t.id===recipe.id),step=steps[recipe.step];
  pane.innerHTML='<div class="guide-heading"><strong>'+esc(t?.name||'Build geometry')+'</strong><button id="close-guide" class="icon" aria-label="Close build guide">&times;</button></div><ol class="guide-steps">'+steps.map((s,i)=>'<li '+(i===recipe.step?'aria-current="step"':'')+'><span class="step-number">'+(i<recipe.step?'✓':i+1)+'</span><span>'+esc(s.title)+'</span></li>').join('')+'</ol>'+(step?'<button id="next-recipe" class="button primary">'+esc(step.title)+'</button>':'<button id="finish-recipe" class="button">Edit geometry</button>');
 }
 function startRecipe(id){const m=createEmptyModel(STARTERS.find(x=>x.id===id).name);recipes(m);m.recipe={id,step:0,refs:{}};openModel(m);renderGuide();}
 function nextRecipe(){const r=state.model.recipe,step=getRecipe(r.id)[r.step];if(!step)return;const spec=resolveSpec(step.spec,r.refs);open(step.type,spec,{recipe:true});}
 function showHelp(){
  $('message-title').textContent='Build geometry';$('message-content').innerHTML='<div class="help-path"><button data-build="pin">'+api.art('pin')+'<strong>1. Create a pin</strong><span>Set layers and materials</span></button><button data-build="lattice">'+api.art('pwr17')+'<strong>2. Repeat in a lattice</strong><span>Set pitch and paint positions</span></button><button data-help-recipes>'+api.art('pwr-core')+'<strong>3. Build a core</strong><span>Follow an example step by step</span></button></div><h3>CSG</h3><div class="help-booleans">'+['union','intersection','difference'].map(op=>'<button data-open-boolean="'+op+'">'+booleanArt(op)+'<span>'+({union:'Union',intersection:'Intersection',difference:'Subtract'}[op])+'</span></button>').join('')+'</div><p class="hint">Select two cells in one universe. Combine their regions, then assign the result a material.</p><details><summary>OpenMC and DAGMC</summary><p class="hint">This editor builds OpenMC CSG regions. DAGMC uses a watertight CAD surface mesh in an .h5m file. CAD import and meshing are not implemented here.</p><a href="https://docs.openmc.org/en/stable/usersguide/geometry.html" target="_blank" rel="noopener">OpenMC geometry guide</a> / <a href="https://svalinn.github.io/DAGMC/usersguide/index.html" target="_blank" rel="noopener">DAGMC workflow</a></details>';$('message-dialog').showModal();
 }
 function showRecipes(){
  $('message-title').textContent='Build an example';$('message-content').innerHTML='<div class="recipe-list">'+STARTERS.map(t=>'<button data-recipe="'+t.id+'">'+api.art(t.id)+'<span>'+esc(t.name)+'</span><span class="muted">'+getRecipe(t.id).length+' steps</span></button>').join('')+'</div>';$('message-dialog').showModal();
 }
 function checkGeometry(){
  const m=state.model,issues=validateModel(m);let spatial=[];try{spatial=geometryDiagnostics(m);}catch(error){issues.push(error.message);}
  $('message-title').textContent='Check geometry';$('message-content').innerHTML=issues.map(x=>'<p class="validation-error">'+esc(x)+'</p>').join('')+spatial.map(x=>'<div class="diagnostic"><strong>'+esc(x.kind==='overlap'?'Overlap: '+x.message:x.message)+'</strong>'+(x.cells?'<button class="button" data-diagnostic-cells="'+x.cells.join(',')+'">Select cells</button>':'<button class="button" data-build="boundary">Set background</button>')+'</div>').join('')+'<p class="hint">'+(!issues.length&&!spatial.length?'No issues found in the sampled points. ':'')+'Checked the current universe on an 18 x 18 x 18 grid. Run OpenMC geometry debugging before transport.</p>';$('message-dialog').showModal();
 }
 function editPin(id){
  const m=state.model,u=m.universes.find(u=>u.id===id),cs=m.cells.filter(c=>c.universe===id),layers=cs.map(c=>{const ref=(c.region.match(/-\d+/g)||[]).map(v=>m.surfaces.find(s=>s.id===-Number(v))).find(s=>s?.type==='z-cylinder');return ref?{name:c.name,radius:ref.params.r,material:c.material}:null;}).filter(Boolean).sort((a,b)=>a.radius-b.radius);
  open('pin',{name:u.name,pitch:u.bounds[1]-u.bounds[0],height:u.bounds[5]-u.bounds[4],layers,coolant:cs.find(c=>c.background||c.name==='Moderator')?.material??4},{editPin:id});
 }
 function editLattice(id){
  const m=state.model,l=m.lattices.find(l=>l.id===id),u=m.universes.find(u=>u.id===m.cells.find(c=>c.fill===id)?.universe);
  open('lattice',{name:l.name,type:l.type,fill:l.cells[0].universe,columns:l.dimension?.[0]||3,rows:l.dimension?.[1]||3,levels:l.dimension?.[2]||1,rings:l.rings||3,pitch:l.pitch[0],pitchY:l.pitch[1]||l.pitch[0],height:u.bounds[5]-u.bounds[4],outer:l.outer,orientation:l.orientation,pattern:'all'},{editLattice:id});
 }
 function regionTree(c){
  let t;try{t=parseRegion(c.region);}catch{return '';}
  function render(t,path=''){if(!t)return '<span class="hint">All space</span>';if(t.op==='surface'){const s=state.model.surfaces.find(s=>s.id===t.id);return '<button class="region-chip" data-region-side="'+path+'" '+(c.background?'disabled':'')+' title="Switch half-space"><span>'+esc(s?.name||'S'+t.id)+'</span><strong>'+(['sphere','x-cylinder','y-cylinder','z-cylinder'].includes(s?.type)?(t.negative?'inside':'outside'):(t.negative?'negative':'positive'))+'</strong></button>';}
   const children=[];function flatten(n,p){if(n.op===t.op&&n.op!=='not'){flatten(n.a,p+'a');flatten(n.b,p+'b');}else children.push(render(n,p));}if(t.op==='not')children.push(render(t.a,path+'a'));else{flatten(t.a,path+'a');flatten(t.b,path+'b');}
   return '<div class="region-group"><span class="region-op">'+({and:'All of',or:'Any of',not:'Outside'}[t.op])+'</span>'+children.join('')+'</div>';}
  return '<div class="region-builder">'+render(t)+'</div>';
 }
 function renderActions(){
  const m=state.model,x=selected(),ids=selectionIds(),cs=m.cells.filter(c=>ids.includes(c.id)&&!c.background),enabled=!!cs.length,combine=m.cells.filter(c=>c.universe===(x?.universe??m.focus.universe)&&!c.background&&c.fill==null).length>=2;
  $('cell-tools').hidden=!enabled;$('combine-cells').disabled=!combine;$('drag-cell').hidden=!enabled||m.view!=='3d';
  $('selection-count').textContent=ids.length>1?ids.length+' cells':x?.name||'';
  renderGuide();
 }
 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.build){b.closest('dialog')?.close();open(b.dataset.build);}
  if(b.dataset.action)runAction(b.dataset.action);
  if(b.id==='build-help')showHelp();if(b.id==='build-examples'||b.hasAttribute('data-help-recipes')||b.hasAttribute('data-show-recipes')){b.closest('dialog')?.close();showRecipes();}
  if(b.dataset.recipe){$('message-dialog').close();startRecipe(b.dataset.recipe);}
  if(b.id==='next-recipe')nextRecipe();
  if(b.id==='close-guide'||b.id==='finish-recipe'){delete state.model.recipe;save();renderGuide();}
  if(b.dataset.openBoolean){$('message-dialog').close();open('boolean',{operation:b.dataset.openBoolean});}
  if(b.dataset.editPin)editPin(Number(b.dataset.editPin));
  if(b.dataset.editLattice)editLattice(Number(b.dataset.editLattice));
  if(b.dataset.regionSide!=null){if(selected().background)return;mutate(m=>{const [id]=scopeCells(m,[selected().id]),c=m.cells.find(c=>c.id===id),t=parseRegion(c.region);let node=t;for(const key of b.dataset.regionSide)node=node[key];node.negative=!node.negative;c.region=serializeRegion(t);c.builderPlacement=false;state.occurrence=null;state.scope='shared';});}
  if(b.dataset.diagnosticCells){state.multi=b.dataset.diagnosticCells.split(',').map(Number);state.model.selection={kind:'cell',id:state.multi[0]};$('message-dialog').close();renderEditor();}
 });
 document.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]')||state.page!=='editor')return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();runAction('delete');}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();runAction('duplicate');}
  if(e.key.toLowerCase()==='m')runAction('move');
 });
 $('add').onclick=addMenu;$('add-first').onclick=addMenu;$('validate').onclick=checkGeometry;
 $('drag-cell').onclick=()=>{const enabled=$('drag-cell').getAttribute('aria-pressed')!=='true';$('drag-cell').setAttribute('aria-pressed',String(enabled));state.viewer.setMoveEnabled(enabled);};
 return {open,addMenu,renderActions,regionTree,runAction,renderGuide,showRecipes,checkGeometry};
}
