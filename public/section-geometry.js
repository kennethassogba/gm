import polygonClipping from 'polygon-clipping';
import {polynomialValue} from './csg-raycast.js';

const rectangle=[[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]];
const full=[rectangle];
const crossIndex=(a,b)=>a+b===1?3:a+b===3?4:5;

function roots(a,b,c){
 const scale=Math.max(Math.abs(a),Math.abs(b),Math.abs(c));
 if(!scale)return [];
 a/=scale;b/=scale;c/=scale;
 if(Math.abs(a)<1e-14)return Math.abs(b)<1e-14?[]:[-c/b];
 let disc=b*b-4*a*c;if(disc < -1e-14)return [];disc=Math.max(0,disc);
 const stable=-.5*(b+(b<0?-1:1)*Math.sqrt(disc));
 return stable===0?[-b/(2*a)]:[stable/a,c/stable].sort((x,y)=>x-y);
}

// Restrict a surface equation to the section and normalize its viewport to
// [-1,1]^2. This keeps clipping numerically stable across model dimensions.
function conic({q,offset},map,bounds){
 const {a,c,normal,cut}=map,hx=(bounds[1]-bounds[0])/2,hy=(bounds[3]-bounds[2])/2,p=[...offset];
 p[a]+=(bounds[0]+bounds[1])/2;p[c]+=(bounds[2]+bounds[3])/2;p[normal]+=cut;
 const derivative=k=>2*q[k]*p[k]+q[6+k]+[0,1,2].filter(i=>i!==k).reduce((sum,i)=>sum+q[crossIndex(i,k)]*p[i],0);
 const result=[q[a]*hx*hx,q[crossIndex(a,c)]*hx*hy,q[c]*hy*hy,derivative(a)*hx,derivative(c)*hy,polynomialValue(q,p)];
 const scale=Math.max(...result.map(Math.abs))||1;return result.map(v=>v/scale);
}

// Split at all conic topology events: tangencies, viewport crossings and
// vertical asymptotes. No pixel grid is used, so a small closed hole is not
// lost merely because it lies between sample points.
function negativeHalfspace(coefficients,hx,hy,tolerance){
 const [a,b,c,d,e,f]=coefficients,value=(x,y)=>a*x*x+b*x*y+c*y*y+d*x+e*y+f;
 const events=[-1,1,...roots(b*b-4*c*a,2*b*e-4*c*d,e*e-4*c*f)];
 for(const y of [-1,1])events.push(...roots(a,b*y+d,c*y*y+e*y+f));
 if(Math.abs(c)<1e-14&&b!==0)events.push(-e/b);
 const xs=events.filter(x=>Number.isFinite(x)&&x>=-1&&x<=1).sort((x,y)=>x-y).filter((x,i,all)=>!i||x-all[i-1]>1e-13);
 const polygons=[];let count=0;
 for(let slab=0;slab<xs.length-1;slab++){
  const left=xs[slab],right=xs[slab+1],mid=(left+right)/2,ys=roots(c,b*mid+e,a*mid*mid+d*mid+f);
  const cuts=[{y:-1,bound:-1},...ys.map((y,index)=>({y,index})).filter(p=>p.y>-1&&p.y<1),{y:1,bound:1}].sort((p,q)=>p.y-q.y);
  for(let band=0;band<cuts.length-1;band++){
   const low=cuts[band],high=cuts[band+1];if(high.y-low.y<1e-14||value(mid,(low.y+high.y)/2)>0)continue;
   function boundary(which,x){
    if(which.bound!=null)return [x,which.bound];
    let r=roots(c,b*x+e,a*x*x+d*x+f);
    if(!r.length){const inset=Math.max((right-left)*1e-10,1e-14),safe=Math.max(left+inset,Math.min(right-inset,x));r=roots(c,b*safe+e,a*safe*safe+d*safe+f);}
    if(!r.length)throw new Error('A section curve could not be resolved. Move the section slightly.');
    return [x,Math.max(-1,Math.min(1,r[Math.min(which.index,r.length-1)]))];
   }
   function trace(which){
    const start=boundary(which,left),end=boundary(which,right),points=[start];
    function refine(p,q,depth){
     const dx=(q[0]-p[0])*hx,dy=(q[1]-p[1])*hy,length=Math.hypot(dx,dy);
     const samples=[.25,.5,.75].map(t=>boundary(which,p[0]+t*(q[0]-p[0])));
     const error=Math.max(...samples.map(r=>length?Math.abs(dx*(r[1]-p[1])*hy-dy*(r[0]-p[0])*hx)/length:0));
     if(error>tolerance){if(depth>=24)throw new Error('Section detail exceeds the curve tolerance. Zoom out or focus a smaller universe.');refine(p,samples[1],depth+1);refine(samples[1],q,depth+1);}
     else{points.push(q);if(++count>200000)throw new Error('Section curve is too detailed. Focus a smaller universe.');}
    }
    refine(start,end,0);return points;
   }
   const ring=[...trace(low),...trace(high).reverse()];ring.push(ring[0]);polygons.push([ring]);
  }
 }
 return polygons.length?polygonClipping.union(...polygons):[];
}

export function sectionPolygons(region,map,bounds,tolerance){
 const hx=(bounds[1]-bounds[0])/2,hy=(bounds[3]-bounds[2])/2,cx=(bounds[0]+bounds[1])/2,cy=(bounds[2]+bounds[3])/2,cache=new Map();
 function surface(id,negative){const key=id+':'+negative;if(!cache.has(key))cache.set(key,negativeHalfspace(conic(region.polynomials[id],map,bounds).map(v=>negative?v:-v),hx,hy,tolerance));return cache.get(key);}
 function walk(t,invert=false){
  if(!t)return full;
  if(t.op==='surface')return surface(t.id,t.negative!==invert);
  if(t.op==='not')return walk(t.a,!invert);
  const intersection=(t.op==='and')!==invert,a=walk(t.a,invert);if(intersection&&!a.length)return [];
  const b=walk(t.b,invert);return intersection?polygonClipping.intersection(a,b):polygonClipping.union(a,b);
 }
 return walk(region.tree).map(polygon=>polygon.map(ring=>ring.map(([x,y])=>[cx+x*hx,cy+y*hy])));
}

const number=value=>Number(value.toPrecision(12));
export function polygonPath(polygons){return polygons.map(polygon=>polygon.map(ring=>ring.map(([x,y],i)=>(i?'L':'M')+number(x)+' '+number(-y)).join('')+'Z').join('')).join('');}
