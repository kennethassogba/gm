import {parseRegion} from './csg.js';

// Coefficients of ax² + by² + cz² + dxy + eyz + fxz + gx + hy + jz + k.
// Keep surface origins separate to avoid cancellation for translated primitives.
function polynomial(surface,shift){
 const p=surface.params,q=new Array(10).fill(0),offset=[...shift];
 if(surface.type==='quadric')q.splice(0,10,...['a','b','c','d','e','f','g','h','j','k'].map(k=>p[k]||0));
 else if(surface.type==='plane'){q[6]=p.a;q[7]=p.b;q[8]=p.c;q[9]=-p.d;}
 else if(surface.type.endsWith('-plane')){const axis='xyz'.indexOf(surface.type[0]);q[6+axis]=1;offset[axis]-=p[surface.type[0]+'0'];}
 else if(surface.type==='sphere'||surface.type.endsWith('-cylinder')){
  for(let axis=0;axis<3;axis++)if(surface.type==='sphere'||surface.type[0]!=='xyz'[axis]){q[axis]=1;offset[axis]-=p['xyz'[axis]+'0']||0;}q[9]=-p.r*p.r;
 }else return null;
 if(![...q,...offset].every(Number.isFinite))return null;
 return{q,offset};
}

export function compileRayRegion(region,surfaces,bounds,clips=[]){
 const polynomials=[],indices=new Map();let supported=true,nodes=0;
 function add(surface,shift=[0,0,0]){
  const poly=polynomial(surface,shift);if(!poly){supported=false;return 0;}
  const key=JSON.stringify(poly);if(!indices.has(key)){indices.set(key,polynomials.length);polynomials.push(poly);}return indices.get(key);
 }
 function convert(t,shift=[0,0,0]){
  nodes++;
  if(!t)return null;
  if(t.op==='surface'){const surface=surfaces.get(t.id);if(!surface){supported=false;return null;}return{...t,id:add(surface,shift)};}
  return{...t,a:convert(t.a,shift),...(t.b?{b:convert(t.b,shift)}:{})};
 }
 let tree=convert(parseRegion(region));
 const intersect=t=>{tree=tree?{op:'and',a:tree,b:t}:t;};
 for(let i=0;i<6;i++)intersect({op:'surface',id:add({type:'xyz'[i>>1]+'-plane',params:{['xyz'[i>>1]+'0']:bounds[i]}}),negative:!!(i%2)});
 for(const clip of clips){
  if(clip.wedge){
   const x={op:'surface',id:add({type:'x-plane',params:{x0:clip.wedge[0]}}),negative:false};
   const y={op:'surface',id:add({type:'y-plane',params:{y0:clip.wedge[1]}}),negative:true};
   intersect({op:'not',a:{op:'and',a:x,b:y}});
  }else if(clip.hex)for(let side=0;side<6;side++){
   const angle=side*Math.PI/3+(clip.hex.orientation==='y'?Math.PI/6:0);
   intersect({op:'surface',id:add({type:'plane',params:{a:Math.cos(angle),b:Math.sin(angle),c:0,d:clip.hex.pitch/2}},clip.shift),negative:true});
  }else intersect(convert(parseRegion(clip.region),clip.shift));
 }
 if(!supported)throw new Error('This cell contains an unsupported or invalid surface. Check its surface definitions.');
 // A short-circuit decision program needs neither a shader stack nor a large
 // generated GLSL expression. -1 and -2 are the true and false terminals.
 const program=[];
 function emit(t,yes,no){
  if(!t)return yes;
  if(t.op==='surface'){const index=program.length;program.push([t.id,t.negative?1:0,yes,no]);return index;}
  if(t.op==='not')return emit(t.a,no,yes);
  const next=emit(t.b,yes,no);return t.op==='and'?emit(t.a,next,no):emit(t.a,yes,next);
 }
 const entry=emit(tree,-1,-2);
 function expression(t){if(!t)return 'true';if(t.op==='surface')return `(f[${t.id}]${t.negative?'<=':'>'}0.0)`;if(t.op==='not')return `(!${expression(t.a)})`;return `(${expression(t.a)}${t.op==='and'?'&&':'||'}${expression(t.b)})`;}
 return{polynomials,tree,program,entry,expression:polynomials.length<=48&&nodes<=256?expression(tree):null,bounds};
}

export function polynomialValue(q,p){const [x,y,z]=p;return q[0]*x*x+q[1]*y*y+q[2]*z*z+q[3]*x*y+q[4]*y*z+q[5]*x*z+q[6]*x+q[7]*y+q[8]*z+q[9];}
function gradient(q,[x,y,z]){return[2*q[0]*x+q[3]*y+q[5]*z+q[6],2*q[1]*y+q[3]*x+q[4]*z+q[7],2*q[2]*z+q[4]*y+q[5]*x+q[8]];}
export function rayRegionContains(compiled,point,surface=-1,value=0){
 let pc=compiled.entry;
 while(pc>=0){const [id,negative,yes,no]=compiled.program[pc],{q,offset}=compiled.polynomials[id];
  const f=id===surface?value:polynomialValue(q,point.map((v,i)=>v+offset[i]));pc=(negative?f<=0:f>0)?yes:no;
 }
 return pc===-1;
}

// Picking uses the same surfaces and Boolean tree as the fragment shader.
export function intersectRayRegion(compiled,origin,direction,accept=()=>true){
 const {polynomials}=compiled;let nearest=Infinity;
 for(const [surface,{q,offset}] of polynomials.entries()){
  const p=origin.map((v,i)=>v+offset[i]),[x,y,z]=direction,a=q[0]*x*x+q[1]*y*y+q[2]*z*z+q[3]*x*y+q[4]*y*z+q[5]*x*z,b=gradient(q,p).reduce((sum,v,i)=>sum+v*direction[i],0),c=polynomialValue(q,p);
  let roots=[];
  if(Math.abs(a)<1e-12){if(Math.abs(b)>1e-12)roots=[-c/b];}
  else{const disc=b*b-4*a*c;if(disc>=0){const stable=-.5*(b+(b<0?-1:1)*Math.sqrt(disc));roots=stable===0?[-b/(2*a)]:[stable/a,c/stable];}}
  for(const t of roots){
   if(t<0||t>=nearest)continue;const point=origin.map((v,i)=>v+t*direction[i]);if(!accept(point))continue;
   const derivative=2*a*t+b;if(Math.abs(derivative)<1e-12)continue;
   const before=rayRegionContains(compiled,point,surface,-derivative),after=rayRegionContains(compiled,point,surface,derivative);
   if(before!==after)nearest=t;
  }
 }
 return Number.isFinite(nearest)?nearest:null;
}
