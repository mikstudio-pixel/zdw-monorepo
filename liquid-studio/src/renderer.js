import { LiquidSource } from './liquid-source.js';
import { createDeformationTexture, bindDeformation } from './liquid-deformation.js';
import { vertex, sourceFragment, glassFragment } from './shaders.js';

export class LiquidRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('Tento prohlížeč nemá dostupné WebGL 2. Referenční snímky najdete níže.');
    this.gl = gl;
    this.deformationTexture = createDeformationTexture(gl);
    this.liquidSource = new LiquidSource(gl, fragment => this.program(fragment));
    this.programs = [this.program(sourceFragment), this.program(glassFragment)];
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    for (const { program } of this.programs) {
      const location = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    }
    this.originalTexture = this.texture();
    this.pointerTexture = this.texture();
    this.fieldVersion = -1;
    this.sceneTexture = this.texture();
    this.framebuffer = gl.createFramebuffer();
    this.resize();
  }

  program(fragment) {
    const gl = this.gl;
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader);
        throw new Error(`Chyba kompilace shaderu: ${message}`);
      }
      gl.attachShader(program, shader); gl.deleteShader(shader);
    }
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const { name } = gl.getActiveUniform(program, i);
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }

  texture() {
    const gl = this.gl, texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
    return texture;
  }

  resize() {
    const gl = this.gl, { width, height } = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2, 2000 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width === w && this.canvas.height === h && this.allocated) return;
    this.canvas.width = w; this.canvas.height = h;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Nelze vytvořit vykreslovací plochu WebGL.');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.allocated = true;
  }

  upload(source) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  draw(state) {
    const gl = this.gl;
    const field = state.field;
    field.resize(this.canvas.width/this.canvas.height);
    state.births.resize(this.canvas.width/this.canvas.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.pointerTexture);
    if (this.fieldVersion !== field.version) {
      if (this.fieldWidth !== field.width || this.fieldHeight !== field.height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.width, field.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.data);
        this.fieldWidth = field.width; this.fieldHeight = field.height;
      } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, field.width, field.height, gl.RGBA, gl.UNSIGNED_BYTE, field.data);
      this.fieldVersion = field.version;
    }
    gl.bindVertexArray(this.vao);
    this.liquidSource.render(state.time);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const values = {
      u_resolution: [this.canvas.width, this.canvas.height], u_pointer: state.pointer,
      u_background: state.background, u_time: state.time, u_interaction: state.interaction ? state.pointerStrength : 0,
      u_procedural: state.mode === 'original' ? 0 : 1,
      u_reveal: state.mode === 'reveal' ? 1 : 0, u_repel: state.mode === 'repel' || state.mode === 'scatter' ? 1 : 0,
      u_erase: state.mode === 'repel' ? 1 : 0,
      u_repelStrength: state.mode === 'repel' ? 1 : state.repelStrength/100,
      u_glass: state.glass ? 1 : 0, u_size: state.size, u_zoom: state.zoom / 100, u_blur: state.blur,
      u_strength: state.strength / 100,
      u_aberration: state.aberration / 100,
      u_light: 1,
    };
    this.programs.forEach(({ program, uniforms }, index) => {
      gl.useProgram(program);
      bindDeformation(gl, this.deformationTexture, uniforms);
      this.liquidSource.bind(uniforms);
      gl.bindFramebuffer(gl.FRAMEBUFFER, index === 0 ? this.framebuffer : null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, index === 0 ? this.originalTexture : this.sceneTexture);
      gl.uniform1i(uniforms[index === 0 ? 'u_original' : 'u_scene'], 0);
      if (index === 0) {
        gl.uniform1i(uniforms.u_pointerField, 1);
        gl.uniform1i(uniforms.u_birthCount, state.births.items.length);
        gl.uniform4fv(uniforms['u_births[0]'], state.births.data);
      }
      for (const [name, value] of Object.entries(values)) {
        const location = uniforms[name];
        if (location === undefined) continue;
        if (Array.isArray(value)) gl[value.length === 2 ? 'uniform2fv' : 'uniform3fv'](location, value);
        else gl.uniform1f(location, value);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  }

  destroy() {
    const gl = this.gl;
    this.liquidSource.destroy();
    this.programs.forEach(({ program }) => gl.deleteProgram(program));
    gl.deleteTexture(this.originalTexture); gl.deleteTexture(this.sceneTexture);
    gl.deleteTexture(this.pointerTexture); gl.deleteTexture(this.deformationTexture);
    gl.deleteFramebuffer(this.framebuffer); gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao);
  }
}
