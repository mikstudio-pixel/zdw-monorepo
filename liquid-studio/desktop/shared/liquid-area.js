import { REGION_SIZE, REGION_PIXELS } from './regions.js';

export const AREA_DISTANCE_RANGE = 128 / 1080;

export function liquidAreaFrame(mask) {
  let left = REGION_SIZE, top = REGION_SIZE, right = -1, bottom = -1;
  for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) {
    const x = i % REGION_SIZE, y = Math.floor(i / REGION_SIZE);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < 0 ? [.5, .5, 1, 1] : [(left + right + 1) / (2 * REGION_SIZE), (top + bottom + 1) / (2 * REGION_SIZE), (right - left + 1) / REGION_SIZE, (bottom - top + 1) / REGION_SIZE];
}

export function sampleAreaDistance(field, x, y) {
  const n = REGION_SIZE;
  x = Math.max(0, Math.min(n - 1, x * n - .5));
  y = Math.max(0, Math.min(n - 1, y * n - .5));
  const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
  const x1 = Math.min(n - 1, ix + 1), y1 = Math.min(n - 1, iy + 1);
  return (field[iy * n + ix] * (1 - tx) + field[iy * n + x1] * tx) * (1 - ty)
    + (field[y1 * n + ix] * (1 - tx) + field[y1 * n + x1] * tx) * ty;
}

// Exact separable squared Euclidean distance, in output-height units.
// The envelope of parabolas keeps this linear in the number of mask pixels.
function distanceTo(mask, inside, aspect, limit) {
  const n=REGION_SIZE, data=new Float64Array(REGION_PIXELS);
  for(let i=0;i<data.length;i++) data[i]=((mask[i]>=128)===inside)?0:limit*limit;
  const values=new Float64Array(n),v=new Int32Array(n),z=new Float64Array(n+1),out=new Float64Array(n);
  for(let axis=0;axis<2;axis++) {
    const weight=(axis?1:aspect)**2/(n*n);
    for(let line=0;line<n;line++) {
      for(let q=0;q<n;q++)values[q]=data[axis?q*n+line:line*n+q];
      let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;
      for(let q=1;q<n;q++) {
        let intersection;
        do {
          const at=v[k];intersection=((values[q]+weight*q*q)-(values[at]+weight*at*at))/(2*weight*(q-at));
          if(intersection<=z[k])k--;else break;
        }while(k>=0);
        k++;v[k]=q;z[k]=intersection;z[k+1]=Infinity;
      }
      k=0;
      for(let q=0;q<n;q++){while(z[k+1]<q)k++;out[q]=values[v[k]]+weight*(q-v[k])**2;}
      for(let q=0;q<n;q++)data[axis?q*n+line:line*n+q]=out[q];
    }
  }
  return data;
}

export const NATIVE_AREA_DISTANCE_RANGE=512/1080;

export function liquidAreaEdgeContact(mask) {
  const size = REGION_SIZE;
  let horizontal = false, vertical = false;
  for (let i = 0; i < size && !(horizontal && vertical); i++) {
    horizontal ||= mask[i * size] >= 128 || mask[(i + 1) * size - 1] >= 128;
    vertical ||= mask[i] >= 128 || mask[(size - 1) * size + i] >= 128;
  }
  return [horizontal, vertical];
}

// Legacy byte morphs keep their previous range and border policy. The native
// effect uses a deeper field for the original stroke profile.
export function liquidAreaDistance(mask, aspect, { float=false, range=AREA_DISTANCE_RANGE, finite=false }={}) {
  const n=REGION_SIZE,outside=distanceTo(mask,false,aspect,range),inside=distanceTo(mask,true,aspect,range);
  const data=float?new Float32Array(REGION_PIXELS):new Uint8Array(REGION_PIXELS);
  for(let i=0;i<data.length;i++) {
    let outer=Math.sqrt(outside[i]);
    if(finite && mask[i]>=128){const x=i%n,y=Math.floor(i/n);outer=Math.min(outer,(x+.5)*aspect/n,(n-x-.5)*aspect/n,(y+.5)/n,(n-y-.5)/n);}
    const value=.5+.5*(outer-Math.sqrt(inside[i]))/range;
    data[i]=float?value:Math.round(value*255);
  }
  return data;
}
