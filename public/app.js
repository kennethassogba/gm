import {generalArt} from './example-art.js';
import {installAssistant} from './assistant-ui.js';
import {installApp} from './install.js';
import {STARTERS,createEmptyModel,createModelForTemplate,addPrimitive,addComponent,translateCell,updateLatticePitch,nextId,cloneOccurrence,exportGeometryXML,exportMaterialsXML,exportPython,importGeometryXML,validateModel} from './model.js';
import {parseRegion} from './csg.js';
import {GeometryViewer} from './viewer.js';
import {installConstruction} from './construction-ui.js';
import {syncDomains,canContain,constructGeometry} from './builder.js';
const $=id=>document.getElementById(id),plainLabel=v=>String(v??'').replace(/[\u00b7\u2013\u2014]/g,'-'),esc=v=>plainLabel(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const state={model:null,page:'library',filter:'general',undo:[],redo:[],transaction:null,scope:'shared',occurrence:null,paint:null,selectedSurfaces:[],documents:[],viewer:null,renderPending:false,measure:null};
const STORAGE='gm.documents.v2';
try{state.documents=JSON.parse(localStorage.getItem(STORAGE)||'[]');const old=localStorage.getItem('gm.studio.model.v1');if(!state.documents.length&&old)state.documents.push(JSON.parse(old));}catch{notice('Local storage unavailable. Export a copy before closing.');}
function notice(text){$('notice').querySelector('span').textContent=text;$('notice').classList.add('visible');}
$('dismiss-notice').onclick=()=>$('notice').classList.remove('visible');
function save(){if(!state.model)return;const i=state.documents.findIndex(x=>x.id===state.model.id);if(i<0)state.documents.unshift(structuredClone(state.model));else state.documents[i]=structuredClone(state.model);state.documents=state.documents.slice(0,15);try{localStorage.setItem(STORAGE,JSON.stringify(state.documents));$('saved').textContent='Saved';updateHistory();}catch{$('saved').textContent='Not saved';notice('Export a copy: this browser could not save the model.');}}
function history(){state.undo.push(structuredClone(state.model));if(state.undo.length>60)state.undo.shift();state.redo=[];updateHistory();}
function updateHistory(){$('undo').disabled=!(state.undo.length||(state.transaction&&JSON.stringify(state.transaction)!==JSON.stringify(state.model)));$('redo').disabled=!state.redo.length;}
function redraw(fit=false){if(state.renderPending&&!fit)return;state.renderPending=true;requestAnimationFrame(()=>{state.renderPending=false;try{state.model.selectedIds=state.multi||[];state.viewer?.update(state.model,{fit});}catch(error){notice(error.message+' Undo the last change or edit the region.');}});}
function mutate(fn,{record=true,ui=true,fit=false}={}){const before=structuredClone(state.model);try{fn(state.model);syncDomains(state.model);}catch(error){state.model=before;notice(error.message);return false;}if(record&&!state.transaction){state.undo.push(before);if(state.undo.length>60)state.undo.shift();state.redo=[];}save();if(ui)renderEditor(fit);else redraw(fit);updateHistory();window.dispatchEvent(new CustomEvent('gm:modelchange',{detail:{model:structuredClone(state.model)}}));return true;}
function undo(){finishTransaction();state.multi=[];if(!state.undo.length)return;state.redo.push(structuredClone(state.model));state.model=state.undo.pop();state.occurrence=null;save();renderEditor();updateHistory();}
function redo(){if(!state.redo.length)return;state.multi=[];state.undo.push(structuredClone(state.model));state.model=state.redo.pop();state.occurrence=null;save();renderEditor();updateHistory();}
function normalize(m){
 m.focus??={universe:0,path:[]};m.view??='3d';
 const l=m.lattices?.[0],span=l?.dimension?l.dimension[0]*l.pitch[0]/2:(m.dimensions?.pitch||4)/2,h=m.dimensions?.height||30;
 for(const u of m.universes)u.bounds??=[-span,span,-span,span,-h/2,h/2];
 for(const c of m.cells)if(c.fill!=null)c.fill=Number(c.fill);for(const lattice of m.lattices||[])if(lattice.type==='hexagonal')lattice.cells=lattice.cells.map(e=>({...e,universe:e.universe??lattice.sharedUniverse??1}));
 return m;
}
function renderFraming({available,detail,span,cutaway}){
 $('pin-detail').hidden=!available||(state.model.view!=='3d'&&!$('view-host').classList.contains('split'));$('pin-detail').textContent=detail?'Full length':'Pin detail';
 $('pin-detail').title=detail?'Show the complete pin':'Show a short section with visible layers';
 $('view-3d-label').textContent=detail?'3D - '+span.toFixed(2)+' cm section':'3D';
 $('cut').setAttribute('aria-pressed',String(cutaway));
}
function openModel(m){state.model=normalize(structuredClone(m));state.multi=[];state.paint=null;state.undo=[];state.redo=[];state.occurrence=null;state.clonedOccurrence=null;state.scope='shared';state.page='editor';$('library').hidden=true;$('editor').hidden=false;$('editor').dataset.pane='view';$('export').disabled=false;$('validate').hidden=false;
 if(!state.viewer)state.viewer=new GeometryViewer($('view-host'),selectFromView,focusFromView,notice,renderFraming,delta=>{finishTransaction();mutate(m=>{applyScope(null);for(const id of state.multi?.length?state.multi:[m.selection.id]){const c=m.cells.find(c=>c.id===id);if(c&&!c.background)translateCell(m,c,(c.editorTranslation||c.translation||[0,0,0]).map((v,i)=>v+delta[i]));}});});
 save();renderEditor();redraw(true);document.title=plainLabel(state.model.name)+' - GM';$('main').focus({preventScroll:true});}
function home(){state.page='library';$('library').hidden=false;$('editor').hidden=true;$('model-name').textContent='Models';$('validate').hidden=true;$('saved').textContent='';renderLibrary();document.title='GM OpenMC geometry studio';$('library').querySelector('h1').focus({preventScroll:true});}
function art(id){
 const general=generalArt(id);if(general)return general;
 const hex=['hex19','candu','fast-hex','htgr'].includes(id);let out='<svg viewBox="0 0 230 112" aria-hidden="true">';
 if(id==='pin'){out+='<circle cx="115" cy="56" r="34" fill="#60788f"/><circle cx="115" cy="56" r="28" fill="#6caaa9"/><circle cx="115" cy="56" r="23" fill="#d9dcd3"/><circle cx="115" cy="56" r="21" fill="#d99b58"/>';}
 else if(id==='takeda'){out+='<path d="m80 75 35 16 37-21V34l-35-16-37 21Z" fill="#858993"/><path d="m87 67 28 13 29-17V41l-29-13-28 17Z" fill="#d99b58"/><path d="m110 56 6 3 7-4V40l-7-3-6 4Z" fill="#17191e"/>';}
 else{const core=id.includes('core')||id==='beavrs'||id.startsWith('c5g7')||['candu','fast-hex','htgr'].includes(id),n=core?9:11,step=core?8:6;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const dx=x-(n-1)/2,dy=y-(n-1)/2;if(hex?Math.abs(dx)+Math.abs(dy)>n*.65:core&&Math.hypot(dx,dy)>n*.49)continue;const c=id.startsWith('c5g7')&&x>n/2?'#a191bf':((x+y)%9===0?'#60788f':'#d99b58');out+='<circle cx="'+(115+dx*step+(hex&&y%2?step/2:0))+'" cy="'+(56+dy*step*(hex?.86:1))+'" r="'+(core?2.7:2.2)+'" fill="'+c+'" />';}}
 return out+'</svg>';
}
function renderLibrary(){
 document.querySelectorAll('[data-filter]').forEach(b=>{const family=b.dataset.filter;b.setAttribute('aria-pressed',String(family===state.filter));b.querySelector('span').textContent=STARTERS.filter(x=>family==='all'||family==='general'&&['csg','transport'].includes(x.family)||family==='reactors'&&['components','architectures'].includes(x.family)||x.family===family).length;});
 const query=$('search').value.toLowerCase(),list=STARTERS.filter(x=>(state.filter==='all'||state.filter==='general'&&['csg','transport'].includes(x.family)||state.filter==='reactors'&&['components','architectures'].includes(x.family)||x.family===state.filter)&&x.name.toLowerCase().includes(query));
 $('models').innerHTML=list.map(x=>'<button class="model-card" data-open="'+x.id+'"><span class="art">'+art(x.id)+'</span><span class="card-name"><span>'+esc(x.name)+'</span>'+(x.family==='architectures'?'<span class="generic">Generic</span>':'<span class="arrow" aria-hidden="true">↗</span>')+'</span></button>').join('')||'<div class="hint">No matching models. <button id="clear-search" class="button">Clear search</button></div>';
 $('recent').innerHTML=state.documents[0]?'<button data-recent="'+esc(state.documents[0].id)+'">↶ '+esc(state.documents[0].name)+'</button>':'';
 $('category-title').textContent={all:'All examples',general:'CSG and transport',reactors:'Reactors',components:'Components',benchmarks:'Benchmarks',architectures:'Reactors'}[state.filter];
}
function selected(){const s=state.model?.selection;return s?state.model[{cell:'cells',surface:'surfaces',universe:'universes',lattice:'lattices',material:'materials'}[s.kind]]?.find(x=>x.id===s.id):null;}
function select(kind,id,path=[],additive=false){
 finishTransaction();state.clonedOccurrence=null;
 if(additive&&kind==='cell'){const universe=state.model.cells.find(c=>c.id===Number(id))?.universe;const ids=(state.multi?.length?[...state.multi]:state.model.selection?.kind==='cell'?[state.model.selection.id]:[]).filter(id=>state.model.cells.find(c=>c.id===id)?.universe===universe);state.multi=ids.includes(Number(id))?ids.filter(x=>x!==Number(id)):[...ids,Number(id)];}else state.multi=[];
 const m=state.model,previousFocus=JSON.stringify(m.focus);m.selection={kind,id:Number(id)};
 const x=selected();if(!x)return;state.occurrence=null;
 let universe;
 if(kind==='universe')universe=x.id;
 if(kind==='cell')universe=x.universe;
 if(kind==='lattice')universe=m.cells.find(c=>c.fill===x.id)?.universe;
 if(kind==='surface'){
  const owners=m.cells.filter(c=>(c.region.match(/[+-]?\d+/g)||[]).some(t=>Math.abs(Number(t))===x.id));
  universe=owners.find(c=>c.universe===m.focus.universe)?.universe??owners[0]?.universe;
 }
 if(universe!=null&&(kind==='universe'||universe!==m.focus.universe))m.focus={universe,path:kind==='universe'?structuredClone(path):[]};
 if(kind==='cell'&&m.focus.path?.length)state.occurrence={cell:x,path:structuredClone(m.focus.path)};
 else state.scope='shared';
 if(kind==='lattice'){m.view='layout';state.layoutLevel=0;state.paint=String(x.cells[0]?.universe??'');}else if(m.view==='layout')m.view='3d';
 if(m.isolated!=null)m.isolated=kind==='cell'&&x.fill==null?x.id:null;
 const focusChanged=previousFocus!==JSON.stringify(m.focus);
 if(focusChanged){const bounds=m.universes.find(u=>u.id===m.focus.universe)?.bounds,axis=m.view==='yz'?0:m.view==='xz'?1:2;if(bounds)m.section=(bounds[axis*2]+bounds[axis*2+1])/2;}
 renderEditor(focusChanged);save();
}
function selectFromView(hit){
 if(state.paint&&hit.path?.length){const step=hit.path.at(-1);mutate(m=>{m.lattices.find(l=>l.id===step.lattice).cells[step.index].universe=Number(state.paint);});return;}
 if(state.measure){const p=hit.worldPoint||hit.point;if(!state.measure.start){state.measure.start=p;notice('Select the second point.');}else{notice('Distance: '+Math.hypot(...p.map((v,i)=>v-state.measure.start[i])).toFixed(4)+' cm');state.measure=null;}return;}
 state.multi=hit.additive?[...new Set([...(state.multi?.length?state.multi:state.model.selection?.kind==='cell'?[state.model.selection.id]:[]),hit.cell.id])]:[];
 state.clonedOccurrence=null;state.occurrence=hit;state.model.selection={kind:'cell',id:hit.cell.id};renderTree();renderProperties();construction.renderActions();redraw();
}
function focusFromView(hit){
 const path=hit.path||[];if(!path.length){state.model.focus={universe:hit.universe,path:[]};}
 else{const current=state.model.focus.path?.length||0,step=path[Math.min(current,path.length-1)];state.model.focus={universe:step.universe,path:path.slice(0,Math.min(current+1,path.length))};}
 state.model.selection={kind:'universe',id:state.model.focus.universe};state.occurrence=null;renderEditor();redraw(true);
}
function treeButton(kind,x,extra=''){const s=state.model.selection,active=s?.kind===kind&&s.id===x.id,multi=kind==='cell'&&state.multi?.includes(x.id);return'<button class="tree-row '+extra+(multi?' multi-selected':'')+'" data-select="'+kind+'" data-id="'+x.id+'" aria-pressed="'+(active||multi)+'" title="'+esc(x.name)+(kind==='cell'?' - Shift-click to select multiple':'')+'"><span class="symbol" aria-hidden="true">'+({universe:'◇',cell:multi?'✓':'◈',lattice:'▦',surface:'⌒',material:''}[kind])+'</span><span>'+esc(x.name)+'</span><span class="id">'+({universe:'U',cell:'C',lattice:'L',surface:'S',material:'M'}[kind])+x.id+'</span></button>';}
function renderTree(){
 const m=state.model;
 const universeTree=u=>'<div class="tree-universe">'+treeButton('universe',u)+m.cells.filter(c=>c.universe===u.id).map(c=>treeButton('cell',c,'cell')).join('')+'</div>';
 const root=m.universes.find(u=>u.id===(m.rootUniverse??0)),components=m.universes.filter(u=>u!==root);
 $('tree').innerHTML=(root?universeTree(root):'')+(components.length?'<details open><summary>Universes</summary>'+components.map(universeTree).join('')+m.lattices.map(l=>treeButton('lattice',l)).join('')+'</details>':'');
 $('surfaces').innerHTML=m.surfaces.map(s=>treeButton('surface',s)).join('');
 const used=new Set(m.cells.map(c=>c.material));
 $('materials').innerHTML=m.materials.filter(x=>!x.preset||used.has(x.id)).map(x=>'<button class="tree-row" data-select="material" data-id="'+x.id+'"><span class="swatch" style="background:'+esc(x.color)+'"></span>'+esc(x.name)+'</button>').join('');
 $('counts').textContent=m.cells.length+' cells - '+m.universes.length+' universes';
}
function field(label,id,value,type='text'){return'<div class="field"><label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value)+'"></div>';}
function canFill(id,target){return canContain(state.model,id,target);}
function options(list,value,empty){return(empty?'<option value="">'+empty+'</option>':'')+list.map(x=>'<option value="'+x.id+'"'+(x.id===value?' selected':'')+'>'+esc(x.name)+' - '+x.id+'</option>').join('');}
function paramRow(s,key){
 const v=s.params[key],positive=key==='r',range=positive?Math.max(v*2,1):Math.max(Math.abs(v)*2,2),min=positive?.001:-range,label=key==='r'?'Radius':key,unit=key==='r'||['x0','y0','z0'].includes(key)?' - cm':'';
 return'<div class="dimension"><label for="param-'+s.id+'-'+key+'">'+esc(s.name)+' <span>'+label+unit+'</span></label><div class="numeric-row"><input type="range" aria-label="'+esc(s.name)+' '+label+'" data-surface="'+s.id+'" data-param="'+key+'" min="'+min+'" max="'+range+'" step=".001" value="'+v+'"><input id="param-'+s.id+'-'+key+'" type="number" aria-label="'+esc(s.name)+' '+label+' value" data-surface="'+s.id+'" data-param="'+key+'" step=".001"'+(positive?' min=".001"':'')+' value="'+v+'"></div></div>';
}
function scopeHTML(){return state.occurrence?.path?.length?'<div class="scope" role="group" aria-label="Editing scope"><label><input type="radio" name="scope" value="shared"'+(state.scope==='shared'?' checked':'')+'> Shared universe</label><label><input type="radio" name="scope" value="occurrence"'+(state.scope==='occurrence'?' checked':'')+'> This occurrence</label></div>':'';}
function renderProperties(){
 const m=state.model,s=m.selection,x=selected();$('property-title').textContent=plainLabel(x?.name)||'Properties';$('property-id').textContent=x?({cell:'C',surface:'S',universe:'U',lattice:'L',material:'M'}[s.kind])+x.id:'';
 if(!x){$('properties').innerHTML='<button id="property-add" class="button">+ Add geometry</button>';return;}
 let html=field('Name','item-name',x.name);
 if(s.kind==='cell'){
  const refs=[...new Set((x.region.match(/[+-]?\d+/g)||[]).map(t=>Math.abs(Number(t))))],ss=refs.map(id=>m.surfaces.find(x=>x.id===id)).filter(Boolean);
  html=scopeHTML()+html;
  if(x.fill!=null||m.universes.length>1||m.lattices.length)html+='<div class="field"><label for="cell-fill">Fill</label><select id="cell-fill">'+options([...m.universes,...m.lattices].filter(u=>canFill(u.id,x.universe)),x.fill,'Material')+'</select></div>';
  if(x.fill==null)html+='<div class="field"><label for="cell-material">Material</label><select id="cell-material">'+options(m.materials,x.material,'Void')+'</select></div>';
  if(!x.background)html+='<div class="property-actions top-actions"><button data-action="move">Move</button><button data-action="rotate"'+(x.fill!=null?' disabled':'')+'>Rotate</button><button data-action="duplicate">Duplicate</button><button data-action="delete" class="danger"'+(x.background?' disabled':'')+'>Delete</button></div>';
  if(!x.background)html+='<div class="property-actions"><button data-action="boolean"'+(x.fill!=null?' disabled':'')+'>Combine...</button><button data-action="array">Array</button><button data-action="group">Make universe</button></div>';
  if(x.primitive&&x.fill==null)html+='<button class="button wide dimensions-button" data-action="dimensions">Edit dimensions</button>';
  html+='<details class="region-details"'+(x.primitive?'':' open')+'><summary>Region</summary>'+construction.regionTree(x)+'<details><summary>OpenMC expression</summary><div class="field"><label for="region">Surface half-spaces</label><textarea id="region" rows="2" spellcheck="false"'+(x.background?' readonly':'')+'>'+esc(x.region)+'</textarea><div id="region-error" class="validation-error" role="status"></div></div></details></details>';
  html+='<details'+(x.primitive?'':' open')+'><summary>Surfaces</summary>'+ss.map(s=>Object.keys(s.params).filter(k=>s.type==='sphere'||s.type==='z-cylinder'?k==='r':true).map(k=>paramRow(s,k)).join('')).join('')+'</details>';
  if(x.background)html+='<button class="button" data-build="boundary">Edit background and boundary</button>';
  if(x.fill!=null)html+='<div class="property-actions"><button id="focus-fill">Edit fill</button><button data-action="repeat">Repeat in lattice</button></div>';
  html+='<div class="property-actions"><button id="isolate" aria-pressed="'+(m.isolated===x.id)+'">Isolate</button><button id="hide">Hide</button><button id="show-all">Show all</button></div>';
  html+='<details><summary>Position - cm</summary>'+['x','y','z'].map((a,i)=>'<div class="field"><label for="translate-'+i+'">'+a+'</label><input id="translate-'+i+'" type="number" data-translate="'+i+'" step=".01" value="'+(x.editorTranslation?.[i]||x.translation?.[i]||0)+'"></div>').join('')+'</details>';
 }else if(s.kind==='surface'){
  html+=Object.keys(x.params).map(k=>paramRow(x,k)).join('');
  html+='<div class="field"><label for="boundary">Boundary</label><select id="boundary">'+['transmission','vacuum','reflective','periodic','white'].map(v=>'<option'+((x.boundaryType||'transmission')===v?' selected':'')+'>'+v+'</option>').join('')+'</select></div>';
  html+='<div class="section-title">Used by</div>'+m.cells.filter(c=>(c.region.match(/[+-]?\d+/g)||[]).some(t=>Math.abs(Number(t))===x.id)).map(c=>treeButton('cell',c)).join('');
 }else if(s.kind==='universe'){
  html+='<div class="property-actions"><button data-build="box">Add box</button><button data-build="cylinder">Add cylinder</button>'+(x.id!==0?'<button data-action="repeat">Repeat in lattice</button>':'')+(x.builder?.type==='pin'?'<button data-edit-pin="'+x.id+'">Edit layers</button>':'')+'</div>';
  html+='<div class="section-title">Cells</div>'+m.cells.filter(c=>c.universe===x.id).map(c=>treeButton('cell',c)).join('');
  html+='<div class="property-actions"><button id="show-all">Show all</button><button id="explode" aria-pressed="'+!!m.exploded+'">Explode</button><button id="measure">Measure</button></div>';
  if(x.id===0)html+='<details><summary>Model</summary><div class="field">'+field('Model name','document-name',m.name)+'</div><div class="hint">'+esc(m.metadata?.source||'GM')+(m.metadata?.sourceVersion?' - '+esc(m.metadata.sourceVersion):'')+'</div>'+(m.metadata?.sourceUrl?'<a class="hint" href="'+esc(m.metadata.sourceUrl)+'" target="_blank" rel="noopener">Source ↗</a>':'')+'<p class="hint">'+esc(m.metadata?.notes)+'</p></details>';
 }else if(s.kind==='lattice'){
  html+='<div class="section-title">'+(x.type==='hexagonal'?x.cells.length+' positions':x.dimension.join(' × '))+'</div>';
  html+=field('Pitch - cm','lattice-pitch',x.pitch[0],'number');
  html+='<div class="field"><label for="paint-universe">Fill universe</label><select id="paint-universe">'+options(m.universes.filter(u=>canFill(u.id,m.cells.find(c=>c.fill===x.id)?.universe??0)),state.paint?Number(state.paint):x.cells[0]?.universe)+'</select></div><label class="hint"><input id="paint-enabled" type="checkbox"'+(state.paint?' checked':'')+'> Paint positions</label>';
  if(x.type==='rectangular'||x.type==='hexagonal')html+='<div class="property-actions"><button id="edit-layout">Edit layout</button><button data-edit-lattice="'+x.id+'">Dimensions</button></div>';
  else html+='<div class="field"><label for="position-index">Position</label><select id="position-index">'+x.cells.map((e,i)=>'<option value="'+i+'">'+(e.q!=null?e.q+', '+e.r:(e.x+1)+', '+(e.y+1)+', '+((e.z||0)+1))+'</option>').join('')+'</select></div><button id="replace-position" class="button">Replace position</button>';
  html+='<div class="property-actions"><button id="replace-all">Replace all</button>'+(x.type==='rectangular'&&!x.dimension[2]?'<button data-symmetry="x">Mirror X</button><button data-symmetry="y">Mirror Y</button><button data-symmetry="rotate">Rotate 90°</button>':'')+'<button id="focus-lattice">Focus lattice</button></div>';
 }else if(s.kind==='material'){
  html+=field('Color','material-color',x.color,'color')+field('Density - g/cm³','density',x.density,'number');
  html+='<div class="field"><label for="nuclides">Nuclides - atomic fractions</label><textarea id="nuclides" rows="5" spellcheck="false">'+esc((x.nuclides||[]).map(n=>n.name+' '+n.fraction).join('\n'))+'</textarea><div id="nuclide-error" class="validation-error" role="status"></div></div>';
 }
 $('properties').innerHTML=html;
}
function universeColor(id){const m=state.model,c=m.cells.find(c=>c.universe===id&&c.material!=null),mat=m.materials.find(x=>x.id===c?.material);return mat?.color||'#8883ac';}
function renderLayout(){
 const m=state.model,l=m.selection?.kind==='lattice'?selected():null;if(m.view!=='layout'||!l){$('layout-editor').hidden=true;return;}$('layout-editor').hidden=false;
 const columns=l.type==='rectangular'?l.dimension[0]:2*l.rings-1,rows=l.type==='rectangular'?l.dimension[1]:2*l.rings-1,level=state.layoutLevel||0,choices=m.universes.filter(u=>canFill(u.id,m.cells.find(c=>c.fill===l.id)?.universe??0));
 const allowed=new Set(choices.map(u=>u.id));if(state.paint&&!allowed.has(Number(state.paint)))state.paint=null;
 const palette='<div class="layout-palette"><div class="layout-modes"><button data-layout-mode="paint" aria-pressed="'+!!state.paint+'">Paint</button><button data-layout-mode="inspect" aria-pressed="'+!state.paint+'">Inspect</button></div>'+choices.map(u=>'<button data-paint-fill="'+u.id+'" aria-pressed="'+(Number(state.paint)===u.id)+'"><span class="swatch" style="background:'+universeColor(u.id)+'"></span>'+esc(u.name)+'</button>').join('')+(l.dimension?.[2]?'<label>Axial level <select id="layout-level">'+Array.from({length:l.dimension[2]},(_,i)=>'<option value="'+i+'"'+(i===level?' selected':'')+'>'+(i+1)+'</option>').join('')+'</select></label>':'')+'</div>';
 $('layout-editor').innerHTML=palette+'<div class="layout-grid-wrap"><div class="layout-grid" style="--columns:'+columns+';--rows:'+rows+';grid-template-columns:repeat('+columns+',var(--tile));grid-template-rows:repeat('+rows+',var(--tile))">'+l.cells.map((e,i)=>({...e,index:i})).filter(e=>(e.z||0)===level).map(e=>{const name=m.universes.find(u=>u.id===e.universe)?.name||'Void';return '<button data-lattice-index="'+e.index+'" aria-label="Position '+(e.q!=null?e.q+', '+e.r:(e.x+1)+', '+(e.y+1))+'; '+esc(name)+'" title="'+esc(name)+' - '+(e.q!=null?e.q+', '+e.r:(e.x+1)+', '+(e.y+1))+'" style="background:'+universeColor(e.universe)+';'+(e.q!=null?'grid-column:'+(e.q+l.rings)+';grid-row:'+(l.rings-e.r)+';transform:translateX(calc('+e.r+' * var(--tile) / 2));':'')+'">'+e.universe+'</button>';}).join('')+'</div></div>';
}
function renderPath(){const m=state.model,path=m.focus?.path||[];let html='<button data-focus-root>Geometry</button>';if(!path.length&&m.focus.universe!==0)html+='<span>›</span><button data-focus-u="'+m.focus.universe+'">'+esc(m.universes.find(u=>u.id===m.focus.universe)?.name)+'</button>';path.forEach((step,i)=>{html+='<span>›</span><button data-focus-depth="'+i+'">'+esc(m.universes.find(u=>u.id===step.universe)?.name)+' <span>'+(step.index+1)+'</span></button>';});$('path').innerHTML=html;}
function renderEditor(fit=false){
 if(!state.model)return;const m=state.model;$('model-name').textContent=plainLabel(m.name);
 renderTree();renderProperties();renderPath();$('empty-view').hidden=!!m.cells.length;
 $('view-host').dataset.view=m.view||'3d';$('layout-tab').hidden=m.selection?.kind!=='lattice';for(const id of ['split','cut','transparent','section','color','moderator'])$(id).disabled=m.view==='layout';renderLayout();document.querySelectorAll('[data-view]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.view===m.view));});
 for(const [id,key]of [['cut','cutaway'],['transparent','transparent']])$(id).setAttribute('aria-pressed',String(!!m[key]));
 $('color').value=m.colorBy||'material';$('moderator').checked=!!m.showModerator;
 const b=m.universes.find(u=>u.id===m.focus.universe)?.bounds||[-1,1,-1,1,-1,1],v=m.section??0,axis=m.view==='yz'?0:m.view==='xz'?1:2;$('section').min=b[axis*2];$('section').max=b[axis*2+1];$('section').value=v;$('section-value').textContent=Number(v).toFixed(2)+' cm';
 construction.renderActions();redraw(fit);updateHistory();
}
function dialog(id){$(id).showModal();}
function download(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function applyScope(surfaceId){
 if(state.scope!=='occurrence'||!state.occurrence?.path?.length||state.clonedOccurrence===state.model.selection.id)return surfaceId;
 const result=cloneOccurrence(state.model,state.occurrence.path,state.model.selection.id);
 state.model.selection.id=result.cellId;state.multi=(state.multi||[]).map(id=>result.cellMap.get(id)||id);state.occurrence.path=result.path;state.occurrence.cell=state.model.cells.find(c=>c.id===result.cellId);
 if(state.model.focus.path.length){state.model.focus.path=result.path.slice(0,state.model.focus.path.length);state.model.focus.universe=state.model.focus.path.at(-1).universe;}
 document.querySelectorAll('[data-surface]').forEach(input=>{input.dataset.surface=result.surfaceMap.get(Number(input.dataset.surface))||input.dataset.surface;});renderTree();renderPath();
 state.clonedOccurrence=result.cellId;$('property-id').textContent='C'+result.cellId;return result.surfaceMap.get(surfaceId)||surfaceId;
}
$('home').onclick=home;$('empty').onclick=()=>openModel(createEmptyModel());$('search').oninput=renderLibrary;
$('undo').onclick=undo;$('redo').onclick=redo;$('add').onclick=()=>dialog('add-dialog');$('add-first').onclick=()=>dialog('add-dialog');
$('export').onclick=()=>dialog('export-dialog');$('import').onclick=()=>$('files').click();
$('model-name').onclick=()=>{if(state.page==='editor'){select('universe',0);$('editor').dataset.pane='properties';}};
$('fit').onclick=()=>state.viewer?.fit();$('rotate').onclick=()=>state.viewer?.orbit();$('zoom-in').onclick=()=>state.viewer?.zoom(.8);$('zoom-out').onclick=()=>state.viewer?.zoom(1.25);
$('pin-detail').onclick=()=>state.viewer?.toggleDetail();
$('split').onclick=()=>{$('view-host').classList.toggle('split');$('split').setAttribute('aria-pressed',String($('view-host').classList.contains('split')));state.viewer?.updateFraming();state.viewer?.resize();state.viewer?.fit();};
$('cut').onclick=()=>{if(state.viewer?.detailBounds)state.viewer.toggleDetailCutaway();else mutate(m=>m.cutaway=!m.cutaway,{record:false});};
$('transparent').onclick=()=>mutate(m=>m.transparent=!m.transparent,{record:false});
$('moderator').onchange=e=>mutate(m=>m.showModerator=e.target.checked,{record:false});
$('color').onchange=e=>mutate(m=>m.colorBy=e.target.value,{record:false});
$('section').oninput=e=>{state.model.section=Number(e.target.value);$('section-value').textContent=Number(e.target.value).toFixed(2)+' cm';redraw();};
$('validate').onclick=()=>{let issues=validateModel(state.model);try{for(const c of state.model.cells)parseRegion(c.region);}catch(error){issues.push(error.message);}$('message-title').textContent=issues.length?'Geometry check':'Geometry checked';$('message-content').innerHTML=issues.length?issues.map(x=>'<p class="validation-error">'+esc(x)+'</p>').join(''):'<p>No missing IDs or references.</p>';dialog('message-dialog');};
$('files').onchange=async e=>{
 try{let m=state.model;for(const f of e.target.files){const text=await f.text();if(f.name.endsWith('.json')){const parsed=JSON.parse(text);if(parsed.schema!=='gm-openmc-model/v1')throw new Error('Open a GM model document.');m=parsed;}else if(text.includes('<geometry'))m=importGeometryXML(text);else if(text.includes('<materials')){if(!m)throw new Error('Import geometry.xml before materials.xml.');const doc=new DOMParser().parseFromString(text,'application/xml');m.materials=[...doc.querySelectorAll('material')].map((n,i)=>({id:Number(n.getAttribute('id')),name:n.getAttribute('name')||'Material',color:['#d99b58','#6caaa9','#60788f'][i%3],density:Number(n.querySelector('density')?.getAttribute('value')||1),densityUnits:n.querySelector('density')?.getAttribute('units')||'g/cm3',nuclides:[...n.querySelectorAll('nuclide')].map(x=>({name:x.getAttribute('name'),fraction:Number(x.getAttribute('ao')||x.getAttribute('wo')),basis:x.hasAttribute('wo')?'wo':'ao'})),elements:[...n.querySelectorAll('element')].map(x=>({name:x.getAttribute('name'),fraction:Number(x.getAttribute('ao')||x.getAttribute('wo')),basis:x.hasAttribute('wo')?'wo':'ao'}))}));}else throw new Error('Choose geometry.xml, materials.xml or a GM model.');}if(m)openModel(m);}catch(error){notice(error.message+' Choose another file.');}e.target.value='';
};
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.open)openModel(createModelForTemplate(b.dataset.open));
 if(b.dataset.recent)openModel(state.documents.find(m=>m.id===b.dataset.recent));
 if(b.dataset.filter){state.filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderLibrary();}
 if(b.id==='clear-search'){$('search').value='';state.filter='all';renderLibrary();}
 if(b.hasAttribute('data-close'))b.closest('dialog').close();
 if(b.dataset.select)select(b.dataset.select,b.dataset.id,[],e.shiftKey||e.ctrlKey||e.metaKey);
 if(b.dataset.pane){$('editor').dataset.pane=b.dataset.pane;document.querySelectorAll('[data-pane]').forEach(x=>{if(x.tagName==='BUTTON')x.setAttribute('aria-pressed',String(x===b));});state.viewer?.resize();}
 if(b.id==='edit-layout'){state.model.view='layout';renderEditor();}
 if(b.dataset.layoutMode){state.paint=b.dataset.layoutMode==='paint'?String(selected().cells[0].universe):null;renderEditor();}
 if(b.dataset.paintFill){state.paint=b.dataset.paintFill;renderEditor();}
 if(b.dataset.view){state.model.view=b.dataset.view;renderEditor();state.viewer?.resize();}
 if(b.dataset.add){
  $('add-dialog').close();if(b.dataset.add==='pin'||b.dataset.add==='lattice'){mutate(m=>addComponent(m,b.dataset.add==='pin'?'pin':'pwr17'),{fit:true});}
  else mutate(m=>addPrimitive(m,b.dataset.add),{fit:true});
 }
 if(b.dataset.export){try{const key=b.dataset.export;download({geometry:'geometry.xml',materials:'materials.xml',python:'model.py',project:'model.gm.json'}[key],key==='geometry'?exportGeometryXML(state.model):key==='materials'?exportMaterialsXML(state.model):key==='python'?exportPython(state.model):JSON.stringify(state.model,null,2));}catch(error){notice(error.message+' Check the geometry.');}}
 if(b.id==='property-add')construction.addMenu();
 const m=state.model;if(!m)return;const x=selected();if(!x&&!b.hasAttribute('data-focus-root')&&b.dataset.focusDepth==null&&b.dataset.focusU==null)return;
 if(b.id==='focus-universe'||b.id==='focus-fill'||b.id==='focus-lattice'){
  let id=x.id;if(b.id==='focus-fill'){id=x.fill;const l=m.lattices.find(l=>l.id===id);if(l){select('lattice',l.id);return;}}if(b.id==='focus-lattice')id=m.cells.find(c=>c.fill===x.id)?.universe??0;
  const fillCell=m.cells.find(c=>c.universe===id&&m.lattices.some(l=>l.id===c.fill));if(b.id==='focus-fill'&&fillCell)select('lattice',fillCell.fill);else select('universe',id);
 }
 if(b.dataset.focusU!=null)select('universe',Number(b.dataset.focusU));
 if(b.hasAttribute('data-focus-root'))select('universe',0);
 if(b.dataset.focusDepth!=null){const path=m.focus.path.slice(0,Number(b.dataset.focusDepth)+1);select('universe',path.at(-1).universe,path);}
 if(b.id==='isolate')mutate(m=>m.isolated=m.isolated===x.id?null:x.id,{record:false});
 if(b.id==='hide')mutate(m=>x.hidden=true,{record:false});
 if(b.id==='show-all')mutate(m=>{m.isolated=null;m.cells.forEach(c=>c.hidden=false);},{record:false});
 if(b.id==='explode')mutate(m=>m.exploded=!m.exploded,{record:false});
 if(b.id==='measure'){state.measure={};notice('Select two points in a section view.');}
 if(b.dataset.latticeIndex!=null){const i=Number(b.dataset.latticeIndex);if(state.paint)mutate(()=>x.cells[i].universe=Number(state.paint));else{const entry=x.cells[i];m.focus={universe:entry.universe,path:[{lattice:x.id,index:i,universe:entry.universe}]};m.selection={kind:'universe',id:entry.universe};m.view='3d';renderEditor();redraw(true);}}
 if(b.id==='replace-position')mutate(()=>x.cells[Number($('position-index').value)].universe=Number($('paint-universe').value));
 if(b.id==='replace-all'){const value=Number($('paint-universe').value);mutate(()=>x.cells.forEach(e=>e.universe=value));}
 if(b.dataset.symmetry){mutate(()=>{const nx=x.dimension[0],ny=x.dimension[1],old=structuredClone(x.cells);if(b.dataset.symmetry==='rotate'&&nx!==ny)throw new Error('Rotate 90 degrees requires a square lattice. Use Mirror X or Y.');x.cells.forEach(e=>{const sx=b.dataset.symmetry==='x'?nx-1-e.x:b.dataset.symmetry==='rotate'?e.y:e.x,sy=b.dataset.symmetry==='y'?ny-1-e.y:b.dataset.symmetry==='rotate'?ny-1-e.x:e.y;e.universe=old.find(v=>v.x===sx&&v.y===sy&&(v.z||0)===(e.z||0)).universe;});});}
});
$('add-material').onclick=()=>mutate(m=>{const id=nextId(m.materials);m.materials.push({id,name:'Material '+id,color:'#9d9dad',density:1,densityUnits:'g/cm3',nuclides:[]});m.selection={kind:'material',id};});
function beginTransaction(e){if(e.target.matches('[data-surface],#lattice-pitch,#density,#material-color,[data-translate],#region,#cell-material,#cell-fill,#item-name'))state.transaction??=structuredClone(state.model);}
document.addEventListener('focusin',beginTransaction);document.addEventListener('pointerdown',beginTransaction);
function finishTransaction(){if(state.transaction&&JSON.stringify(state.transaction)!==JSON.stringify(state.model)){state.undo.push(state.transaction);state.redo=[];updateHistory();}state.transaction=null;}
document.addEventListener('focusout',finishTransaction);
document.addEventListener('input',e=>{
 const t=e.target;if(t.closest('#command-dialog'))return;
 if(t.dataset.surface){const n=Number(t.value);if(!Number.isFinite(n)||(t.dataset.param==='r'&&n<=0))return;const old=Number(t.dataset.surface),id=applyScope(old),s=state.model.surfaces.find(s=>s.id===id);s.params[t.dataset.param]=n;for(const c of state.model.cells)if((c.region.match(/[+-]?\d+/g)||[]).some(t=>Math.abs(Number(t))===id))delete c.primitive;
 t.closest('.numeric-row').querySelectorAll('input').forEach(i=>{i.dataset.surface=id;if(i!==t)i.value=n;});syncDomains(state.model);save();redraw();return;}
 let x=selected();if(!x)return;if(state.model.selection.kind==='cell'&&(t.id==='region'||t.dataset.translate!=null)){applyScope(null);x=selected();}
 if(t.id==='region'){try{parseRegion(t.value);$('region-error').textContent='';}catch(error){$('region-error').textContent=error.message;return;}if(!state.transaction)history();x.region=t.value;x.builderPlacement=false;delete x.primitive;syncDomains(state.model);save();redraw();}
 if(t.id==='material-color'){x.color=t.value;save();redraw();}
 if(t.id==='density'){if(Number(t.value)>0){x.density=Number(t.value);save();redraw();}}
 if(t.dataset.translate!=null){const tr=[...(x.editorTranslation||x.translation||[0,0,0])];tr[Number(t.dataset.translate)]=Number(t.value)||0;translateCell(state.model,x,tr);syncDomains(state.model);save();redraw();}
 if(t.id==='lattice-pitch'&&Number(t.value)>0){updateLatticePitch(state.model,x,Number(t.value));syncDomains(state.model);save();redraw();}
});
document.addEventListener('change',e=>{
 const t=e.target;let x=selected();if(!x)return;if(state.model.selection.kind==='cell'&&['item-name','cell-material','cell-fill'].includes(t.id)){applyScope(null);x=selected();}
 if(t.matches('[data-surface],#lattice-pitch,#density,#material-color,[data-translate]')){finishTransaction();return;}
 if(t.name==='scope'){state.scope=t.value;return;}
 if(t.id==='item-name')mutate(()=>x.name=t.value||x.name);
 if(t.id==='document-name')mutate(m=>m.name=t.value||m.name);
 if(t.id==='cell-material')mutate(()=>x.material=t.value===''?null:Number(t.value));
 if(t.id==='cell-fill')mutate(()=>{x.fill=t.value===''?null:Number(t.value);if(x.fill!=null)x.material=null;});
 if(t.id==='boundary')mutate(()=>x.boundaryType=t.value);
 if(t.id==='paint-enabled'){state.paint=t.checked?$('paint-universe').value:null;renderLayout();}
 if(t.id==='layout-level'){state.layoutLevel=Number(t.value);renderLayout();}
 if(t.id==='paint-universe'&&state.paint){state.paint=t.value;renderLayout();}
 if(t.id==='nuclides'){try{const ns=t.value.trim().split('\n').filter(Boolean).map(row=>{const [name,val]=row.trim().split(/\s+/);if(!/^[A-Z][a-z]?\d+$/.test(name)||!(Number(val)>0))throw new Error('Use one nuclide and positive fraction per line, e.g. U235 0.03.');return{name,fraction:Number(val),basis:'ao'};});mutate(()=>x.nuclides=ns);}catch(error){$('nuclide-error').textContent=error.message;}}
});
function commands(){
 const q=$('command-search').value.toLowerCase(),list=[['New geometry','empty'],['Add cylinder','cylinder'],['Add sphere','sphere'],['Add box','box'],['Add tube','tube'],['Add spherical shell','shell'],['Open models','home'],['Fit geometry','fit'],['Export model','export'],['Undo','undo'],['Redo','redo'],...STARTERS.map(x=>[x.name,'model:'+x.id])];
 $('commands').innerHTML=list.filter(([name])=>name.toLowerCase().includes(q)).map(([name,key])=>'<button data-command="'+key+'">'+esc(name)+'</button>').join('');
}
$('command').onclick=()=>{commands();dialog('command-dialog');$('command-search').focus();};$('command-search').oninput=commands;
document.addEventListener('click',e=>{const key=e.target.closest('[data-command]')?.dataset.command;if(!key)return;$('command-dialog').close();if(key.startsWith('model:'))openModel(createModelForTemplate(key.slice(6)));else if(key==='home')home();else if(key==='empty')openModel(createEmptyModel());else if(['cylinder','sphere','box','tube','shell'].includes(key)){if(!state.model)openModel(createEmptyModel());construction.open(key);}else $(key).click();});
document.addEventListener('keydown',e=>{
 const editing=e.target.matches('input,textarea,select');
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('command').click();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();e.shiftKey?redo():undo();}
 if(!editing&&e.key.toLowerCase()==='f')state.viewer?.fit();
 if(!editing&&e.key==='+')state.viewer?.zoom(.8);if(!editing&&e.key==='-')state.viewer?.zoom(1.25);
 if(e.target.matches('#command-search')&&e.key==='Enter')$('commands').querySelector('button')?.click();
 if(e.target.matches('.segments button')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...e.target.parentElement.children].filter(b=>!b.hidden),i=buttons.indexOf(e.target),j=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[j].focus();buttons[j].click();}
});
window.gmStudio={
 getModel:()=>structuredClone(state.model),catalog:()=>STARTERS,
 construct:(operation,spec)=>{if(!state.model)openModel(createEmptyModel());const draft=structuredClone(state.model);constructGeometry(draft,operation,spec);const issues=validateModel(draft);if(issues.length)throw new Error(issues.join(' '));mutate(m=>Object.assign(m,draft),{fit:true});return structuredClone(state.model);},
 open:id=>{openModel(id==='empty'?createEmptyModel():createModelForTemplate(id));return structuredClone(state.model);},
 setSurface:(id,params)=>{mutate(m=>{const s=m.surfaces.find(s=>s.id===Number(id));if(!s)throw new Error('Surface not found.');for(const [k,v]of Object.entries(params)){if(!Number.isFinite(v)||(k==='r'&&v<=0))throw new Error('Enter valid surface coefficients.');if(!(k in s.params))throw new Error('Unknown surface coefficient.');s.params[k]=v;}for(const c of m.cells)if((c.region.match(/[+-]?\d+/g)||[]).some(t=>Math.abs(Number(t))===s.id))delete c.primitive;});return structuredClone(state.model);},
 add:type=>{if(!state.model)openModel(createEmptyModel());if(!['cylinder','sphere','box','pin','pwr17'].includes(type))throw new Error('Unknown geometry type.');mutate(m=>['pin','pwr17'].includes(type)?addComponent(m,type):addPrimitive(m,type));return structuredClone(state.model);},
 paint:(id,indices,universe)=>{mutate(m=>{const l=m.lattices.find(l=>l.id===Number(id));if(!l||!m.universes.some(u=>u.id===Number(universe)))throw new Error('Lattice or universe not found.');for(const index of indices){if(!l.cells[index])throw new Error('Position not found.');l.cells[index].universe=Number(universe);}});return structuredClone(state.model);},
 focus:(universe)=>{if(!state.model.universes.some(u=>u.id===Number(universe)))throw new Error('Universe not found.');select('universe',Number(universe));return structuredClone(state.model);},
 undo,redo,export:(file)=>file==='geometry.xml'?exportGeometryXML(state.model):file==='materials.xml'?exportMaterialsXML(state.model):exportPython(state.model)
};
if(navigator.modelContext?.registerTool){
 for(const tool of [
 {name:'geometry_construct',description:'Construct or edit canonical geometry locally. Operations: cell, pin, lattice, universe, place, combine, move, rotate, array, edit, duplicate, delete, group. Dimensions in cm. Spec follows public/docs/construction.md.',inputSchema:{type:'object',properties:{operation:{type:'string',enum:['cell','pin','lattice','universe','place','combine','move','rotate','array','edit','duplicate','delete','group']},spec:{type:'object'}},required:['operation','spec']},execute:async({operation,spec})=>JSON.stringify(window.gmStudio.construct(operation,spec))},
 {name:'geometry_catalog',description:'List editable model examples.',inputSchema:{type:'object',properties:{}},execute:async()=>JSON.stringify(STARTERS)},
 {name:'geometry_open',description:'Open an example or empty geometry in the current workspace.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id']},execute:async({id})=>JSON.stringify(window.gmStudio.open(id))},
 {name:'geometry_add',description:'Add a primitive or component.',inputSchema:{type:'object',properties:{type:{type:'string',enum:['cylinder','sphere','box','pin','pwr17']}},required:['type']},execute:async({type})=>JSON.stringify(window.gmStudio.add(type))},
 {name:'geometry_paint_lattice',description:'Replace selected lattice positions.',inputSchema:{type:'object',properties:{id:{type:'integer'},indices:{type:'array',items:{type:'integer'}},universe:{type:'integer'}},required:['id','indices','universe']},execute:async({id,indices,universe})=>JSON.stringify(window.gmStudio.paint(id,indices,universe))},
 {name:'geometry_focus',description:'Focus a universe.',inputSchema:{type:'object',properties:{universe:{type:'integer'}},required:['universe']},execute:async({universe})=>JSON.stringify(window.gmStudio.focus(universe))},
 {name:'geometry_undo',description:'Undo the previous geometry edit.',inputSchema:{type:'object',properties:{}},execute:async()=>{undo();return JSON.stringify(state.model);}},
 {name:'geometry_get',description:'Read the current local geometry.',inputSchema:{type:'object',properties:{}},execute:async()=>JSON.stringify(state.model)},
 {name:'geometry_set_surface',description:'Edit surface coefficients and update every view.',inputSchema:{type:'object',properties:{id:{type:'integer'},params:{type:'object'}},required:['id','params']},execute:async({id,params})=>JSON.stringify(window.gmStudio.setSurface(id,params))},
 {name:'geometry_export',description:'Export the current OpenMC geometry or materials.',inputSchema:{type:'object',properties:{file:{type:'string',enum:['geometry.xml','materials.xml','model.py']}},required:['file']},execute:async({file})=>window.gmStudio.export(file)}
 ])navigator.modelContext.registerTool(tool);
}
const construction=installConstruction({state,mutate,selected,select,notice,openModel,save,renderEditor,finishTransaction,art});
installAssistant({getModel:()=>state.model,prepareModel:()=>{
 const draft=structuredClone(state.model);
 if(state.scope==='occurrence'&&state.occurrence?.path?.length&&state.clonedOccurrence!==draft.selection?.id){const result=cloneOccurrence(draft,state.occurrence.path,draft.selection.id);draft.selection.id=result.cellId;draft.focus={universe:draft.cells.find(c=>c.id===result.cellId).universe,path:result.path};}
 return draft;
},ensureModel:()=>{if(!state.model||state.page!=='editor')openModel(createEmptyModel());},applyModel:model=>{finishTransaction();state.multi=[];state.occurrence=null;state.scope='shared';mutate(m=>Object.assign(m,normalize(model)),{fit:true});document.title=plainLabel(state.model.name)+' - GM';},undo,notice});
installApp();
renderLibrary();
