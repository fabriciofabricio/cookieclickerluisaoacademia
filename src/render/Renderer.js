import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { isTouch } from '../core/utils.js';

// Presets gráficos. "auto" escolhe pelo dispositivo e ajusta pelo FPS.
export const QUALITY = {
  baixo: { pixelRatio: 0.8, shadows: false, shadowSize: 512, bloom: false, ao: false, aa: 'fxaa', dof: false, pointShadows: false, maxLights: 2 },
  medio: { pixelRatio: 1, shadows: true, shadowSize: 1024, bloom: true, ao: false, aa: 'fxaa', dof: false, pointShadows: false, maxLights: 4 },
  alto: { pixelRatio: 1.5, shadows: true, shadowSize: 2048, bloom: true, ao: true, aa: 'smaa', dof: true, pointShadows: false, maxLights: 8 },
  ultra: { pixelRatio: 2, shadows: true, shadowSize: 4096, bloom: true, ao: true, aa: 'smaa', dof: true, pointShadows: true, maxLights: 12 },
};

export function autoQuality() {
  const mobile = isTouch() && Math.min(screen.width, screen.height) < 900;
  if (mobile) return 'medio';
  const cores = navigator.hardwareConcurrency ?? 4;
  return cores >= 8 ? 'alto' : 'medio';
}

export class RenderPipeline {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.qualityName = 'alto';
    this.q = QUALITY.alto;
    this.scene = null;
    this.camera = null;
    this.composer = null;
    this.dofWanted = false;
    this.dofFocus = 3;
    this.fpsSamples = [];
    this.autoMode = false;
    this.autoChecked = 0;
    this.onAutoDowngrade = null;

    window.addEventListener('resize', () => this.resize());
  }

  setScene(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._buildComposer();
  }

  setQuality(name) {
    this.autoMode = name === 'auto';
    const resolved = this.autoMode ? autoQuality() : name;
    this.qualityName = resolved;
    this.q = QUALITY[resolved] ?? QUALITY.alto;
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.scene) {
      this.scene.traverse((o) => {
        if (o.isLight && o.castShadow !== undefined && o.shadow) {
          const wants = o.userData.shadowTier === 'point' ? this.q.pointShadows : this.q.shadows;
          // Só luzes marcadas fazem sombra (sol + lâmpada); postes e brilhos não.
          o.castShadow = wants && o.userData.castsShadow === true;
          if (o.shadow.map) {
            o.shadow.map.dispose();
            o.shadow.map = null;
          }
          const size = o.userData.shadowTier === 'point' ? Math.min(1024, this.q.shadowSize / 2) : this.q.shadowSize;
          o.shadow.mapSize.set(size, size);
        }
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.needsUpdate = true;
        }
      });
    }
    this._buildComposer();
    this.resize();
    return resolved;
  }

  _buildComposer() {
    if (!this.scene || !this.camera) return;
    const r = this.renderer;
    const q = this.q;
    this.composer?.dispose?.();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    r.setPixelRatio(pr);
    r.setSize(w, h, false);

    const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 0 });
    const composer = new EffectComposer(r, target);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(this.scene, this.camera));

    this.gtao = null;
    if (q.ao) {
      this.gtao = new GTAOPass(this.scene, this.camera, w, h);
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: this.qualityName === 'ultra' ? 16 : 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      composer.addPass(this.gtao);
    }

    this.bloom = null;
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 0.86);
      composer.addPass(this.bloom);
    }

    this.bokeh = null;
    if (q.dof) {
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: 3, aperture: 0.0016, maxblur: 0.006 });
      this.bokeh.enabled = this.dofWanted;
      composer.addPass(this.bokeh);
    }

    composer.addPass(new OutputPass());

    this.vignette = new ShaderPass(VignetteShader);
    this.vignette.uniforms.offset.value = 0.95;
    this.vignette.uniforms.darkness.value = 1.05;
    composer.addPass(this.vignette);

    if (q.aa === 'smaa') {
      const smaa = new SMAAPass();
      composer.addPass(smaa);
    } else {
      this.fxaa = new FXAAPass();
      composer.addPass(this.fxaa);
    }
    this.composer = composer;
  }

  setDOF(enabled, focus = 3) {
    this.dofWanted = enabled;
    this.dofFocus = focus;
    if (this.bokeh) {
      this.bokeh.enabled = enabled;
      this.bokeh.uniforms.focus.value = focus;
    }
  }

  setBloomBoost(v) {
    if (this.bloom) this.bloom.strength = 0.55 + v;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
    this.gtao?.setSize(w * pr, h * pr);
  }

  render(dt) {
    if (!this.scene || !this.camera) return;
    if (this.bokeh?.enabled) this.bokeh.uniforms.focus.value += (this.dofFocus - this.bokeh.uniforms.focus.value) * 0.15;
    this.composer.render(dt);
    this._trackFps(dt);
  }

  _trackFps(dt) {
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length > 90) this.fpsSamples.shift();
    if (!this.autoMode) return;
    this.autoChecked += dt;
    // Modo auto: se ficar abaixo de ~38 FPS por um tempo, desce um nível.
    if (this.autoChecked > 6 && this.fpsSamples.length >= 90) {
      this.autoChecked = 0;
      const fps = this.fps;
      const order = ['baixo', 'medio', 'alto', 'ultra'];
      const i = order.indexOf(this.qualityName);
      if (fps < 38 && i > 0) {
        const next = order[i - 1];
        this.qualityName = next;
        this.q = QUALITY[next];
        this.renderer.shadowMap.enabled = this.q.shadows;
        this._buildComposer();
        this.resize();
        this.onAutoDowngrade?.(next);
      }
    }
  }

  get fps() {
    if (!this.fpsSamples.length) return 60;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    return Math.round(1 / Math.max(avg, 1e-4));
  }

  /** Captura um quadro (foto de progresso) como JPEG pequeno. */
  capture(width = 320, height = 400) {
    this.composer.render(0);
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const sAspect = src.width / src.height;
    const dAspect = width / height;
    let sw = src.width;
    let sh = src.height;
    if (sAspect > dAspect) sw = sh * dAspect;
    else sh = sw / dAspect;
    ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, width, height);
    return c.toDataURL('image/jpeg', 0.72);
  }
}
