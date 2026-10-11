import {latticePosition} from './model.js';
export function parseRegion(text) {
 if(/[^\s\d+\-():~|]/.test(String(text||'')))throw new Error('Use surface IDs and region operators.');
 const tokens=String(text||'').replaceAll('|',':').match(/[+-]?\d+|[():~]/g)||[];let i=0;
 function atom(){let t=tokens[i++];if(t==='~')return{op:'not',a:atom()};if(t==='('){let a=union();if(tokens[i++]!==')')throw new Error('Close the region parenthesis.');return a;}if(!/^[+-]?\d+$/.test(t||''))throw new Error('Enter surface half-spaces, e.g. −1 2.');return{op:'surface',id:Math.abs(Number(t)),negative:Number(t)<0};}
 function intersection(){let a=atom();while(i<tokens.length&&![')',':'].includes(tokens[i]))a={op:'and',a,b:atom()};return a;}
 function union(){let a=intersection();while(tokens[i]===':'){i++;a={op:'or',a,b:intersection()};}return a;}
 if(!tokens.length)return null;const result=union();if(i!==tokens.length)throw new Error('Check the region expression.');return result;
}
export function surfaceValue(s,p) {
 const a=s.params;switch(s.type){
 case 'z-cylinder':return Math.hypot(p[0]-(a.x0||0),p[1]-(a.y0||0))-a.r;
 case 'sphere':return Math.hypot(p[0]-(a.x0||0),p[1]-(a.y0||0),p[2]-(a.z0||0))-a.r;
 case 'x-plane':return p[0]-a.x0;case 'y-plane':return p[1]-a.y0;case 'z-plane':return p[2]-a.z0;
 case 'plane':return a.a*p[0]+a.b*p[1]+a.c*p[2]-a.d;
 default:throw new Error('Unsupported surface: '+s.type);
 }
}
export function regionValue(tree,surfaces,p){
 if(!tree)return -1;if(tree.op==='surface'){const s=surfaces.get(tree.id);if(!s)throw new Error('Missing surface '+tree.id);const v=surfaceValue(s,p);return tree.negative?v:-v;}
 if(tree.op==='not')return-regionValue(tree.a,surfaces,p);
 const a=regionValue(tree.a,surfaces,p),b=regionValue(tree.b,surfaces,p);return tree.op==='and'?Math.max(a,b):Math.min(a,b);
}
export function cellBounds(c,surfaces,defaultBounds){
 const b=[...defaultBounds],refs=String(c.region).match(/[+-]?\d+/g)||[];
 if(/[():~]/.test(c.region))return b;
 for(const t of refs){const s=surfaces.get(Math.abs(Number(t))),neg=Number(t)<0,p=s?.params;if(!s)continue;
 if(s.type.endsWith('-plane')&&s.type!=='plane'){const k='xyz'.indexOf(s.type[0])*2;b[k+(neg?1:0)]=neg?Math.min(b[k+1],Object.values(p)[0]):Math.max(b[k],Object.values(p)[0]);}
 if(neg&&(s.type==='sphere'||s.type==='z-cylinder')){for(let k=0;k<(s.type==='sphere'?3:2);k++){const v=p['xyz'[k]+'0']||0;b[k*2]=Math.max(b[k*2],v-p.r);b[k*2+1]=Math.min(b[k*2+1],v+p.r);}}
 }return b;
}
export function shapeForCell(c,surfaces,bounds){
 if(/[():~]/.test(c.region))return{type:'csg'};
 const refs=(String(c.region).match(/[+-]?\d+/g)||[]).map(t=>({s:surfaces.get(Math.abs(Number(t))),negative:Number(t)<0}));
 if(refs.some(x=>x.s?.type==='plane'))return{type:'csg'};
 const cylinders=refs.filter(x=>x.s?.type==='z-cylinder'),sphere=refs.find(x=>x.negative&&x.s?.type==='sphere');
 if(sphere){if(refs.some(x=>x.s?.type==='sphere'&&x!==sphere)||bounds.some((v,k)=>k%2?v<sphere.s.params['xyz'[Math.floor(k/2)]+'0']+sphere.s.params.r:v>sphere.s.params['xyz'[Math.floor(k/2)]+'0']-sphere.s.params.r))return{type:'csg'};}
 if(sphere)return{type:'sphere',radius:sphere.s.params.r,center:[sphere.s.params.x0||0,sphere.s.params.y0||0,sphere.s.params.z0||0]};
 const outer=cylinders.find(x=>x.negative),inner=cylinders.find(x=>!x.negative);
 if(outer&&(cylinders.length>2||inner&&((inner.s.params.x0||0)!==(outer.s.params.x0||0)||(inner.s.params.y0||0)!==(outer.s.params.y0||0))||bounds[0]>(outer.s.params.x0||0)-outer.s.params.r+1e-8||bounds[1]<(outer.s.params.x0||0)+outer.s.params.r-1e-8||bounds[2]>(outer.s.params.y0||0)-outer.s.params.r+1e-8||bounds[3]<(outer.s.params.y0||0)+outer.s.params.r-1e-8))return{type:'csg'};
 if(outer)return{type:'tube',outer:outer.s.params.r,inner:inner?.s.params.r||0,center:[outer.s.params.x0||0,outer.s.params.y0||0,0]};
 if(refs.some(x=>x.s?.type==='sphere'))return{type:'csg'};
 if(inner)return{type:'moderator',inner:inner.s.params.r};
 return{type:'box'};
}
export function compileModel(model){
 const surfaces=new Map(model.surfaces.map(s=>[s.id,s])),cells=new Map(),universes=new Map(model.universes.map(u=>[u.id,u])),lattices=new Map(model.lattices.map(l=>[l.id,l]));
 for(const c of model.cells){const item={...c,tree:parseRegion(c.region)};const list=cells.get(c.universe)||[];list.push(item);cells.set(c.universe,list);}
 return{model,surfaces,cells,universes,lattices};
}
const inside=(p,b)=>p.every((x,k)=>x>=b[k*2]&&x<=b[k*2+1]);
export function collectInstances(compiled,focus=compiled.model.focus){
 const {cells,universes,lattices,surfaces}=compiled,items=[];const top=universes.get(focus?.universe??0);if(!top)return items;
 const initial=top.bounds||[-2,2,-2,2,-2,2];
 function walk(u,offset,clip,path,depth){
 if(depth>16)throw new Error('Universe nesting exceeds 16 levels.');
 for(const c of cells.get(u)||[]){
 const b=cellBounds(c,surfaces,clip);if(b.some((x,k)=>k%2&&x<=b[k-1]))continue;
 if(c.fill!=null){
 const l=lattices.get(Number(c.fill));
 if(l){for(let i=0;i<l.cells.length;i++){const e=l.cells[i],p=latticePosition(l,e),nextOffset=offset.map((x,k)=>x+p[k]),ub=universes.get(e.universe)?.bounds||clip;let nb=[...ub];
 if(l.type==='rectangular'){nb[0]=Math.max(nb[0],-l.pitch[0]/2);nb[1]=Math.min(nb[1],l.pitch[0]/2);nb[2]=Math.max(nb[2],-l.pitch[1]/2);nb[3]=Math.min(nb[3],l.pitch[1]/2);if(l.pitch[2]){nb[4]=-l.pitch[2]/2;nb[5]=l.pitch[2]/2;}}
 nb=nb.map((v,k)=>k%2?Math.min(v,b[k]-p[Math.floor(k/2)]):Math.max(v,b[k]-p[Math.floor(k/2)]));
 if(nb.some((x,k)=>k%2&&x<=nb[k-1]))continue;
 walk(e.universe,nextOffset,nb,[...path,{lattice:l.id,index:i,universe:e.universe}],depth+1);
 }}else{const tr=c.translation||[0,0,0];walk(Number(c.fill),offset.map((x,k)=>x+tr[k]),b.map((v,k)=>v-tr[Math.floor(k/2)]),path,depth+1);}
 }else{items.push({cell:c,universe:u,position:offset,bounds:b,path,shape:shapeForCell(c,surfaces,b)});}
 }}
 walk(top.id,[0,0,0],initial,focus?.path||[],0);return items;
}
export function locate(compiled,p,focus=compiled.model.focus){
 const {cells,universes,lattices,surfaces}=compiled;
 function walk(u,point,path,depth){
 if(depth>16)return null;
 for(const c of cells.get(u)||[]){
 if(regionValue(c.tree,surfaces,point)>1e-8)continue;
 if(c.fill==null)return{cell:c,universe:u,path,point};
 const l=lattices.get(Number(c.fill));
 if(l){let i=-1;
 if(l.type==='rectangular'){const x=Math.floor((point[0]-l.lowerLeft[0])/l.pitch[0]),y=l.dimension[1]-1-Math.floor((point[1]-l.lowerLeft[1])/l.pitch[1]),z=l.dimension[2]?Math.floor((point[2]-l.lowerLeft[2])/l.pitch[2]):0;
 if(x>=0&&x<l.dimension[0]&&y>=0&&y<l.dimension[1]&&z>=0&&z<(l.dimension[2]||1))i=z*l.dimension[0]*l.dimension[1]+y*l.dimension[0]+x;
 }else{const px=point[0]-(l.center?.[0]||0),py=point[1]-(l.center?.[1]||0),rf=l.orientation==='y'?py/l.pitch[0]-px/(l.pitch[0]*Math.sqrt(3)):py/(l.pitch[0]*Math.sqrt(3)/2),qf=l.orientation==='y'?px/(l.pitch[0]*Math.sqrt(3)/2):px/l.pitch[0]-rf/2;let q=Math.round(qf),r=Math.round(rf),s=Math.round(-qf-rf);const dq=Math.abs(q-qf),dr=Math.abs(r-rf),ds=Math.abs(s+qf+rf);if(dq>dr&&dq>ds)q=-r-s;else if(dr>ds)r=-q-s;i=l.cells.findIndex(e=>e.q===q&&e.r===r);}
 const e=l.cells[i];if(!e)return walk(l.outer,point,path,depth+1);const off=latticePosition(l,e);return walk(e.universe,point.map((v,k)=>v-off[k]),[...path,{lattice:l.id,index:i,universe:e.universe}],depth+1);
 }return walk(Number(c.fill),point.map((v,k)=>v-(c.translation?.[k]||0)),path,depth+1);
 }return null;
 }
 const u=universes.get(focus?.universe??0);if(!u||!inside(p,u.bounds||[-10,10,-10,10,-10,10]))return null;
 return walk(u.id,p,focus?.path||[],0);
}
export function voxelMesh(tree,surfaces,b,n=28){
 const positions=[];const dx=(b[1]-b[0])/n,dy=(b[3]-b[2])/n,dz=(b[5]-b[4])/n;const filled=new Uint8Array(n*n*n);
 const index=(x,y,z)=>(z*n+y)*n+x;
 for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++)filled[index(x,y,z)]=regionValue(tree,surfaces,[b[0]+(x+.5)*dx,b[2]+(y+.5)*dy,b[4]+(z+.5)*dz])<=0?1:0;
 const faces=[[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],dirs=[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
 for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(filled[index(x,y,z)])for(let f=0;f<6;f++){const d=dirs[f],nx=x+d[0],ny=y+d[1],nz=z+d[2];if(nx>=0&&ny>=0&&nz>=0&&nx<n&&ny<n&&nz<n&&filled[index(nx,ny,nz)])continue;for(const k of [0,1,2,0,2,3]){const v=faces[f][k];positions.push(b[0]+(x+v[0])*dx,b[2]+(y+v[1])*dy,b[4]+(z+v[2])*dz);}}
 return new Float32Array(positions);
}
