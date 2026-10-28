import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Глибина різкості, як у кінокамери з великою матрицею: різко там, куди дивиться оператор (фокус), а ближче й далі —
 * м'яке розмиття, що росте з відстанню до площини фокуса. Плюс віньєтка й ледь помітне зерно плівки.
 * Одна відмальовка сцени (глибина — з того ж проходу) і один повноекранний прохід: 16 вибірок по диску «золотим кутом»
 * (на телефонах — 10 і без згладжування буфера, щоб кат-сцени не просідали).
 */
const DofShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null },
    focus: { value: 10 }, aperture: { value: 0.012 }, maxblur: { value: 0.012 },
    near: { value: 1 }, far: { value: 400 }, aspect: { value: 1.7 }, vign: { value: 0.35 }, grain: { value: 0.025 }, time: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth;
    uniform float focus, aperture, maxblur, near, far, aspect, vign, grain, time;
    varying vec2 vUv;
    float linZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
    float coc(float z) { return clamp(abs(z - focus) / max(z, 0.1) * aperture, 0.0, maxblur); }
    void main() {
      float zc = linZ(texture2D(tDepth, vUv).x), c0 = coc(zc);
      vec3 acc = texture2D(tDiffuse, vUv).rgb; float ws = 1.0;
      if (c0 > 0.0004) {
        for (int i = 0; i < TAPS; i++) {
          float r = sqrt((float(i) + 0.5) / float(TAPS)), a = float(i) * 2.39996;
          vec2 uv = vUv + vec2(cos(a) / aspect, sin(a)) * r * c0;
          float zs = linZ(texture2D(tDepth, uv).x), cs = coc(zs);
          // різкий предмет попереду не «розтікається» на розмитий фон за ним
          float w = zs < zc - 0.5 ? clamp(cs / max(r * c0, 1e-4), 0.0, 1.0) : 1.0;
          acc += texture2D(tDiffuse, uv).rgb * w; ws += w;
        }
      }
      vec3 col = acc / ws;
      vec2 q = vUv - 0.5; col *= 1.0 - vign * dot(q, q) * 1.8;
      float n = fract(sin(dot(vUv * 913.7 + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      col += n * grain * col;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class CineFX {
  constructor(renderer) {
    this.r = renderer;
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    const coarse = matchMedia('(pointer: coarse)').matches, ext = renderer.extensions;
    // буфер з плаваючою точністю — лише там, де в нього справді можна малювати (на багатьох телефонах — ні: білий екран);
    // на телефонах — звичайний 8-бітний, без згладжування
    const half = !coarse && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    const rt = new THREE.WebGLRenderTarget(s.x, s.y, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: coarse ? 0 : 4 });
    rt.depthTexture = new THREE.DepthTexture(s.x, s.y); rt.depthTexture.type = THREE.UnsignedIntType;
    this.comp = new EffectComposer(renderer, rt);
    // другий буфер композитор робить копією першого — і текстура глибини в копії ділить ту саму GPU-текстуру. Без
    // згладжування (телефони) шейдер тоді читає глибину, у яку сам пише: браузер відкидає кадр — білий екран.
    // Тому другому буферу — своя, окрема текстура глибини
    this.comp.renderTarget2.depthTexture = new THREE.DepthTexture(s.x, s.y); this.comp.renderTarget2.depthTexture.type = THREE.UnsignedIntType;
    this.rp = new RenderPass(null, null); this.dof = new ShaderPass({ ...DofShader, defines: { TAPS: coarse ? 10 : 16 } }); this.out = new OutputPass();
    this.comp.addPass(this.rp); this.comp.addPass(this.dof); this.comp.addPass(this.out);
    this.t = 0; this.ok = true; this.checked = false;
  }
  /** Чи буфери справді придатні для малювання (інакше — кат-сцени без ефекту, звичайним рендером). */
  verify() {
    const r = this.r, gl = r.getContext();
    try {
      for (const t of [this.comp.renderTarget1, this.comp.renderTarget2]) {
        r.setRenderTarget(t);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) this.ok = false;
      }
    } catch (_) { this.ok = false; }
    r.setRenderTarget(null);
    this.checked = true;
  }
  resize() { const s = this.r.getDrawingBufferSize(new THREE.Vector2()); this.comp.setPixelRatio(1); this.comp.setSize(s.x, s.y); }
  /** Кадр із фокусом на відстані focus (м); aperture — наскільки «мала глибина різкості» (0 — без розмиття). */
  render(scene, cam, focus, aperture, dt) {
    if (!this.checked) this.verify();
    if (!this.ok) return false;
    const s = this.r.getDrawingBufferSize(_s);
    if (s.x !== this.comp.renderTarget1.width || s.y !== this.comp.renderTarget1.height) this.resize();
    this.rp.scene = scene; this.rp.camera = cam;
    const u = this.dof.uniforms;
    u.tDepth.value = this.comp.readBuffer.depthTexture;
    // розмиття обмежене: фон і передній план м'які, але читаються (не «все в милі»)
    u.focus.value = focus; u.aperture.value = aperture * 0.7; u.maxblur.value = Math.min(0.0075, aperture * 0.6);
    u.near.value = cam.near; u.far.value = cam.far; u.aspect.value = cam.aspect; u.time.value = (this.t += dt) % 100;
    try { this.comp.render(dt); } catch (_) { this.ok = false; return false; }
    // шейдер не зібрався на цьому пристрої — більше не пробуємо
    const pr = this.r.properties.get(this.dof.material).currentProgram;
    if (pr && pr.diagnostics && pr.diagnostics.runnable === false) { this.ok = false; return false; }
    return true;
  }
}
const _s = new THREE.Vector2();
