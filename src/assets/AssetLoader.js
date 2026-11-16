import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import available from 'virtual:asset-list';
import { ASSETS, TEXTURE_MAPS, TEXTURE_EXTS, AUDIO_EXTS } from '../config/assets.manifest.js';
import { proceduralSet } from '../render/ProceduralTextures.js';

// ════════════════════════════════════════════════════════════════
//  Carregador central. Só tenta baixar o que realmente existe em
//  /public/assets (lista gerada pelo plugin do Vite). O resto cai
//  no fallback procedural, então o jogo SEMPRE roda.
// ════════════════════════════════════════════════════════════════

const BASE = `${import.meta.env.BASE_URL}assets/`;
const AVAILABLE = new Set(available);

export class AssetLoader {
  constructor(renderer) {
    this.renderer = renderer;
    this.manager = new THREE.LoadingManager();
    this.gltf = new GLTFLoader(this.manager);

    const draco = new DRACOLoader(this.manager);
    draco.setDecoderPath(`${import.meta.env.BASE_URL}libs/draco/`);
    this.gltf.setDRACOLoader(draco);

    this.ktx2 = new KTX2Loader(this.manager);
    this.ktx2.setTranscoderPath(`${import.meta.env.BASE_URL}libs/basis/`);
    this.ktx2.detectSupport(renderer);
    this.gltf.setKTX2Loader(this.ktx2);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);

    this.texLoader = new THREE.TextureLoader(this.manager);
    this.hdr = new HDRLoader(this.manager);
    this.cache = new Map();
  }

  static has(path) {
    return AVAILABLE.has(path);
  }

  static get count() {
    return AVAILABLE.size;
  }

  url(path) {
    return BASE + path;
  }

  /** Carrega um .glb se existir; senão retorna null (sem erro). */
  async loadGLTF(path) {
    if (!path || !AVAILABLE.has(path)) return null;
    if (this.cache.has(path)) return this.cache.get(path);
    const p = this.gltf.loadAsync(this.url(path)).catch((err) => {
      console.warn(`[Assets] falhou ao carregar ${path}, usando fallback`, err);
      return null;
    });
    this.cache.set(path, p);
    return p;
  }

  async loadCharacter(key) {
    return this.loadGLTF(ASSETS.characters[key]);
  }

  /** Carrega todos os clipes de animação disponíveis: { idle: AnimationClip, ... } */
  async loadAnimations() {
    const out = {};
    await Promise.all(
      Object.entries(ASSETS.animations).map(async ([state, path]) => {
        const g = await this.loadGLTF(path);
        if (g?.animations?.length) {
          const clip = g.animations[0].clone();
          clip.name = state;
          out[state] = clip;
        }
      }),
    );
    return out;
  }

  async loadHDRI(key) {
    const path = ASSETS.hdri[key];
    if (!path || !AVAILABLE.has(path)) return null;
    try {
      const tex = await this.hdr.loadAsync(this.url(path));
      tex.mapping = THREE.EquirectangularReflectionMapping;
      return tex;
    } catch (err) {
      console.warn('[Assets] HDRI falhou', err);
      return null;
    }
  }

  _findTextureFile(prefix, map) {
    for (const ext of TEXTURE_EXTS) {
      const p = `${prefix}_${map}.${ext}`;
      if (AVAILABLE.has(p)) return p;
    }
    return null;
  }

  async _loadTex(path, srgb) {
    const loader = path.endsWith('.ktx2') ? this.ktx2 : this.texLoader;
    const t = await loader.loadAsync(this.url(path));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return t;
  }

  /**
   * Conjunto PBR: tenta a textura real (Poly Haven), senão gera procedural.
   * @param key chave em ASSETS.textures (concrete_floor, plaster_wall...)
   * @param procKind receita procedural correspondente
   */
  async pbr(key, procKind, opts = {}) {
    const prefix = ASSETS.textures[key];
    const albedo = prefix && this._findTextureFile(prefix, 'albedo');
    if (albedo) {
      try {
        const set = {};
        for (const map of TEXTURE_MAPS) {
          const file = this._findTextureFile(prefix, map);
          if (!file) continue;
          const t = await this._loadTex(file, map === 'albedo');
          t.repeat.set(...(opts.repeat ?? [1, 1]));
          const name = { albedo: 'map', normal: 'normalMap', roughness: 'roughnessMap', ao: 'aoMap' }[map];
          set[name] = t;
        }
        return set;
      } catch (err) {
        console.warn(`[Assets] textura ${key} falhou, usando procedural`, err);
      }
    }
    return proceduralSet(procKind, opts);
  }

  /** Ilustração 2D da waifu (PNG), ou null se não existir. */
  async loadWaifuImage(key) {
    const path = ASSETS.waifus?.[key];
    if (!path || !AVAILABLE.has(path)) return null;
    if (this.cache.has(path)) return this.cache.get(path);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = this.url(path);
    });
    this.cache.set(path, p);
    return p;
  }

  audioUrl(key) {
    const prefix = ASSETS.audio[key];
    if (!prefix) return null;
    for (const ext of AUDIO_EXTS) {
      const p = `${prefix}.${ext}`;
      if (AVAILABLE.has(p)) return this.url(p);
    }
    return null;
  }
}
