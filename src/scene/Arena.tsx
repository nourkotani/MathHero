/** @jsxImportSource react */
// The arena inside the R3F root. The renderer facade (src/renderer) builds
// the stage and the effects into R3F's scene, dresses the hero, and draws
// each frame through its own pipeline (bloom tiers, ADR 0004). A useFrame
// with priority 1 tells R3F that this component renders. The hero, the
// Rival (the Tripo fighter, ADR 0011) and the hitboxes are React
// components (ADR 0009).

import { useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import type { Store } from '../app/store';
import { createRenderer } from '../renderer';
import { createRivalDirector } from '../renderer/rival';
import { Hero } from './Hero';
import { HeroHitboxes } from './HeroHitboxes';
import { Rival } from './Rival';

export function Arena({ store }: { store: Store }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const director = useMemo(() => createRivalDirector(), []);
  // The scene mounts once for the life of the page, and so does this.
  const renderer = useMemo(
    () => createRenderer({ gl, scene, camera, rival: director }),
    [gl, scene, camera, director],
  );

  useEffect(() => {
    // The store has one subscriber list for the life of the page, so this
    // subscription never ends.
    store.subscribe((state, effects) => renderer.onStoreUpdate(state, effects));
  }, [renderer, store]);

  useFrame((_, delta) => renderer.frame(delta * 1000), 1);

  // Each part shows as soon as its own bytes decode.
  return (
    <>
      <Suspense fallback={null}>
        <Hero mount={renderer.hero} timeScale={renderer.timeScale} />
      </Suspense>
      <Suspense fallback={null}>
        {/* Normal gravity; nothing falls yet. The world holds the sensors. */}
        <Physics gravity={[0, -9.81, 0]}>
          <Rival
            director={director}
            timeScale={renderer.timeScale}
            onStruck={renderer.strikeContact}
          />
          <HeroHitboxes strikePoints={renderer.strikePoints} />
        </Physics>
      </Suspense>
    </>
  );
}
