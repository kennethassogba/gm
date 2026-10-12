import {latticePosition} from './model.js';
export function parseRegion(text) {
 if(/[^\s\d+\-():~|]/.test(String(text||'')))throw new Error('Use surface IDs and region operators.');
 const tokens=String(text||'').replaceAll('|',':').match(/[+-]?\d+|[():~]/g)||[];let i=0;
 function atom(){let t=tokens[i++];if(t==='~')return{op:'not',a:atom()};if(t==='('){let a=union();if(tokens[i++]!==')')throw new Error('Close the region parenthesis.');return a;}if(!/^[+-]?\d+$/.test(t||''))throw new Error('Enter surface half-spaces, e.g. -1 2.');return{op:'surface',id:Math.abs(Number(t)),negative:Number(t)<0};}
 function intersection(){let a=atom();while(i<tokens.length&&![')',':'].includes(tokens[i]))a={op:'and',a,b:atom()};return a;}
 function union(){let a=intersection();while(tokens[i]===':'){i++;a={op:'or',a,b:intersection()};}return a;}
 if(!tokens.length)return null;const result=union();if(i!==tokens.length)throw new Error('Check the region expression.');return result;
}
export function surfaceValue(s,p) {
 const a=s.params;switch(s.type){
 case 'z-cylinder':return Math.hypot(p[0]-(a.x0||0),p[1]-(a.y0||0))-a.r;
 case 'x-cylinder':return Math.hypot(p[1]-(a.y0||0),p[2]-(a.z0||0))-a.r;
 case 'y-cylinder':return Math.hypot(p[0]-(a.x0||0),p[2]-(a.z0||0))-a.r;
 case 'sphere':return Math.hypot(p[0]-(a.x0||0),p[1]-(a.y0||0),p[2]-(a.z0||0))-a.r;
 case 'x-plane':return p[0]-a.x0;case 'y-plane':return p[1]-a.y0;case 'z-plane':return p[2]-a.z0;
 case 'quadric':{const [x,y,z]=p;return a.a*x*x+a.b*y*y+a.c*z*z+a.d*x*y+a.e*y*z+a.f*x*z+a.g*x+a.h*y+a.j*z+a.k;}
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
 const unlimited=[-Infinity,Infinity,-Infinity,Infinity,-Infinity,Infinity];
 function tightenPlanes(t,b){
  const planes=[];let oblique=false;
  function collect(t,invert=false){
   if(!t)return;if(t.op==='not'){collect(t.a,!invert);return;}if(t.op==='and'&&!invert||t.op==='or'&&invert){collect(t.a,invert);collect(t.b,invert);return;}if(t.op!=='surface')return;
   const s=surfaces.get(t.id);if(s?.type!=='plane')return;const p=s.params,sign=t.negative!==invert?1:-1;planes.push([p.a*sign,p.b*sign,p.c*sign,p.d*sign]);oblique=true;
  }collect(t);if(!oblique)return b;
  const bounded=b.map((v,i)=>i%2?Math.min(v,defaultBounds[i]):Math.max(v,defaultBounds[i]));for(let i=0;i<6;i++){const p=[0,0,0,bounded[i]*(i%2?1:-1)];p[i>>1]=i%2?1:-1;planes.push(p);}
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],points=[];
  for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++)for(let k=j+1;k<planes.length;k++){const a=planes[i],d=planes[j],e=planes[k],de=cross(d,e),ea=cross(e,a),ad=cross(a,d),det=dot(a,de);if(Math.abs(det)<1e-10)continue;const p=[0,1,2].map(n=>(a[3]*de[n]+d[3]*ea[n]+e[3]*ad[n])/det);if(planes.every(v=>dot(v,p)<=v[3]+1e-7))points.push(p);}
  return points.length?b.map((v,i)=>i%2?Math.min(v,Math.max(...points.map(p=>p[i>>1]))):Math.max(v,Math.min(...points.map(p=>p[i>>1])))):b;
 }
 function walk(t,invert=false){
  if(!t)return unlimited;if(t.op==='not')return walk(t.a,!invert);
  if(t.op!=='surface'){const a=walk(t.a,invert),b=walk(t.b,invert),intersection=(t.op==='and')!==invert,result=a.map((v,i)=>intersection?(i%2?Math.min(v,b[i]):Math.max(v,b[i])):(i%2?Math.max(v,b[i]):Math.min(v,b[i])));return intersection?tightenPlanes(invert?{op:'not',a:t}:t,result):result;}
  const b=[...unlimited],s=surfaces.get(t.id);if(!s)return b;const p=s.params,negative=t.negative!==invert;
  if(['x-plane','y-plane','z-plane'].includes(s.type)){const k='xyz'.indexOf(s.type[0])*2;b[k+(negative?1:0)]=p[s.type[0]+'0'];}
  if(negative&&(s.type==='sphere'||s.type.endsWith('-cylinder'))){for(let k=0;k<3;k++){if(s.type.endsWith('-cylinder')&&s.type[0]==='xyz'[k])continue;const v=p['xyz'[k]+'0']||0;b[k*2]=v-p.r;b[k*2+1]=v+p.r;}}
  return b;
 }
 return walk(c.tree||parseRegion(c.region)).map((v,i)=>i%2?Math.min(v,defaultBounds[i]):Math.max(v,defaultBounds[i]));
}
export function shapeForCell(c,surfaces,bounds){
 if(/[():~|]/.test(c.region))return{type:'csg'};
 const refs=(String(c.region).match(/[+-]?\d+/g)||[]).map(t=>({s:surfaces.get(Math.abs(Number(t))),negative:Number(t)<0}));
 if(refs.some(x=>['plane','quadric','x-cylinder','y-cylinder'].includes(x.s?.type)))return{type:'csg'};
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
 function walk(u,offset,clip,path,depth,ancestors=[],clips=[]){
 if(depth>16)throw new Error('Universe nesting exceeds 16 levels.');
 for(const c of cells.get(u)||[]){
 const b=cellBounds(c,surfaces,clip);if(b.some((x,k)=>k%2&&x<=b[k-1]))continue;
 if(c.fill!=null){
 const masks=shapeForCell(c,surfaces,b).type==='box'?clips:[...clips,{region:c.region,origin:offset}];
 const l=lattices.get(Number(c.fill));
 if(l){for(let i=0;i<l.cells.length;i++){const e=l.cells[i],p=latticePosition(l,e),tr=c.translation||[0,0,0],shift=p.map((v,k)=>v+tr[k]),nextOffset=offset.map((x,k)=>x+shift[k]);let nb=[-l.pitch[0]/2,l.pitch[0]/2,-(l.pitch[1]||l.pitch[0])/2,(l.pitch[1]||l.pitch[0])/2,b[4]-shift[2],b[5]-shift[2]];
 if(l.type==='rectangular'&&l.pitch[2]){nb[4]=-l.pitch[2]/2;nb[5]=l.pitch[2]/2;}
 if(l.type==='hexagonal'){const x=l.pitch[0]/(l.orientation==='y'?Math.sqrt(3):2),y=l.pitch[0]/(l.orientation==='y'?2:Math.sqrt(3));nb=[-x,x,-y,y,nb[4],nb[5]];}
 nb=nb.map((v,k)=>k%2?Math.min(v,b[k]-shift[Math.floor(k/2)]):Math.max(v,b[k]-shift[Math.floor(k/2)]));
 if(nb.some((x,k)=>k%2&&x<=nb[k-1]))continue;
 walk(e.universe,nextOffset,nb,[...path,{lattice:l.id,index:i,universe:e.universe}],depth+1,[...ancestors,c.id],l.type==='hexagonal'?[...masks,{hex:{pitch:l.pitch[0],orientation:l.orientation},origin:nextOffset}]:masks);
 }}else{const tr=c.translation||[0,0,0];walk(Number(c.fill),offset.map((x,k)=>x+tr[k]),b.map((v,k)=>v-tr[Math.floor(k/2)]),path,depth+1,[...ancestors,c.id],masks);}
 }else{let shape=shapeForCell(c,surfaces,b);const localClips=clips.map(({origin,...mask})=>({...mask,shift:offset.map((v,k)=>v-origin[k])})).filter(mask=>!(mask.hex&&shape.type==='tube'&&Math.hypot(shape.center[0]+mask.shift[0],shape.center[1]+mask.shift[1])+shape.outer<=mask.hex.pitch/2+1e-9));if(localClips.length)shape={type:'csg'};items.push({cell:c,universe:u,position:offset,bounds:b,path,ancestors,shape,clips:localClips});}
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
 if(l){point=point.map((v,k)=>v-(c.translation?.[k]||0));let i=-1;
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

// Interpolate the canonical region's implicit function; meshes never become model data.
export function surfaceMesh(tree,surfaces,b,resolution=42,clips=[]){
 const span=Math.max(b[1]-b[0],b[3]-b[2],b[5]-b[4]),pad=span/resolution*.7;
 const bounds=b.map((v,i)=>v+(i%2?pad:-pad)),n=[0,1,2].map(i=>Math.max(12,Math.round((bounds[i*2+1]-bounds[i*2])/span*resolution))),steps=n.map((v,i)=>(bounds[i*2+1]-bounds[i*2])/v),nx=n[0]+1,ny=n[1]+1;
 const values=new Float64Array(nx*ny*(n[2]+1)),index=(x,y,z)=>(z*ny+y)*nx+x,point=(x,y,z)=>[bounds[0]+x*steps[0],bounds[2]+y*steps[1],bounds[4]+z*steps[2]];
 const masks=clips.map(c=>({...c,tree:c.region?parseRegion(c.region):null}));
 for(let z=0;z<=n[2];z++)for(let y=0;y<=n[1];y++)for(let x=0;x<=n[0];x++){const p=point(x,y,z);let value=Math.max(regionValue(tree,surfaces,p),...p.flatMap((v,i)=>[b[i*2]-v,v-b[i*2+1]]));for(const mask of masks){const q=p.map((v,i)=>v+mask.shift[i]);if(mask.hex){for(let side=0;side<6;side++){const a=side*Math.PI/3+(mask.hex.orientation==='y'?Math.PI/6:0);value=Math.max(value,q[0]*Math.cos(a)+q[1]*Math.sin(a)-mask.hex.pitch/2);}}else value=Math.max(value,regionValue(mask.tree,surfaces,q));}values[index(x,y,z)]=value;}
 const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]],positions=[];
 for(let z=0;z<n[2];z++)for(let y=0;y<n[1];y++)for(let x=0;x<n[0];x++){
  const v=corners.map(c=>values[index(x+c[0],y+c[1],z+c[2])]);if(v.every(v=>v>0)||v.every(v=>v<=0))continue;const p=corners.map(c=>point(x+c[0],y+c[1],z+c[2]));
  const edge=(a,b)=>{const t=v[a]/(v[a]-v[b]);return p[a].map((c,i)=>c+t*(p[b][i]-c));};
  for(const ids of tetra){const inside=ids.filter(i=>v[i]<=0),outside=ids.filter(i=>v[i]>0);if(!inside.length||!outside.length)continue;
   const direction=[0,1,2].map(k=>outside.reduce((s,i)=>s+p[i][k],0)/outside.length-inside.reduce((s,i)=>s+p[i][k],0)/inside.length);
   const triangle=(a,b,c)=>{const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]),normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];if(normal.reduce((s,v,i)=>s+v*direction[i],0)<0)positions.push(...a,...c,...b);else positions.push(...a,...b,...c);};
   if(inside.length===1||outside.length===1){const a=inside.length===1?inside[0]:outside[0],others=inside.length===1?outside:inside;triangle(...others.map(b=>edge(a,b)));}
   else{const [a,b]=inside,[c,d]=outside,ac=edge(a,c),ad=edge(a,d),bc=edge(b,c),bd=edge(b,d);triangle(ac,ad,bc);triangle(bc,ad,bd);}
  }
 }
 return new Float32Array(positions);
}
