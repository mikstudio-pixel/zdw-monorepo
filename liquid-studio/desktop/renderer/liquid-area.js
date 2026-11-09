import { AE_LIQUID, aeDisplacement } from '../vendor/liquid-ae-data.js';
import { NATIVE_AREA_DISTANCE_RANGE as AREA_DISTANCE_RANGE } from '../shared/liquid-area.js';

const EDGE_EXTENSION = 128; // Pixels in the original 1080p composition.
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
uniform vec2 u_workSize,u_workPadding;
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
  vec2 distance=border*vec2(u_maskAspect,1.)+u_edgeExtension/1080.;
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
const source = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 outColor;
uniform float u_time,u_circle,u_stage,u_referencePalette,u_profile,u_structure;
uniform vec3 u_palette[7];
${workingSpace}
${area}
vec3 originalGradient(vec2 p) {
  float t=length(p-vec2(1175.9,548.58))/801.007911;
  const vec3 a=vec3(.80000001,.14745097,.14745097);
  const vec3 b=vec3(.88235295,.49395481,.17993079);
  const vec3 c=vec3(.73333335,.62219149,.10352941);
  return t<.56?mix(a,b,clamp(t/.56,0.,1.)):mix(b,c,clamp((t-.56)/.425,0.,1.));
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
  float distance=u_circle>.5?117.*.89-abs(length(p-vec2(992.56,545.02))-253.*.89)
    :areaDistance((p-vec2(960.,540.))/vec2(u_maskAspect*1080.,1080.)+.5)*1080.;
  if(u_circle<.5 && u_profile>.5) distance=min(distance,234.*.89*mix(.72,1.28,u_structure)-distance);
  float edge=max(fwidth(distance)*.5,.25);
  float alpha=smoothstep(-edge,edge,distance);
  outColor=floor(vec4(originalGradient(p)*alpha,alpha)*255.+.5)/255.;
}`;
const wave = source.slice(0,source.indexOf('void main()')) + `
uniform sampler2D u_input;
${sample}
void main() {
  vec2 p=workingPoint(v_uv);
  float phase=2.*fract((p.x+.18-u_time*106.7)/485.)-1.;
  p.y+=100.*(2.*sqrt(max(0.,1.-phase*phase))-1.)-.23;
  vec4 value=transparentSample(u_input,workingUv(p));
  // The original is an 8bpc project. Wave Warp writes its raster before
  // Colorama reads straight RGB and replaces alpha on nonempty pixels.
  value=floor(value*255.+.5)/255.;
  if(u_stage>1.5 && value.a>0.) {
    vec3 rgb=value.rgb/value.a;
    value=vec4(colorama(dot(rgb,vec3(1./3.))-.001),1.);
  }
  outColor=value;
}`;
const filter = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 outColor;
uniform sampler2D u_input;
uniform vec2 u_direction,u_workSize;
uniform float u_radial;
${sample}
void main() {
  vec4 value=vec4(0.);
  if(u_radial>.5) {
    vec2 p=(v_uv-.5)*u_workSize;
    for(int i=-12;i<=12;i++) {
      float angle=(float(i)/12.*6.9194591+.318725861)*.01745329252,c=cos(angle),s=sin(angle);
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
vec4 warpedSample(vec2 p) {
  vec2 q=p;
  if(u_stage>4.5) {
    vec4 packed=texture(u_displacement,p/vec2(1920.,1080.));
    vec2 displacement=(vec2(packed.r*256.+packed.g,packed.b*256.+packed.a)*255.-32768.)/32.;
    q+=displacement*mix(1.35,.65,u_structure);
  }
  return transparentSample(u_input,workingUv(q));
}
void main() {
  vec2 p=vec2(960.,540.)+(vec2(v_uv.x,1.-v_uv.y)-.5)*vec2(u_aspect*1080.,1080.);
  vec2 dx=dFdx(p)*.25,dy=dFdy(p)*.25;
  vec4 liquid=(warpedSample(p+dx+dy)+warpedSample(p+dx-dy)+warpedSample(p-dx+dy)+warpedSample(p-dx-dy))*.25;
  vec2 areaUv=(p-vec2(960.,540.))/vec2(u_maskAspect*1080.,1080.)+.5;
  float guide=areaDistance(areaUv);
  // Limit only the visible result. The overscan can still feed material
  // across painted edges, and the measured warp stays intact near the brush.
  if(u_stage>4.5 && u_circle<.5) liquid*=smoothstep(-112.,-56.,guide*1080.);
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
    const extension = edgeContact.map(touched => touched ? EDGE_EXTENSION : 0);
    // Portrait and square sources already have space beside the visible crop.
    const horizontalMargin = Math.max(0, (1920 - maskAspect * 1080) / 2);
    const padX = Math.max(0, Math.ceil(extension[0] - horizontalMargin));
    const padY = extension[1];
    const w = 1920 + 2 * padX, h = 1080 + 2 * padY;
    const setWorkingSpace = uniforms => {
      gl.uniform2f(uniforms.u_workSize,w,h);
      gl.uniform2f(uniforms.u_workPadding,padX,padY);
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
      gl.uniform1f(pass.uniforms.u_time,((time%(1/AE_LIQUID.wave.speed))+(1/AE_LIQUID.wave.speed))%(1/AE_LIQUID.wave.speed));gl.uniform1f(pass.uniforms.u_stage,stage);gl.uniform1f(pass.uniforms.u_referencePalette,Number(referencePalette));
      if(palette)gl.uniform3fv(pass.uniforms['u_palette[0]'],palette);
      index=1;gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[index].framebuffer);gl.drawArrays(gl.TRIANGLES,0,3);
    }
    if(stage>=3) {
      const pass=this.filterProgram;gl.useProgram(pass.program);gl.uniform1i(pass.uniforms.u_input,0);
      gl.uniform2f(pass.uniforms.u_workSize,w,h);
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
