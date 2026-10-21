import { LiquidSource } from '../vendor/liquid-source.js';
import { createDeformationTexture, bindDeformation } from '../vendor/liquid-deformation.js';
import { vertex, sourceFragment, glassFragment } from '../vendor/shaders.js';
import { cropTransform, FORMATS, FPS, liquidPaletteFloats } from '../shared/settings.js';
import { sampleKeyframes } from '../shared/keyframes.js';
import { RegionMaps, REGION_SIZE } from '../shared/regions.js';
import { liquidGuides, liquidScale, MAX_LIQUID_GUIDES } from '../shared/liquid-guides.js';
import { liquidAreaDistance, liquidAreaFrame } from '../shared/liquid-area.js';
import { areaLiquidShader } from './liquid-area.js';

const regionUniforms = `
uniform sampler2D u_regions;
uniform sampler2D u_tiles;
uniform sampler2D u_nextTiles;
uniform float u_keyframeMix;
uniform vec2 u_tileOrigin;
uniform vec2 u_tileCount;
uniform float u_customGlass;
uniform float u_customLiquid;
uniform float u_editing;
uniform float u_areaPreview;
float selectedTile(vec2 tile) {
  vec2 cell=tile-u_tileOrigin;
  if(any(lessThan(cell,vec2(0.))) || any(greaterThanEqual(cell,u_tileCount))) return 0.;
  vec2 uv=(cell+.5)/u_tileCount;
  return mix(texture(u_tiles,uv).r,texture(u_nextTiles,uv).r,u_keyframeMix);
}
`;
// Preserve the web shader's optical calculations. The adapter only replaces
// placement and adds a non-exported editing visualization after the glass pass.
const placement = 'if(check<.5 || band*extent<.5)';
if (!glassFragment.includes(placement)) throw new Error('Shader skla změnil rozhraní pro oblasti. Aktualizujte adaptér rendereru.');
export const regionGlassFragment = glassFragment.replace('void main() {', regionUniforms + '\nvoid glassMain() {')
  .replace(placement, 'if(check<.5 || (u_customGlass>.5 ? selectedTile(tile)<.001 : band*extent<.5))') + `
void main() {
  glassMain();
  vec2 p=(v_uv-.5)*vec2(u_resolution.x/u_resolution.y,1.)*1080.;
  vec2 tile=floor(p/u_size);
  if(u_customGlass>.5) outColor.rgb=mix(texture(u_scene,v_uv).rgb,outColor.rgb,selectedTile(tile));
  if(u_editing<.5) return;
  float cell=selectedTile(tile)*step(.5,mod(tile.x+tile.y+200.,2.))*u_customGlass;
  vec3 masks=texture(u_regions,vec2(v_uv.x,1.-v_uv.y)).rgb;
  float gray=dot(outColor.rgb,vec3(.2126,.7152,.0722));
  vec3 color=mix(outColor.rgb,vec3(gray),cell*.9);
  color=mix(color,vec3(.38,.73,1.),max(masks.r*.24,cell*.10)*u_customGlass);
  color=mix(color,vec3(.38,.73,1.),masks.g*.5*u_areaPreview);
  outColor=vec4(color,1.);
}`;

// Both the reference scene and brush material use the calibrated web palette,
// filter chain and native deformation map. Only their source geometry differs.
const sourceHelpers = sourceFragment.slice(0, sourceFragment.indexOf('void main()'));
const liquidStructureShader = `
uniform float u_liquidStructure;
uniform float u_liquidScale;
`;
const guidedSourceFragment = sourceHelpers + `
uniform float u_structure;
void main() {
  vec2 q=(v_uv-.5)*vec2(1920.,-1080.);
  float wave=2.*fract((q.x+960.+.1377)/444.)-1.;
  q.y+=88.9598*(2.*sqrt(max(0.,1.-wave*wave))-1.)-.2167;
  float radius=253.*.89;
  float width=117.*.89*(1.-.28*max(0.,1.-u_structure*2.));
  float outside=length(q)-(radius+width);
  float opening=mix(radius-width,-13.,max(0.,u_structure*2.-1.))-length(q);
  float alpha=1.-smoothstep(-.6,.6,max(outside,opening));
  // Match the gradient's span to this compact source instead of the long
  // tutorial curve; keep the seven calibrated colors and their stop positions.
  vec3 color=referencePalette(1.-length(q-vec2(-16.,-58.))/525.);
  outColor=vec4(color*alpha,alpha);
}`;
// Each guide places the same filtered material with a stable orientation and
// phase. A smooth ping-pong of the measured evolution keeps long clips moving
// without a discontinuity when the native 4.36-second interval ends.
export const guidedLiquidFragment = sourceHelpers + `
${liquidStructureShader}
uniform vec4 u_guides[${MAX_LIQUID_GUIDES}];
uniform int u_guideCount;
uniform sampler2D u_liquidCuts;
void main() {
  vec2 p=(v_uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);
  vec3 weightedColor=vec3(0.);
  float weight=0.,alpha=0.;
  for(int i=0;i<${MAX_LIQUID_GUIDES};i++) {
    if(i>=u_guideCount) break;
    vec4 guide=u_guides[i];
    vec2 local=(p-guide.xy)/guide.z;
    float angle=guide.w*2.39996323;
    float c=cos(angle),s=sin(angle);
    local=mat2(c,-s,s,c)*local;
    if(any(greaterThan(abs(local),vec2(.89,.5)))) continue;
    float clock=2.18*(1.-cos(u_time*.42+guide.w));
    vec4 sampleColor=referenceLiquid(local,clock,.5);
    float sampleWeight=sampleColor.a*sampleColor.a;
    weightedColor+=sampleColor.rgb*sampleWeight;
    weight+=sampleWeight;
    alpha=1.-(1.-alpha)*(1.-sampleColor.a);
  }
  float erased=texture(u_liquidCuts,vec2(v_uv.x,1.-v_uv.y)).r;
  alpha*=1.-erased;
  outColor=vec4(weightedColor/max(weight,.00001)*alpha,alpha);
}`;
export const videoFragment = sourceFragment.slice(0, sourceFragment.indexOf('void main()')) + `
${regionUniforms}
${liquidStructureShader}
uniform vec2 u_cropScale;
uniform vec2 u_cropOffset;
uniform float u_liquidOpacity;
uniform sampler2D u_liquidSurface;
uniform float u_containMedia;
vec3 pixelBackdrop(vec2 uv) {
  vec2 scale=u_cropScale/max(u_cropScale.x,u_cropScale.y);
  vec2 cells=u_resolution/32.;
  vec2 center=((floor(uv*cells)+.5)/cells-.5)*scale+.5;
  vec2 blurStep=2.*scale/cells;
  vec3 color=vec3(0.);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
    float weight=float((x==0?2:1)*(y==0?2:1));
    color+=texture(u_original,center+vec2(float(x),float(y))*blurStep).rgb*weight;
  }
  color/=16.;
  float gray=dot(color,vec3(.2126,.7152,.0722));
  return mix(mix(vec3(gray),color,.4),vec3(1.),.35);
}
void main() {
  vec2 videoUv=vec2(v_uv.x,1.-v_uv.y)*u_cropScale+u_cropOffset;
  vec3 video=texture(u_original,videoUv).rgb;
  if(u_containMedia>.5 && (any(lessThan(videoUv,vec2(0.))) || any(greaterThan(videoUv,vec2(1.))))) video=pixelBackdrop(vec2(v_uv.x,1.-v_uv.y));
  vec2 p=(v_uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);
  float alpha;
  vec3 liquid;
  if(u_customLiquid>.5) {
    vec4 material=texture(u_liquidSurface,v_uv);
    alpha=material.a*u_liquidOpacity;
    liquid=material.rgb/max(material.a,.00001);
  } else {
    vec4 calibrated=referenceLiquid(p/u_liquidScale,u_time,u_liquidStructure);
    alpha=calibrated.a*u_liquidOpacity;
    liquid=calibrated.rgb;
  }
  alpha*=1.-u_areaPreview;

  outColor=vec4(mix(video,liquid,alpha),1.);
}`;

export class VideoRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL 2 není dostupné. Zkontrolujte grafický ovladač a restartujte aplikaci.');
    this.gl = gl;
    this.deformationTexture = createDeformationTexture(gl);
    this.programs = [this.program(vertex, videoFragment), this.program(vertex, regionGlassFragment)];
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.source = this.texture(); this.scene = this.texture();
    this.regionTexture = this.texture(); this.tileTexture = this.texture();
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.NEAREST);
    this.liquidTexture = this.texture(); this.liquidFramebuffer = gl.createFramebuffer();
    this.liquidPasses = [];
    this.framebuffer = gl.createFramebuffer();
  }
  // Allocate each filtered source only when that material is actually used.
  get liquidSource() {
    return this.referenceSource ||= new LiquidSource(this.gl, fragment => this.program(vertex, fragment));
  }
  get brushSource() {
    return this.guidedSource ||= new LiquidSource(this.gl, fragment => this.program(vertex, fragment), guidedSourceFragment);
  }
  get liquidProgram() { return this.guidedProgram ||= this.program(vertex, guidedLiquidFragment); }
  program(vertexSource, fragment) {
    const gl = this.gl, program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader);
        throw new Error(`Grafický efekt nelze načíst: ${error}`);
      }
      gl.attachShader(program, shader); gl.deleteShader(shader);
    }
    gl.bindAttribLocation(program, 0, 'a_position'); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = {};
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const { name } = gl.getActiveUniform(program, i);
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }
  texture() {
    const gl = this.gl, texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
    return texture;
  }
  resize(width, height) {
    if (this.canvas.width === width && this.canvas.height === height && this.allocated) return;
    const gl = this.gl;
    this.areaRenderKey = null;
    this.canvas.width = width; this.canvas.height = height;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.scene, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Grafická karta nemá dostatek paměti pro tento formát.');
    // The brush pass composites calibrated premultiplied material. Filtering is
    // performed once in the shared source, before each guide's deformation.
    this.liquidWidth = width / 2; this.liquidHeight = height / 2;
    gl.bindTexture(gl.TEXTURE_2D, this.liquidTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.liquidWidth, this.liquidHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.liquidFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.liquidTexture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Povrch liquidu nelze připravit.');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.allocated = true;
  }
  upload(source, width, height) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (width && height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      this.sourceAspect = width / height;
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      this.sourceAspect = (source.videoWidth || source.width) / (source.videoHeight || source.height);
    }
  }
  editableRegions(settings, time) {
    const maps = new RegionMaps(settings.regions);
    if (maps.custom.glass && maps.custom.liquid) return maps;
    // Capture the old procedural layout once so its first eraser stroke does
    // not discard the rest of the composition. The original file stays intact.
    const gl = this.gl;
    this.legacyMaskProgram ||= this.program(vertex, sourceHelpers + liquidStructureShader + `
      uniform float u_size;
      void main() {
        vec2 p=(v_uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);
        vec2 tile=floor(p*1080./u_size);
        vec2 center=(tile+.5)*u_size;
        float glass=step(.5,mod(tile.x+tile.y+200.,2.))*(1.-step(u_size*2.15,abs(center.y+.55*center.x)))*(1.-step(650.,abs(center.x)));
        float alpha=referenceLiquid(p/u_liquidScale,u_time,u_liquidStructure).a;
        outColor=vec4(glass,alpha,0.,1.);
      }`);
    gl.bindVertexArray(this.vao);
    this.liquidSource.render(time,(settings.liquidStructure ?? 50)/100,liquidPaletteFloats(settings.liquidColors));
    const target = gl.createFramebuffer(), texture = this.texture();
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, REGION_SIZE, REGION_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Oblasti nelze připravit k úpravě.');
      const { program, uniforms } = this.legacyMaskProgram;
      gl.useProgram(program); bindDeformation(gl, this.deformationTexture, uniforms); this.liquidSource.bind(uniforms); gl.bindVertexArray(this.vao); gl.viewport(0, 0, REGION_SIZE, REGION_SIZE);
      gl.uniform2fv(uniforms.u_resolution, FORMATS[settings.aspect]);
      gl.uniform1f(uniforms.u_time, time); gl.uniform1f(uniforms.u_size, settings.size);
      gl.uniform1f(uniforms.u_liquidStructure, (settings.liquidStructure ?? 50) / 100);
      gl.uniform1f(uniforms.u_liquidScale, liquidScale(settings.liquidStructure));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const pixels = new Uint8Array(REGION_SIZE * REGION_SIZE * 4);
      gl.readPixels(0, 0, REGION_SIZE, REGION_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      for (const [layer, channel] of [['glass', 0], ['liquid', 1]]) {
        if (maps.custom[layer]) continue;
        for (let y = 0; y < REGION_SIZE; y++) for (let x = 0; x < REGION_SIZE; x++) {
          maps.layers[layer][y * REGION_SIZE + x] = pixels[((REGION_SIZE - 1 - y) * REGION_SIZE + x) * 4 + channel];
        }
        maps.custom[layer] = true;
      }
      maps.version++;
      return maps;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteTexture(texture); gl.deleteFramebuffer(target);
    }
  }
  updateRegions(settings, aspect, draft, areaPreview = false) {
    if (!draft && this.savedRegions !== settings.regions) {
      this.maps = new RegionMaps(settings.regions); this.savedRegions = settings.regions;
    }
    const maps = draft || this.maps || (this.maps = new RegionMaps());
    const changed = this.uploadedMaps !== maps || this.uploadedVersion !== maps.version;
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (changed) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.regionTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, REGION_SIZE, REGION_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, maps.textureData());
    }
    if (changed || this.tileSize !== settings.size || this.tileAspect !== aspect) {
      this.tiles = maps.tiles(settings.size, aspect);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tileTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ...this.tiles.count, 0, gl.RED, gl.UNSIGNED_BYTE, this.tiles.data);
      this.tileSize = settings.size; this.tileAspect = aspect;
    }
    this.uploadedMaps = maps; this.uploadedVersion = maps.version;
    if (maps.liquidMode === 'area') {
      // Do no distance transforms or material generation during painting.
      if (!areaPreview && (this.areaMaps !== maps || this.areaVersion !== maps.liquidVersion || this.areaAspect !== aspect)) {
        this.areaTexture ||= this.texture();
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.areaTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, REGION_SIZE, REGION_SIZE, 0, gl.RED, gl.FLOAT, liquidAreaDistance(maps.layers.liquid, aspect, { float: true }));
        this.areaMaps = maps; this.areaVersion = maps.liquidVersion; this.areaAspect = aspect;
        this.areaFrame = liquidAreaFrame(maps.layers.liquid);
        this.areaRenderKey = null;
      }
      return maps;
    }
    const structure = settings.liquidStructure ?? 50;
    if (this.guideMaps !== maps || this.guideVersion !== maps.liquidVersion || this.guideAspect !== aspect || this.guideStructure !== structure) {
      const passes = maps.custom.liquid ? maps.liquidPasses : [];
      while (this.liquidPasses.length > passes.length) gl.deleteTexture(this.liquidPasses.pop().texture);
      this.guideCount = 0;
      passes.forEach((pass, index) => {
        const target = this.liquidPasses[index] ||= { texture: this.texture() };
        const guides = liquidGuides(pass.mask, aspect, structure, pass.diameter);
        target.count = guides.length; target.data = new Float32Array(MAX_LIQUID_GUIDES * 4);
        guides.forEach((guide, i) => target.data.set(guide, i * 4));
        this.guideCount += guides.length;
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, target.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, REGION_SIZE, REGION_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, pass.erase);
      });
      this.guideMaps = maps; this.guideVersion = maps.liquidVersion; this.guideAspect = aspect;
      this.guideStructure = structure;
    }
    return maps;
  }
  updateNextRegions(regions, aspect, size) {
    const changed = this.nextRegions !== regions || this.nextAspect !== aspect;
    if (!changed && this.nextSize === size) return;
    const gl = this.gl;
    if (changed) this.nextMaps = new RegionMaps(regions);
    if (!this.nextTileTexture) {
      this.nextTileTexture = this.texture();
      for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.NEAREST);
    }
    const tiles = this.nextMaps.tiles(size, aspect);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.nextTileTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ...tiles.count, 0, gl.RED, gl.UNSIGNED_BYTE, tiles.data);
    if (changed) {
      this.areaNextTexture ||= this.texture();
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.areaNextTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, REGION_SIZE, REGION_SIZE, 0, gl.RED, gl.FLOAT, liquidAreaDistance(this.nextMaps.layers.liquid, aspect, { float: true }));
      this.nextAreaFrame = liquidAreaFrame(this.nextMaps.layers.liquid);
      this.areaRenderKey = null;
    }
    this.nextRegions = regions; this.nextAspect = aspect; this.nextSize = size;
  }
  drawArea(width, height, time, structure, colors, progress, mix = 0) {
    const key = [width, height, time, structure, ...colors, progress, mix].join(',');
    if (this.areaRenderKey === key) return;
    const gl = this.gl;
    this.areaProgram ||= this.program(vertex, areaLiquidShader(sourceHelpers));
    const { program, uniforms } = this.areaProgram;
    gl.useProgram(program); gl.bindFramebuffer(gl.FRAMEBUFFER, this.liquidFramebuffer);
    bindDeformation(gl, this.deformationTexture, uniforms);
    gl.uniform1f(uniforms.u_structure, structure / 100);
    gl.uniform1f(uniforms.u_customPalette, 1);
    gl.uniform3fv(uniforms['u_paletteColors[0]'], liquidPaletteFloats(colors));
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.areaTexture);
    gl.uniform1i(uniforms.u_areaDistance, 1);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, mix ? this.areaNextTexture : this.areaTexture);
    gl.uniform1i(uniforms.u_areaNextDistance, 6); gl.uniform1f(uniforms.u_keyframeMix, mix);
    gl.uniform4fv(uniforms.u_areaFrom, this.areaFrame);
    gl.uniform4fv(uniforms.u_areaTo, mix ? this.nextAreaFrame : this.areaFrame);
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform1f(uniforms.u_time, time);
    gl.uniform1f(uniforms.u_areaProgress, progress);
    gl.viewport(0, 0, this.liquidWidth, this.liquidHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.areaRenderKey = key;
  }
  drawLiquid(width, height, time, structure, passes = this.liquidPasses, raster = [this.liquidWidth, this.liquidHeight], colors) {
    this.areaRenderKey = null;
    const gl = this.gl, { program, uniforms } = this.liquidProgram;
    this.brushSource.render(0, structure / 100, liquidPaletteFloats(colors));
    gl.useProgram(program); gl.bindFramebuffer(gl.FRAMEBUFFER, this.liquidFramebuffer);
    bindDeformation(gl, this.deformationTexture, uniforms);
    this.brushSource.bind(uniforms);
    gl.viewport(0, 0, ...raster);
    gl.uniform1i(uniforms.u_liquidCuts, 1);
    gl.uniform2f(uniforms.u_resolution, width, height); gl.uniform1f(uniforms.u_time, time);
    gl.uniform1f(uniforms.u_liquidStructure, structure / 100);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const pass of passes) {
      if (!pass.count) continue;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, pass.texture);
      gl.uniform1i(uniforms.u_guideCount, pass.count);
      gl.uniform4fv(uniforms['u_guides[0]'], pass.data);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
  }
  liquidCoverage(settings, time, maps) {
    const [width, height] = FORMATS[settings.aspect], gl = this.gl;
    this.resize(width, height);
    this.updateRegions(settings, width / height, maps);
    gl.bindVertexArray(this.vao);
    const pixels = new Uint8Array(REGION_SIZE * REGION_SIZE * 4);
    try {
      return this.liquidPasses.map((pass, index) => {
        this.drawLiquid(width, height, time, settings.liquidStructure ?? 50, [pass], [REGION_SIZE, REGION_SIZE], settings.liquidColors);
        gl.readPixels(0, 0, REGION_SIZE, REGION_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Tah liquidu nelze vybrat.');
        const alpha = new Uint8Array(REGION_SIZE * REGION_SIZE);
        for (let y = 0; y < REGION_SIZE; y++) for (let x = 0; x < REGION_SIZE; x++) {
          alpha[y * REGION_SIZE + x] = pixels[((REGION_SIZE - 1 - y) * REGION_SIZE + x) * 4 + 3];
        }
        return { pass: maps.liquidPasses[index], alpha };
      });
    } finally {
      // Restore the normal preview after using the offscreen material target.
      this.draw(settings, time, { regions: maps, editing: true });
    }
  }
  draw(settings, time, { regions, editing = false, areaPreview = false, areaProgress = 1, useKeyframes = true, previewScale = 1 } = {}) {
    const animation = useKeyframes && !regions ? sampleKeyframes(settings, time * FPS) : { state: settings, mix: 0 };
    settings = animation.state;
    const [width, height] = FORMATS[settings.aspect].map(value => Math.round(value * previewScale));
    this.resize(width, height);
    const gl = this.gl;
    if (gl.isContextLost()) throw new Error('Grafický kontext byl přerušen. Restartujte aplikaci a zkuste export znovu.');
    const crop = cropTransform(this.sourceAspect || 16 / 9, width / height, settings);
    const maps = this.updateRegions(settings, width / height, regions, areaPreview);
    if (animation.mix) this.updateNextRegions(animation.next, width / height, settings.size);
    const values = {
      u_resolution: [width, height], u_cropScale: crop.scale, u_cropOffset: crop.offset,
      u_containMedia: Number(settings.mediaFit === 'contain'),
      u_liquidOpacity: settings.liquid ? settings.opacity / 100 : 0, u_time: time,
      u_liquidStructure: (settings.liquidStructure ?? 50) / 100, u_liquidScale: liquidScale(settings.liquidStructure),
      u_pointer: [.5, .5], u_interaction: 0, u_glass: 1, u_size: settings.size,
      // Match the web renderer: neutral magnification and enabled rim lighting.
      u_zoom: 1, u_light: 1, u_blur: settings.blur, u_strength: settings.strength / 100, u_aberration: settings.aberration / 100,
      u_customGlass: Number(maps.custom.glass), u_customLiquid: Number(maps.custom.liquid), u_editing: Number(editing),
      u_areaPreview: Number(areaPreview),
      u_keyframeMix: animation.mix,
      u_tileOrigin: this.tiles.origin, u_tileCount: this.tiles.count,
    };
    gl.bindVertexArray(this.vao);
    if (maps.liquidMode !== 'area') this.liquidSource.render(time,(settings.liquidStructure ?? 50)/100,liquidPaletteFloats(settings.liquidColors));
    if (maps.custom.liquid && settings.liquid && !areaPreview) {
      if (maps.liquidMode === 'area') this.drawArea(width, height, time, settings.liquidStructure ?? 50, settings.liquidColors, areaProgress, animation.mix);
      else this.drawLiquid(width, height, time, settings.liquidStructure ?? 50, this.liquidPasses, [this.liquidWidth, this.liquidHeight], settings.liquidColors);
    }
    gl.viewport(0, 0, width, height);
    this.programs.forEach(({ program, uniforms }, index) => {
      gl.useProgram(program); bindDeformation(gl, this.deformationTexture, uniforms);
      if (maps.liquidMode !== 'area') this.liquidSource.bind(uniforms);
      gl.bindFramebuffer(gl.FRAMEBUFFER, index === 0 ? this.framebuffer : null);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, index === 0 ? this.source : this.scene);
      gl.uniform1i(uniforms[index === 0 ? 'u_original' : 'u_scene'], 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.regionTexture);
      if (uniforms.u_regions !== undefined) gl.uniform1i(uniforms.u_regions, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tileTexture);
      if (uniforms.u_tiles !== undefined) gl.uniform1i(uniforms.u_tiles, 2);
      gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, animation.mix ? this.nextTileTexture : this.tileTexture);
      if (uniforms.u_nextTiles !== undefined) gl.uniform1i(uniforms.u_nextTiles, 7);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.liquidTexture);
      if (uniforms.u_liquidSurface !== undefined) gl.uniform1i(uniforms.u_liquidSurface, 3);
      for (const [name, value] of Object.entries(values)) {
        if (uniforms[name] === undefined) continue;
        if (Array.isArray(value)) gl.uniform2fv(uniforms[name], value);
        else gl.uniform1f(uniforms[name], value);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  }
  readPixels() {
    const gl = this.gl, { width, height } = this.canvas;
    const size = width * height * 4;
    if (this.pixels?.length !== size) { this.pixels = new Uint8Array(size); this.topDown = new Uint8Array(size); }
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error(`Čtení snímku z grafické karty selhalo (${error}).`);
    const row = width * 4;
    for (let y = 0; y < height; y++) this.topDown.set(this.pixels.subarray(y * row, (y + 1) * row), (height - y - 1) * row);
    return this.topDown;
  }
  destroy() {
    const gl = this.gl;
    this.referenceSource?.destroy();
    this.guidedSource?.destroy();
    this.programs.forEach(({ program }) => gl.deleteProgram(program));
    if (this.legacyMaskProgram) gl.deleteProgram(this.legacyMaskProgram.program);
    if (this.guidedProgram) gl.deleteProgram(this.guidedProgram.program);
    gl.deleteTexture(this.liquidTexture); gl.deleteFramebuffer(this.liquidFramebuffer);
    if (this.areaProgram) gl.deleteProgram(this.areaProgram.program);
    if (this.areaTexture) gl.deleteTexture(this.areaTexture);
    if (this.areaNextTexture) gl.deleteTexture(this.areaNextTexture);
    if (this.nextTileTexture) gl.deleteTexture(this.nextTileTexture);
    gl.deleteTexture(this.source); gl.deleteTexture(this.scene); gl.deleteFramebuffer(this.framebuffer);
    gl.deleteTexture(this.deformationTexture);
    gl.deleteTexture(this.regionTexture); gl.deleteTexture(this.tileTexture);
    this.liquidPasses.forEach(pass => gl.deleteTexture(pass.texture));
    gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao);
  }
}
