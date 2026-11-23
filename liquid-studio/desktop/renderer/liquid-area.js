import { AE_LIQUID, aeDisplacement } from '../vendor/liquid-ae-data.js';
import { NATIVE_AREA_DISTANCE_RANGE as AREA_DISTANCE_RANGE } from '../shared/liquid-area.js';

const EDGE_EXTENSION = 128; // Pixels in canonical 1080-short-side composition.
const [brownPhase, greenPhase, redPhase, yellowPhase, bluePhase, pinkPhase] = AE_LIQUID.palettePositions;
const themePhases = [
  brownPhase, greenPhase, redPhase, (redPhase + yellowPhase) / 2,
  yellowPhase, bluePhase, pinkPhase, brownPhase + 1,
];

// The original AE effect stack applied once to the union of all painted areas.
// The only measured asset is the static inverse turbulence coordinate field.
const sample = `
vec4 transparentSample(sampler2D image,vec2 uv) {
  if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))) return vec4(0.);
  return texture(image,uv);
}`;
const workingSpace = `
uniform vec2 u_workSize,u_workPadding,u_baseSize;
vec2 workingPoint(vec2 uv) {
  return vec2(uv.x,1.-uv.y)*u_workSize-u_workPadding;
}
vec2 workingUv(vec2 point) {
  vec2 uv=(point+u_workPadding)/u_workSize;
  return vec2(uv.x,1.-uv.y);
}`;
const area = `
uniform sampler2D u_mask,u_nextMask;
uniform float u_morph,u_maskAspect;
uniform vec2 u_edgeExtension;
uniform vec4 u_from,u_to;
float areaLimit(vec2 uv) {
  vec2 border=min(uv,1.-uv);
  if(all(greaterThanEqual(border,vec2(0.)))) return 1.;
  if((border.x<0. && u_edgeExtension.x==0.) || (border.y<0. && u_edgeExtension.y==0.)) return 0.;
  vec2 distance=border*vec2(u_maskAspect,1.)+u_edgeExtension/u_baseSize.y;
  return clamp(.5+.5*min(distance.x,distance.y)/${AREA_DISTANCE_RANGE},0.,1.);
}
float areaDistance(vec2 uv) {
  float limit=areaLimit(uv);
  if(limit<=0.) return -${AREA_DISTANCE_RANGE};
  // Continue the existing outline at painted edge texels. The limit closes
  // that continuation without changing the outline inside the frame.
  float value=texture(u_mask,uv).r;
  if(u_morph>0.) {
    vec4 frame=mix(u_from,u_to,u_morph);vec2 local=(uv-frame.xy)/frame.zw;
    vec2 a=u_from.xy+local*u_from.zw,b=u_to.xy+local*u_to.zw;
    float va=min(texture(u_mask,a).r,areaLimit(a));
    float vb=min(texture(u_nextMask,b).r,areaLimit(b));
    value=mix(va,vb,u_morph);
  }
  return (min(value,limit)*2.-1.)*${AREA_DISTANCE_RANGE};
}`;
const smoothNoise = `
float hash21(vec2 p) {
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float vnoise(vec2 p) {
  vec2 i=floor(p),f=fract(p);
  vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  float a=hash21(i),b=hash21(i+vec2(1.,0.));
  float c=hash21(i+vec2(0.,1.)),d=hash21(i+vec2(1.,1.));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float ribbonSdf(vec2 p, float scale, float structure) {
  // Generalization of AE's stroked-ellipse level set (halfWidth - |F(p) - iso|)
  // to arbitrary painted areas: sweeps smooth calligraphic ribbons around large
  // sculptural voids (both peaks and valleys of a single warped field), keeping
  // ribbon thickness bounded without tiny freckles or solid slabs.
  vec2 q=p/scale;
  vec2 warp=vec2(vnoise(q*.68+vec2(1.7,9.2)),vnoise(q*.68+vec2(8.3,2.8)))-.5;
  float f=vnoise(q+warp*.92);
  float halfBand=mix(.19,.37,structure);
  return (halfBand-abs(f-.5))*scale*.9;
}`;
const source = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 outColor;
uniform float u_time,u_circle,u_stage,u_referencePalette,u_profile,u_structure;
uniform vec3 u_palette[7];
${workingSpace}
${area}
${smoothNoise}
vec3 originalGradient(vec2 p) {
  float t=length(p-vec2(1175.9,548.58))/801.007911;
  const vec3 a=vec3(.80000001,.14745097,.14745097);
  const vec3 b=vec3(.88235295,.49395481,.17993079);
  const vec3 c=vec3(.73333335,.62219149,.10352941);
  return t<.56?mix(a,b,clamp(t/.56,0.,1.)):mix(b,c,clamp((t-.56)/.425,0.,1.));
}
float areaColorPhase(vec2 p) {
  // Broad, continuously sloping C-infinity triangle wave across the vibrant ZDW
  // Colorama window (coral red -> orange -> yellow -> sky blue -> pastel pink):
  // echoes AE's continuous radial gradient without flat color stickers or seams.
  vec2 q=(p-u_baseSize*.5)/520.;
  vec2 warp=vec2(vnoise(q*.72+vec2(3.1,7.4)),vnoise(q*.72+vec2(11.2,1.9)))-.5;
  float u=(q.x*.78+q.y*.64)+warp.x*.72+warp.y*.48-.12;
  float tri=.5+.5*asin(.92*sin(u*3.14159265))/1.16808049;
  float drift=(vnoise(q*.85+warp*.6+vec2(2.3,4.7))-.5)*.22;
  float s=clamp(tri+drift,0.,1.);
  return mix(.362,.584,s);
}
vec3 colorama(float t) {
  if(u_referencePalette<.5) {
    const float phases[8]=float[8](${themePhases.map(phase=>phase.toFixed(9)).join(',')});
    float phase=t<phases[0]?t+1.:t;
    for(int i=1;i<8;i++) {
      if(phase<=phases[i]) {
        float weight=(phase-phases[i-1])/(phases[i]-phases[i-1]);
        return mix(u_palette[i-1],u_palette[i%7],weight)/255.;
      }
    }
    return u_palette[0]/255.;
  }
  const float stops[8]=float[8](${[AE_LIQUID.palettePositions.at(-1)-1,...AE_LIQUID.palettePositions,AE_LIQUID.palettePositions[0]+1].map(x=>x.toFixed(9)).join(',')});
  const vec3 colors[8]=vec3[8](${[AE_LIQUID.paletteColors.at(-1),...AE_LIQUID.paletteColors,AE_LIQUID.paletteColors[0]].map(c=>'vec3('+c.map(x=>x.toFixed(1)).join(',')+')').join(',')});
  for(int i=1;i<8;i++) if(t<=stops[i]) return mix(colors[i-1],colors[i],(t-stops[i-1])/(stops[i]-stops[i-1]))/255.;
  return colors[7]/255.;
}
void main() {
  vec2 p=workingPoint(v_uv);
  if(u_circle>.5) {
    float distance=117.*.89-abs(length(p-vec2(992.56,545.02))-253.*.89);
    float edge=max(fwidth(distance)*.5,.25);
    float alpha=smoothstep(-edge,edge,distance);
    outColor=floor(vec4(originalGradient(p)*alpha,alpha)*255.+.5)/255.;
    return;
  }
  vec2 areaUv=(p-u_baseSize*.5)/vec2(u_maskAspect*u_baseSize.y,u_baseSize.y)+.5;
  float rawDist=areaDistance(areaUv)*u_baseSize.y;
  float distance=rawDist;
  if(u_profile>.5 && rawDist>-26.) {
    // Convert any painted union (thin, merged, wide, or edge-touching) into
    // sculptural AE ribbons & large rounded voids at canonical 1080-short-side scale.
    float fieldScale=mix(275.,375.,u_structure);
    vec2 centered=p-u_baseSize*.5;
    float cavitySdf=ribbonSdf(centered+vec2(130.,75.),fieldScale,u_structure);
    // Keep edge-continuation overscan solid so painted frame borders never tear.
    float inFrameX=u_edgeExtension.x>0.?smoothstep(-4.,36.,min(p.x,u_baseSize.x-p.x)):1.;
    float inFrameY=u_edgeExtension.y>0.?smoothstep(-4.,36.,min(p.y,u_baseSize.y-p.y)):1.;
    float edgeSafe=inFrameX*inFrameY;
    float interior=smoothstep(34.,112.,rawDist)*edgeSafe;
    // Gentle organic edge modulation turns straight brush borders into fluid bays.
    float rimNoise=vnoise(centered/210.+vec2(3.7,8.1))-.5;
    float rimMod=rimNoise*48.*smoothstep(-18.,28.,rawDist)*(1.-interior*.55)*edgeSafe;
    distance=min(rawDist+rimMod,mix(rawDist+rimMod,cavitySdf,interior));
  }
  float edge=max(fwidth(distance)*.5,.5);
  float alpha=smoothstep(-edge,edge,distance);
  float phase=areaColorPhase(p);
  // Store unquantized premultiplied phase in R so float Colorama never suffers
  // 8-bit dark-seam quantization scratches along blurred or warped edges.
  outColor=vec4(phase*alpha,0.,0.,alpha);
}`;
const wave = source.slice(0,source.indexOf('void main()')) + `
uniform sampler2D u_input;
${sample}
void main() {
  vec2 p=workingPoint(v_uv);
  float phase=2.*fract((p.x+.18-u_time*106.7)/485.)-1.;
  p.y+=100.*(2.*sqrt(max(0.,1.-phase*phase))-1.)-.23;
  vec4 value=transparentSample(u_input,workingUv(p));
  if(u_circle>.5) {
    // The original is an 8bpc project. Wave Warp writes its raster before
    // Colorama reads straight RGB and replaces alpha on nonempty pixels.
    value=floor(value*255.+.5)/255.;
    if(u_stage>1.5 && value.a>0.) {
      vec3 rgb=value.rgb/value.a;
      value=vec4(colorama(dot(rgb,vec3(1./3.))-.001),1.);
    }
  } else if(u_stage>1.5) {
    if(value.a>.16) {
      float colorT=value.r/value.a;
      float edgeA=smoothstep(.16,.44,value.a);
      value=vec4(colorama(colorT)*edgeA,edgeA);
    } else {
      value=vec4(0.);
    }
  }
  outColor=value;
}`;
const filter = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 outColor;
uniform sampler2D u_input;
uniform vec2 u_direction,u_workSize;
uniform float u_radial,u_circle;
${sample}
void main() {
  vec4 value=vec4(0.);
  if(u_radial>.5) {
    vec2 p=(v_uv-.5)*u_workSize;
    // Cap effective spin radius for painted areas so top/bottom strokes on 9:16
    // keep the same crisp-vs-soft radial blur arc as the original AE ellipse.
    float radiusScale=u_circle>.5?1.:min(1.,420./max(length(p),1.));
    for(int i=-12;i<=12;i++) {
      float angle=(float(i)/12.*6.9194591+.318725861)*.01745329252*radiusScale,c=cos(angle),s=sin(angle);
      vec2 q=mat2(c,-s,s,c)*p;
      value+=transparentSample(u_input,q/u_workSize+.5);
    }
    value/=25.;
  } else {
    // Native Fast Box Blur has Repeat Edge Pixels enabled. The wave
    // and final displacement still read transparent outside their source.
    for(int i=-5;i<=5;i++) value+=texture(u_input,v_uv+u_direction*float(i));
    value/=11.;
  }
  outColor=value;
}`;
const compose = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 outColor;
uniform sampler2D u_input,u_displacement;
uniform float u_aspect,u_stage,u_structure,u_progress,u_circle;
${sample}
${workingSpace}
${area}
vec2 sampleDisplacement(vec2 p) {
  bool portrait=u_circle<.5 && u_baseSize.y>u_baseSize.x;
  vec2 dispUv=portrait
    ? vec2(p.y/u_baseSize.y,1.-p.x/u_baseSize.x)
    : (p-u_baseSize*.5)/vec2(1920.,1080.)+.5;
  vec4 packed=texture(u_displacement,dispUv);
  vec2 d=(vec2(packed.r*256.+packed.g,packed.b*256.+packed.a)*255.-32768.)/32.;
  return portrait?vec2(-d.y,d.x):d;
}
vec4 warpedSample(vec2 p) {
  vec2 q=p;
  if(u_stage>4.5) {
    q+=sampleDisplacement(p)*mix(1.35,.65,u_structure);
  }
  return transparentSample(u_input,workingUv(q));
}
void main() {
  vec2 p=u_baseSize*.5+(vec2(v_uv.x,1.-v_uv.y)-.5)*vec2(u_aspect*u_baseSize.y,u_baseSize.y);
  vec2 dx=dFdx(p)*.25,dy=dFdy(p)*.25;
  vec4 liquid=(warpedSample(p+dx+dy)+warpedSample(p+dx-dy)+warpedSample(p-dx+dy)+warpedSample(p-dx-dy))*.25;
  vec2 areaUv=(p-u_baseSize*.5)/vec2(u_maskAspect*u_baseSize.y,u_baseSize.y)+.5;
  float guide=areaDistance(areaUv);
  // Limit only the visible result. Organic taper avoids straight geometric cuts
  // while keeping remote ghost spots strictly zero outside the painted reach.
  if(u_stage>4.5 && u_circle<.5) {
    float limitDist=guide*u_baseSize.y;
    vec2 disp=sampleDisplacement(p);
    float organicShift=clamp((disp.x-disp.y*.7)*.14,-34.,34.)*smoothstep(-152.,-106.,limitDist);
    liquid*=smoothstep(-144.,-78.,limitDist+organicShift);
  }
  float alpha=smoothstep(-.001,.001,guide);
  outColor=mix(vec4(vec3(.38,.73,1.)*alpha,alpha),liquid,u_progress);
}`;

export class AELiquid {
  constructor(gl, compile) {
    this.gl=gl; this.floating=Boolean(gl.getExtension('EXT_color_buffer_float')||gl.getExtension('EXT_color_buffer_half_float')); this.sourceProgram=compile(source);this.waveProgram=compile(wave);this.filterProgram=compile(filter);this.composeProgram=compile(compose);
    this.targets=Array.from({length:2},()=>({texture:this.texture(),framebuffer:gl.createFramebuffer()}));
    this.map=this.texture();gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,this.map);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,960,540,0,gl.RGBA,gl.UNSIGNED_BYTE,aeDisplacement);
  }
  texture() {
    const gl=this.gl,t=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);
    for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
    for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
    return t;
  }
  mask(uniforms,options) {
    const gl=this.gl;
    for(const [name,unit,texture] of [['u_mask',1,options.mask],['u_nextMask',6,options.nextMask||options.mask]]) {
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniforms[name],unit);
    }
    gl.uniform1f(uniforms.u_morph,options.morph||0);
    gl.uniform1f(uniforms.u_maskAspect,options.maskAspect);
    gl.uniform2fv(uniforms.u_edgeExtension,options.extension);
    gl.uniform4fv(uniforms.u_from,options.from||[.5,.5,1,1]);gl.uniform4fv(uniforms.u_to,options.to||[.5,.5,1,1]);
  }
  render({width,height,aspect,maskAspect=aspect,time,structure=.5,palette,referencePalette=true,framebuffer,mask,nextMask,from,to,morph=0,progress=1,circle=false,stage=5,profile='stroke',edgeContact=[false,false]}) {
    const gl=this.gl;
    const baseW = circle ? 1920 : Math.round(1080 * Math.max(1, maskAspect));
    const baseH = circle ? 1080 : Math.round(1080 * Math.max(1, 1 / maskAspect));
    const extension = edgeContact.map(touched => touched ? EDGE_EXTENSION : 0);
    const padX = extension[0];
    const padY = extension[1];
    const w = baseW + 2 * padX, h = baseH + 2 * padY;
    const setWorkingSpace = uniforms => {
      gl.uniform2f(uniforms.u_workSize,w,h);
      gl.uniform2f(uniforms.u_workPadding,padX,padY);
      gl.uniform2f(uniforms.u_baseSize,baseW,baseH);
    };
    if(this.width!==w || this.height!==h) {
      for(const target of this.targets) {
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,target.texture);
        gl.texImage2D(gl.TEXTURE_2D,0,this.floating?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,this.floating?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
        gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.texture,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('AE liquid nelze připravit.');
      }
      this.width=w;this.height=h;
    }
    const dither=gl.isEnabled(gl.DITHER);gl.disable(gl.DITHER);
    const options={mask,nextMask,from,to,morph,maskAspect,extension};
    const src=this.sourceProgram;gl.useProgram(src.program);this.mask(src.uniforms,options);
    setWorkingSpace(src.uniforms);
    gl.uniform1f(src.uniforms.u_circle,Number(circle));gl.uniform1f(src.uniforms.u_profile,Number(profile==='stroke'));gl.uniform1f(src.uniforms.u_structure,structure);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[0].framebuffer);gl.viewport(0,0,w,h);gl.drawArrays(gl.TRIANGLES,0,3);
    let index=0;
    if(stage>=1) {
      const pass=this.waveProgram;gl.useProgram(pass.program);
      setWorkingSpace(pass.uniforms);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.targets[0].texture);gl.uniform1i(pass.uniforms.u_input,0);
      gl.uniform1f(pass.uniforms.u_circle,Number(circle));
      gl.uniform1f(pass.uniforms.u_time,((time%(1/AE_LIQUID.wave.speed))+(1/AE_LIQUID.wave.speed))%(1/AE_LIQUID.wave.speed));gl.uniform1f(pass.uniforms.u_stage,stage);gl.uniform1f(pass.uniforms.u_referencePalette,Number(referencePalette));
      if(palette)gl.uniform3fv(pass.uniforms['u_palette[0]'],palette);
      index=1;gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[index].framebuffer);gl.drawArrays(gl.TRIANGLES,0,3);
    }
    if(stage>=3) {
      const pass=this.filterProgram;gl.useProgram(pass.program);gl.uniform1i(pass.uniforms.u_input,0);
      gl.uniform2f(pass.uniforms.u_workSize,w,h);
      gl.uniform1f(pass.uniforms.u_circle,Number(circle));
      for(let i=0;i<(stage>=4?7:6);i++) {
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.targets[index].texture);
        index=1-index;gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[index].framebuffer);
        gl.uniform2f(pass.uniforms.u_direction,i%2===0?1/w:0,i%2?1/h:0);gl.uniform1f(pass.uniforms.u_radial,i===6?1:0);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }
    }
    const final=this.composeProgram;gl.useProgram(final.program);this.mask(final.uniforms,options);
    setWorkingSpace(final.uniforms);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.targets[index].texture);gl.uniform1i(final.uniforms.u_input,0);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,this.map);gl.uniform1i(final.uniforms.u_displacement,4);
    gl.uniform1f(final.uniforms.u_circle,Number(circle));
    gl.uniform1f(final.uniforms.u_aspect,aspect);gl.uniform1f(final.uniforms.u_stage,stage);gl.uniform1f(final.uniforms.u_structure,structure);gl.uniform1f(final.uniforms.u_progress,progress);
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,width,height);gl.drawArrays(gl.TRIANGLES,0,3);
    if(dither)gl.enable(gl.DITHER);
  }
  destroy() {
    const gl=this.gl;
    for(const p of [this.sourceProgram,this.waveProgram,this.filterProgram,this.composeProgram])gl.deleteProgram(p.program);
    for(const target of this.targets){gl.deleteTexture(target.texture);gl.deleteFramebuffer(target.framebuffer);}
    gl.deleteTexture(this.map);
  }
}
