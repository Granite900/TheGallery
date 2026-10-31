/** PBR material library shared by all scenes. */
import { Color3, PBRMaterial, Scene, Texture, DynamicTexture, Material } from '@babylonjs/core';
import { scaledSet } from './proctex';

export class Mats {
  private cache = new Map<string, PBRMaterial>();
  constructor(public scene: Scene) {}

  private get(key: string, make: () => PBRMaterial): PBRMaterial {
    let m = this.cache.get(key);
    if (!m) {
      m = make();
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  base(name: string, color: Color3, metallic: number, roughness: number): PBRMaterial {
    const m = new PBRMaterial(name, this.scene);
    m.albedoColor = color;
    m.metallic = metallic;
    m.roughness = roughness;
    return m;
  }

  chrome(rough = 0.1): PBRMaterial {
    return this.get(`chrome-${rough}`, () => {
      const m = this.base('chrome', new Color3(0.93, 0.93, 0.95), 1, rough);
      return m;
    });
  }

  /** Satin / brushed chrome with anisotropic highlights (top plates) */
  satinChrome(): PBRMaterial {
    return this.get('satinChrome', () => {
      const m = this.base('satin', new Color3(0.86, 0.86, 0.87), 1, 0.27);
      m.anisotropy.isEnabled = true;
      m.anisotropy.intensity = 0.7;
      const s = scaledSet(this.scene, 'scratches', 2, 2);
      m.metallicTexture = s.orm;
      m.useRoughnessFromMetallicTextureGreen = true;
      m.useMetallnessFromMetallicTextureBlue = false;
      m.useAmbientOcclusionFromMetallicTextureRed = false;
      m.roughness = 1;
      return m;
    });
  }

  blackPaint(): PBRMaterial {
    return this.get('blackPaint', () => {
      const m = this.base('blackPaint', new Color3(0.018, 0.018, 0.02), 0, 0.32);
      m.clearCoat.isEnabled = true;
      m.clearCoat.intensity = 0.6;
      m.clearCoat.roughness = 0.18;
      return m;
    });
  }

  satinBlack(): PBRMaterial {
    return this.get('satinBlack', () => this.base('satinBlack', new Color3(0.022, 0.022, 0.024), 0.2, 0.5));
  }

  anodised(color = new Color3(0.02, 0.02, 0.022)): PBRMaterial {
    return this.get(`anod-${color.toHexString()}`, () => this.base('anod', color, 0.85, 0.38));
  }

  aluminium(): PBRMaterial {
    return this.get('alu', () => {
      const m = this.base('alu', new Color3(0.8, 0.81, 0.82), 1, 0.35);
      m.anisotropy.isEnabled = true;
      m.anisotropy.intensity = 0.5;
      return m;
    });
  }

  brass(): PBRMaterial {
    return this.get('brass', () => this.base('brass', new Color3(0.86, 0.66, 0.34), 1, 0.3));
  }

  rubber(): PBRMaterial {
    return this.get('rubber', () => this.base('rubber', new Color3(0.025, 0.025, 0.025), 0, 0.85));
  }

  plastic(color: Color3, rough = 0.45): PBRMaterial {
    return this.get(`plastic-${color.toHexString()}-${rough}`, () => this.base('plastic', color, 0, rough));
  }

  leatherette(uScale = 4, vScale = 4, brown = false): PBRMaterial {
    return this.get(`leather-${brown}-${uScale}-${vScale}`, () => {
      const s = scaledSet(this.scene, brown ? 'leatherBrown' : 'leatherette', uScale, vScale);
      const m = new PBRMaterial('leather', this.scene);
      m.albedoTexture = s.albedo;
      m.bumpTexture = s.normal;
      m.bumpTexture.level = 1;
      m.metallicTexture = s.orm;
      m.useRoughnessFromMetallicTextureGreen = true;
      m.useMetallnessFromMetallicTextureBlue = true;
      m.useAmbientOcclusionFromMetallicTextureRed = true;
      m.metallic = 1;
      m.roughness = 1;
      return m;
    });
  }

  knurled(uScale = 1, vScale = 1, color = new Color3(0.03, 0.03, 0.03), metal = 0.2): PBRMaterial {
    return this.get(`knurl-${uScale}-${vScale}-${color.toHexString()}-${metal}`, () => {
      const s = scaledSet(this.scene, 'knurl', uScale, vScale);
      const m = this.base('knurl', color, metal, 0.45);
      m.bumpTexture = s.normal;
      m.bumpTexture.level = 1.4;
      return m;
    });
  }

  ribbed(uScale = 1, color = new Color3(0.03, 0.03, 0.03)): PBRMaterial {
    return this.get(`ribbed-${uScale}-${color.toHexString()}`, () => {
      const s = scaledSet(this.scene, 'ribbed', uScale, 1);
      const m = this.base('ribbed', color, 0.1, 0.5);
      m.bumpTexture = s.normal;
      return m;
    });
  }

  /** Multi-coated lens front element: dark, glossy, with iridescent coating */
  coatedGlass(haze = 0): PBRMaterial {
    const key = `coated-${haze.toFixed(2)}`;
    return this.get(key, () => {
      const m = this.base('coated', new Color3(0.01 + haze * 0.25, 0.012 + haze * 0.25, 0.016 + haze * 0.25), 0, 0.03 + haze * 0.3);
      m.iridescence.isEnabled = true;
      m.iridescence.intensity = 1;
      m.iridescence.indexOfRefraction = 1.38;
      m.iridescence.minimumThickness = 180;
      m.iridescence.maximumThickness = 420;
      m.alpha = 0.92;
      m.transparencyMode = Material.MATERIAL_ALPHABLEND;
      return m;
    });
  }

  /** Clear glass (viewfinder windows, jars) */
  glass(tint = new Color3(0.9, 0.95, 0.95), alpha = 0.2, rough = 0.02): PBRMaterial {
    return this.get(`glass-${tint.toHexString()}-${alpha}-${rough}`, () => {
      const m = this.base('glass', tint, 0, rough);
      m.alpha = alpha;
      m.transparencyMode = Material.MATERIAL_ALPHABLEND;
      m.backFaceCulling = false;
      return m;
    });
  }

  textured(setName: string, uScale: number, vScale: number, tint?: Color3, bump = 1, metallicFactor = 1): PBRMaterial {
    return this.get(`tex-${setName}-${uScale}-${vScale}-${tint?.toHexString() ?? ''}-${bump}`, () => {
      const s = scaledSet(this.scene, setName, uScale, vScale);
      const m = new PBRMaterial(setName, this.scene);
      m.albedoTexture = s.albedo;
      if (tint) m.albedoColor = tint;
      m.bumpTexture = s.normal;
      m.bumpTexture.level = bump;
      m.metallicTexture = s.orm;
      m.useRoughnessFromMetallicTextureGreen = true;
      m.useMetallnessFromMetallicTextureBlue = true;
      m.useAmbientOcclusionFromMetallicTextureRed = true;
      m.metallic = metallicFactor;
      m.roughness = 1;
      return m;
    });
  }

  emissive(color: Color3, intensity = 1): PBRMaterial {
    return this.get(`emis-${color.toHexString()}-${intensity}`, () => {
      const m = this.base('emis', new Color3(0, 0, 0), 0, 1);
      m.emissiveColor = color;
      m.emissiveIntensity = intensity;
      m.disableLighting = true;
      return m;
    });
  }

  painted(color: Color3, rough = 0.6, key = ''): PBRMaterial {
    return this.get(`paint-${color.toHexString()}-${rough}-${key}`, () => this.base('painted', color, 0, rough));
  }

  /** One-off material carrying a canvas texture (labels, dials, posters) */
  decal(tex: Texture | DynamicTexture, rough = 0.5, metallic = 0, emissive = 0): PBRMaterial {
    const m = new PBRMaterial(`decal-${tex.name}`, this.scene);
    m.albedoTexture = tex;
    m.metallic = metallic;
    m.roughness = rough;
    if (tex.hasAlpha) {
      m.useAlphaFromAlbedoTexture = true;
      m.transparencyMode = Material.MATERIAL_ALPHATEST;
      m.alphaCutOff = 0.4;
    }
    if (emissive > 0) {
      m.emissiveTexture = tex;
      m.emissiveColor = new Color3(1, 1, 1);
      m.emissiveIntensity = emissive;
    }
    return m;
  }
}
