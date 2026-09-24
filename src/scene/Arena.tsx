/** @jsxImportSource react */
// The arena inside the R3F root. The renderer facade (src/renderer) builds
// the stage, the hero, the Training Dummy and the effects into R3F's scene
// and draws each frame through its own pipeline (bloom tiers, ADR 0004).
// A useFrame with priority 1 tells R3F that this component renders.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import type { Store } from '../app/store';
import { createRenderer } from '../renderer';
import type { Renderer } from '../renderer';

export function Arena({ store }: { store: Store }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const renderer = useRef<Renderer | null>(null);

  useEffect(() => {
    // The store has one subscriber list for the life of the page, and the
    // scene mounts once, so this subscription never ends.
    const created = createRenderer({ gl, scene, camera });
    renderer.current = created;
    store.subscribe((state, effects) => created.onStoreUpdate(state, effects));
  }, [gl, scene, camera, store]);

  useFrame((_, delta) => renderer.current?.frame(delta * 1000), 1);
  return null;
}
