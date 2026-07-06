/**
 * Planar mirror for the Classical Wing.
 *
 * This is three.js' example Reflector algorithm (MIT), vendored with one
 * change: the render target uses the default UnsignedByte type instead of
 * HalfFloatType. On some ANGLE/Metal drivers (observed on Intel Iris + Metal)
 * rendering into the Reflector's half-float target silently produces black.
 */
import * as THREE from 'three';

export interface MirrorWallOptions {
  textureSize?: number;
  color?: number;
  clipBias?: number;
}

const VERT = /* glsl */ `
  uniform mat4 textureMatrix;
  varying vec4 vUv;
  void main() {
    vUv = textureMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 color;
  uniform sampler2D tDiffuse;
  varying vec4 vUv;

  float blendOverlay(float base, float blend) {
    return base < 0.5 ? (2.0 * base * blend) : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend));
  }
  vec3 blendOverlay(vec3 base, vec3 blend) {
    return vec3(blendOverlay(base.r, blend.r), blendOverlay(base.g, blend.g), blendOverlay(base.b, blend.b));
  }

  void main() {
    vec4 base = texture2DProj(tDiffuse, vUv);
    gl_FragColor = vec4(blendOverlay(base.rgb, color), 1.0);
  }
`;

export class MirrorWall extends THREE.Mesh {
  private renderTarget: THREE.WebGLRenderTarget;

  constructor(width: number, height: number, options: MirrorWallOptions = {}) {
    super(new THREE.PlaneGeometry(width, height));

    const size = options.textureSize ?? 512;
    const clipBias = options.clipBias ?? 0.01;
    const renderTarget = new THREE.WebGLRenderTarget(size, size);
    this.renderTarget = renderTarget;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(options.color ?? 0x889088) },
        tDiffuse: { value: renderTarget.texture },
        textureMatrix: { value: new THREE.Matrix4() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    this.material = material;

    const reflectorPlane = new THREE.Plane();
    const normal = new THREE.Vector3();
    const reflectorWorldPosition = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const rotationMatrix = new THREE.Matrix4();
    const lookAtPosition = new THREE.Vector3(0, 0, -1);
    const clipPlane = new THREE.Vector4();
    const view = new THREE.Vector3();
    const target = new THREE.Vector3();
    const q = new THREE.Vector4();
    const virtualCamera = new THREE.PerspectiveCamera();

    this.onBeforeRender = (renderer, scene, camera) => {
      reflectorWorldPosition.setFromMatrixPosition(this.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

      rotationMatrix.extractRotation(this.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
      view.subVectors(reflectorWorldPosition, cameraWorldPosition);
      if (view.dot(normal) > 0) return; // camera is behind the mirror

      view.reflect(normal).negate();
      view.add(reflectorWorldPosition);

      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);

      target.subVectors(reflectorWorldPosition, lookAtPosition);
      target.reflect(normal).negate();
      target.add(reflectorWorldPosition);

      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      virtualCamera.lookAt(target);
      virtualCamera.far = (camera as THREE.PerspectiveCamera).far;
      virtualCamera.updateMatrixWorld();
      virtualCamera.projectionMatrix.copy((camera as THREE.PerspectiveCamera).projectionMatrix);

      const textureMatrix = material.uniforms.textureMatrix.value as THREE.Matrix4;
      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(virtualCamera.projectionMatrix);
      textureMatrix.multiply(virtualCamera.matrixWorldInverse);

      // oblique near-plane clipping against the mirror plane
      reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
      reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
      clipPlane.set(
        reflectorPlane.normal.x,
        reflectorPlane.normal.y,
        reflectorPlane.normal.z,
        reflectorPlane.constant,
      );
      const pm = virtualCamera.projectionMatrix;
      q.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
      q.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
      q.z = -1;
      q.w = (1 + pm.elements[10]) / pm.elements[14];
      clipPlane.multiplyScalar(2 / clipPlane.dot(q));
      pm.elements[2] = clipPlane.x;
      pm.elements[6] = clipPlane.y;
      pm.elements[10] = clipPlane.z + 1 - clipBias;
      pm.elements[14] = clipPlane.w;

      this.visible = false;
      const prevTarget = renderer.getRenderTarget();
      const prevXr = renderer.xr.enabled;
      const prevShadow = renderer.shadowMap.autoUpdate;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(renderTarget);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, virtualCamera);
      renderer.xr.enabled = prevXr;
      renderer.shadowMap.autoUpdate = prevShadow;
      renderer.setRenderTarget(prevTarget);
      this.visible = true;
    };
  }

  dispose(): void {
    this.renderTarget.dispose();
    (this.material as THREE.Material).dispose();
  }
}
