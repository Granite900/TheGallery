/** Post-processing / quality presets. */
import { Camera, DefaultRenderingPipeline, ImageProcessingConfiguration, Scene, SSAO2RenderingPipeline } from '@babylonjs/core';
import type { Quality } from '../sim/state';

export interface PipelineOpts {
  exposure?: number;
  contrast?: number;
  bloom?: number;
  bloomThreshold?: number;
  ssaoRadius?: number;
  ssaoStrength?: number;
  vignette?: number;
  grain?: number;
  dof?: { focalLength: number; fStop: number; focusDistance: number } | null;
}

export interface Pipeline {
  main: DefaultRenderingPipeline;
  ssao?: SSAO2RenderingPipeline;
  dispose(): void;
  setQuality(q: Quality): void;
}

export const SHADOW_SIZE: Record<Quality, number> = { low: 1024, medium: 2048, high: 2048, ultra: 4096 };

export function makePipeline(scene: Scene, cameras: Camera[], quality: Quality, o: PipelineOpts = {}): Pipeline {
  const main = new DefaultRenderingPipeline('main', true, scene, cameras);
  const ip = main.imageProcessing;
  main.imageProcessingEnabled = true;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = o.exposure ?? 1;
  ip.contrast = o.contrast ?? 1.08;
  ip.vignetteEnabled = (o.vignette ?? 0.35) > 0;
  ip.vignetteWeight = (o.vignette ?? 0.35) * 2.2;
  ip.vignetteStretch = 0.5;
  ip.vignetteCameraFov = 0.6;
  ip.vignetteColor.set(0, 0, 0, 0);
  main.bloomEnabled = (o.bloom ?? 0.18) > 0;
  main.bloomWeight = o.bloom ?? 0.18;
  main.bloomThreshold = o.bloomThreshold ?? 1.2;
  main.bloomKernel = 64;
  main.bloomScale = 0.5;
  main.sharpenEnabled = true;
  main.sharpen.edgeAmount = 0.18;
  main.grainEnabled = (o.grain ?? 6) > 0;
  main.grain.intensity = o.grain ?? 6;
  main.grain.animated = true;
  main.chromaticAberrationEnabled = true;
  main.chromaticAberration.aberrationAmount = 6;
  main.chromaticAberration.radialIntensity = 0.6;
  if (o.dof) {
    main.depthOfFieldEnabled = true;
    main.depthOfField.focalLength = o.dof.focalLength;
    main.depthOfField.fStop = o.dof.fStop;
    main.depthOfField.focusDistance = o.dof.focusDistance;
  }
  let ssao: SSAO2RenderingPipeline | undefined;
  const p: Pipeline = {
    main,
    get ssao() {
      return ssao;
    },
    dispose() {
      main.dispose();
      ssao?.dispose();
    },
    setQuality(q: Quality) {
      main.samples = q === 'low' ? 1 : 4;
      main.fxaaEnabled = q === 'low';
      main.bloomKernel = q === 'ultra' ? 96 : 64;
      if (q === 'low' || q === 'medium') {
        ssao?.dispose();
        ssao = undefined;
      } else if (!ssao) {
        ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: q === 'ultra' ? 1 : 0.5, blurRatio: 1 }, cameras, true);
        ssao.radius = o.ssaoRadius ?? 0.5;
        ssao.totalStrength = o.ssaoStrength ?? 1.1;
        ssao.expensiveBlur = q === 'ultra';
        ssao.samples = q === 'ultra' ? 24 : 16;
        ssao.maxZ = 120;
        ssao.minZAspect = 0.4;
      }
      if (main.depthOfFieldEnabled) main.depthOfFieldBlurLevel = q === 'ultra' ? 2 : 1;
    },
  };
  p.setQuality(quality);
  return p;
}
