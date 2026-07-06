/**
 * EffectComposer chain: render → tonemap/sRGB output → grade pass.
 * The grade pass applies the film look: subtle vignette, animated grain,
 * a slight warm-yellow institutional cast, and — blended in smoothly by
 * `uDread` — a creeping chromatic aberration, desaturation, and sickly
 * green/yellow tint as global dread rises. All transitions are continuous;
 * nothing snaps or spikes.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CONFIG } from '../../config';

const fx = CONFIG.dread.postFx;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDread: { value: 0 },
    uVignette: { value: 0.42 },
    uVignetteMax: { value: fx.vignetteMax },
    uGrain: { value: 0.045 },
    uGrainMax: { value: fx.grainMax },
    uTint: { value: new THREE.Vector3(1.045, 1.0, 0.915) },
    uTintDread: { value: new THREE.Vector3(fx.sicklyTint[0], fx.sicklyTint[1], fx.sicklyTint[2]) },
    uCaStrength: { value: fx.chromaticAberration },
    uDesatMax: { value: fx.desaturateMax },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDread;
    uniform float uVignette;
    uniform float uVignetteMax;
    uniform float uGrain;
    uniform float uGrainMax;
    uniform vec3 uTint;
    uniform vec3 uTintDread;
    uniform float uCaStrength;
    uniform float uDesatMax;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + uTime * 43.7) * 43758.5453);
    }

    void main() {
      // chromatic aberration grows slowly with dread, edges only
      vec2 d = vUv - 0.5;
      vec2 caOffset = d * uDread * uCaStrength;
      float r = texture2D(tDiffuse, vUv - caOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + caOffset).b;
      vec4 col = vec4(r, g, b, 1.0);

      // warm grade blending toward a sickly yellow/green cast at high dread
      vec3 tint = mix(uTint, uTintDread, uDread);
      col.rgb *= tint;

      // slight desaturation late in the tour
      float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb = mix(col.rgb, vec3(lum), uDread * uDesatMax);

      // film grain, intensifying gently
      float grainAmt = mix(uGrain, uGrainMax, uDread);
      float gr = (hash(vUv * vec2(1920.0, 1080.0)) - 0.5) * grainAmt;
      col.rgb += gr;

      // vignette, deepening with dread
      float vig = mix(uVignette, uVignetteMax, uDread);
      float v = smoothstep(0.9, 0.25, dot(d, d) * 2.4);
      col.rgb *= mix(1.0 - vig, 1.0, v);

      gl_FragColor = col;
    }
  `,
};

export class PostProcessing {
  private composer: EffectComposer;
  private gradePass: ShaderPass;
  private time = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4, // MSAA inside the composer chain
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new OutputPass());
    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(dt: number, dreadLevel = 0): void {
    this.time += dt;
    this.gradePass.uniforms.uTime.value = this.time;
    this.gradePass.uniforms.uDread.value = dreadLevel;
    this.composer.render();
  }
}
