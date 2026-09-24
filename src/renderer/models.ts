// The model loader: turns a baked .glb (ADR 0007) into a ready scene
// object. The bytes are inlined into the single file, so loading reads a
// data URI and never touches the network. Meshopt decodes on the main
// thread (no web workers, which the single file forbids).
//
// Blender exports two material roles, which become the renderer's own:
// "Painted" (the baked albedo) → the shared painterly surface; "Ink" (the
// inverted hull) → the baked ink. Blender's own shading values are never
// used — the look is decided here, in one place.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { bakedInkSurface, painterlySurface } from './materials';

let loader: GLTFLoader | null = null;
let ink: THREE.MeshBasicMaterial | null = null;

/** Load a baked model; onReady receives its root once decoded. */
export function loadModel(url: string, onReady: (root: THREE.Object3D) => void): void {
  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    url,
    (gltf) => {
      const root = gltf.scene;
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const baked = obj.material as THREE.MeshStandardMaterial;
        if (baked.name === 'Ink') {
          ink ??= bakedInkSurface();
          obj.material = ink;
          obj.userData.outlineHull = true;
        } else {
          obj.material = painterlySurface(baked.map);
          obj.castShadow = true;
        }
        baked.dispose();
      });
      onReady(root);
    },
    undefined,
    (error) => {
      // A baked model that fails to load is a build bug; say so loudly.
      console.error('MathHero: a baked model failed to load', error);
    },
  );
}
