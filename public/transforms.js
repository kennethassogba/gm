// Active rotations about fixed X, Y, Z axes, in degrees (Rz Ry Rx).
export const identity=[[1,0,0],[0,1,0],[0,0,1]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const transpose=a=>a[0].map((_,i)=>a.map(r=>r[i]));
const multiply=(a,b)=>a.map(r=>transpose(b).map(c=>dot(r,c)));
export const vector=(r,p)=>r.map(row=>dot(row,p));
export function rotationMatrix(angles){
 const [x,y,z]=angles.map(v=>v*Math.PI/180),[cx,cy,cz]=[x,y,z].map(Math.cos),[sx,sy,sz]=[x,y,z].map(Math.sin);
 return multiply([[cz,-sz,0],[sz,cz,0],[0,0,1]],multiply([[cy,0,sy],[0,1,0],[-sy,0,cy]],[[1,0,0],[0,cx,-sx],[0,sx,cx]]));
}
export function transformSurface(surface,r,offset){
 const p=surface.params;
 if(surface.type==='sphere'){
  const center=vector(r,[p.x0||0,p.y0||0,p.z0||0]).map((v,i)=>v+offset[i]);
  surface.params={x0:center[0],y0:center[1],z0:center[2],r:p.r};return;
 }
 if(surface.type==='plane'||surface.type.endsWith('-plane')){
  const normal=surface.type==='plane'?[p.a,p.b,p.c]:[0,1,2].map(i=>i==='xyz'.indexOf(surface.type[0])?1:0),n=vector(r,normal),d=surface.type==='plane'?p.d:p[surface.type[0]+'0'];
  surface.type='plane';surface.params={a:n[0],b:n[1],c:n[2],d:d+dot(n,offset)};return;
 }
 let q;
 if(surface.type.endsWith('-cylinder')){
  const axis='xyz'.indexOf(surface.type[0]),diag=[0,1,2].map(i=>i===axis?0:1),center=[p.x0||0,p.y0||0,p.z0||0];
  q={a:diag[0],b:diag[1],c:diag[2],d:0,e:0,f:0,g:-2*diag[0]*center[0],h:-2*diag[1]*center[1],j:-2*diag[2]*center[2],k:dot(diag,center.map(v=>v*v))-p.r*p.r};
 }else if(surface.type==='quadric')q=p;
 else throw new Error('Rotation is not available for '+surface.type+'.');
 const matrix=[[q.a,q.d/2,q.f/2],[q.d/2,q.b,q.e/2],[q.f/2,q.e/2,q.c]],a=multiply(multiply(r,matrix),transpose(r)),linear=vector(r,[q.g,q.h,q.j]),ad=vector(a,offset),l=linear.map((v,i)=>v-2*ad[i]);
 surface.type='quadric';surface.params={a:a[0][0],b:a[1][1],c:a[2][2],d:2*a[0][1],e:2*a[1][2],f:2*a[0][2],g:l[0],h:l[1],j:l[2],k:q.k+dot(offset,ad)-dot(linear,offset)};
}
