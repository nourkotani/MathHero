/** @jsxImportSource react */
// The arena inside the R3F root. The renderer facade (src/renderer) builds
// the stage, the hero and the effects into R3F's scene and draws each frame
// through its own pipeline (bloom tiers, ADR 0004). A useFrame with
// priority 1 tells R3F that this component renders. The Training Dummy and
// the hitboxes are React components inside a Rapier world (ADR 0009).

import { useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import type { Store } from '../app/store';
import { createRenderer } from '../renderer';
import { createDummyDirector } from '../renderer/dummy';
import { HeroHitboxes } from './HeroHitboxes';
import { TrainingDummy } from './TrainingDummy';

export function Arena({ store }: { store: Store }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const director = useMemo(() => createDummyDirector(), []);
  // The scene mounts once for the life of the page, and so does this.
  const renderer = useMemo(
    () => createRenderer({ gl, scene, camera, dummy: director }),
    [gl, scene, camera, director],
  );

  useEffect(() => {
    // The store has one subscriber list for the life of the page, so this
    // subscription never ends.
    store.subscribe((state, effects) => renderer.onStoreUpdate(state, effects));
  }, [renderer, store]);

  useFrame((_, delta) => renderer.frame(delta * 1000), 1);

  return (
    <Suspense fallback={null}>
      {/* Normal gravity; nothing falls yet. The world holds the sensors. */}
      <Physics gravity={[0, -9.81, 0]}>
        <TrainingDummy
          director={director}
          timeScale={renderer.timeScale}
          onStruck={renderer.strikeContact}
        />
        <HeroHitboxes strikePoints={renderer.strikePoints} />
      </Physics>
    </Suspense>
  );
}
