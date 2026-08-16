// The stage: dusk sky, fog, the light rig, the tournament arena, and the
// wasteland ring of rocks and drifting clouds. Owns the final-ten-seconds
// urgency treatment, since that plays on the arena and the ambient light.

import * as THREE from 'three';
import {
  backdropSurface,
  cloudSprite,
  environmentSurface,
  glowSurface,
  markBloom,
  maskedGlowSurface,
  paintedMap,
  starSurface,
} from './materials';
import { STYLE } from './style';
import arenaTopUrl from './textures/arena-top.png';
import cloudUrl from './textures/cloud.png';
import groundUrl from './textures/ground.png';
import rockUrl from './textures/rock.png';
import sigilUrl from './textures/sigil.png';
import skyUrl from './textures/sky.png';

export interface Stage {
  update(dt: number, elapsed: number, urgent: boolean): void;
  /** The dusk sun's disc — the pipeline's god-ray pass shines from it. */
  sunDisc: THREE.Mesh;
}

export function createStage(scene: THREE.Scene): Stage {
  // A dusk wasteland arena — dramatic anime-battle light, not a sunny field.
  scene.background = new THREE.Color(STYLE.sky);
  scene.fog = new THREE.Fog(STYLE.fog.color, STYLE.fog.near, STYLE.fog.far);
  const sunDisc = buildBackdrop(scene);

  const hemi = new THREE.HemisphereLight(STYLE.hemi.sky, STYLE.hemi.ground, STYLE.hemi.intensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(STYLE.sun.color, STYLE.sun.intensity);
  sun.position.set(6, 7, 5);
  // The one shadow-casting light: characters cast, ground and arena receive.
  sun.castShadow = true;
  sun.shadow.mapSize.set(STYLE.shadow.mapSize, STYLE.shadow.mapSize);
  sun.shadow.camera.left = -STYLE.shadow.range;
  sun.shadow.camera.right = STYLE.shadow.range;
  sun.shadow.camera.top = STYLE.shadow.range;
  sun.shadow.camera.bottom = -STYLE.shadow.range;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.002;
  sun.shadow.radius = STYLE.shadow.radius;
  scene.add(sun);
  // Cool rim light from behind, so the figures pop against the dusk.
  const rim = new THREE.DirectionalLight(STYLE.rim.color, STYLE.rim.intensity);
  rim.position.set(-5, 6, -8);
  scene.add(rim);

  // Subtle colored fills so no corner of the arena goes muddy.
  for (const fill of STYLE.fillLights) {
    const light = new THREE.PointLight(fill.color, fill.intensity);
    light.position.set(fill.position[0], fill.position[1], fill.position[2]);
    scene.add(light);
  }

  // The wasteland runs all the way to the dome; fog hazes the far distance.
  // One painted wash covers the whole disc — scorched patches and all.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(75, 48),
    environmentSurface(0xffffff, 1, paintedMap(groundUrl)),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Tournament-style stone platform with a glowing energy rim. The top cap
  // wears the baked tile-ring texture; the side keeps the plain stone tone.
  const arenaTopMaterial = environmentSurface(0xffffff, 0.85, paintedMap(arenaTopUrl));
  const arenaSideMaterial = environmentSurface(0xcfc8bd, 0.85);
  const arenaMaterials = [arenaTopMaterial, arenaSideMaterial];
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 0.3, 48), [
    arenaSideMaterial,
    arenaTopMaterial,
    arenaSideMaterial,
  ]);
  arena.position.y = 0.15;
  arena.receiveShadow = true;
  scene.add(arena);

  const arenaRim = new THREE.Mesh(
    new THREE.TorusGeometry(7.05, 0.07, 8, 64),
    glowSurface(0xffd24d, 0.7),
  );
  markBloom(arenaRim);
  arenaRim.rotation.x = Math.PI / 2;
  arenaRim.position.y = 0.31;
  scene.add(arenaRim);

  // Jagged rock spires ring the battlefield, wearing the striated bake.
  const rockMaterial = environmentSurface(0xffffff, 1, paintedMap(rockUrl));
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + 0.4;
    const distance = 13 + (i % 3) * 4;
    const height = 2.5 + ((i * 7) % 5);
    const rock = new THREE.Mesh(new THREE.ConeGeometry(1.1 + (i % 2) * 0.7, height, 5), rockMaterial);
    rock.position.set(Math.cos(angle) * distance, height / 2, Math.sin(angle) * distance);
    rock.rotation.y = i * 1.7;
    scene.add(rock);
  }

  // Broken tournament pillars: relics of epic battles, ringing the arena
  // outside the play space. Plinth, weathered drum, and a tilted broken cap.
  const pillarStone = environmentSurface(0xd8cfc0, 0.95, paintedMap(rockUrl));
  for (const [angle, distance, height, tilt] of [
    [0.9, 10.6, 2.6, 0.2],
    [2.3, 11.4, 1.7, -0.28],
    [4.1, 10.2, 3.1, 0.16],
    [5.5, 11.8, 2.2, -0.2],
  ] as const) {
    const pillar = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.3), pillarStone);
    plinth.position.y = 0.2;
    pillar.add(plinth);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, height, 10), pillarStone);
    drum.position.y = 0.4 + height / 2;
    pillar.add(drum);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 0.35, 10), pillarStone);
    cap.position.set(0.1, 0.55 + height, 0);
    cap.rotation.z = tilt;
    pillar.add(cap);
    pillar.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    pillar.rotation.y = angle * 2.1;
    scene.add(pillar);
  }

  // Floating debris: rock shards held aloft by residual energy, each with a
  // glowing crystal heart. They bob and turn on render time — behind and
  // beside the arena only, never between the camera and the fight.
  const debris: Array<{ chunk: THREE.Group; baseY: number; phase: number; spin: number }> = [];
  const crystalMaterial = glowSurface(0x9a7dff, 0.9);
  for (const [angle, distance, size, baseY] of [
    [2.7, 9.2, 0.42, 1.6],
    [3.4, 10.8, 0.3, 2.4],
    [4.6, 9.6, 0.5, 1.2],
    [5.9, 10.4, 0.34, 2.0],
    [0.35, 11.6, 0.26, 2.7],
    [3.9, 12.4, 0.44, 1.8],
  ] as const) {
    const chunk = new THREE.Group();
    const shard = new THREE.Mesh(new THREE.IcosahedronGeometry(size), rockMaterial);
    chunk.add(shard);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.32), crystalMaterial);
    crystal.position.y = -size * 0.75;
    markBloom(crystal);
    chunk.add(crystal);
    chunk.position.set(Math.cos(angle) * distance, baseY, Math.sin(angle) * distance);
    scene.add(chunk);
    debris.push({ chunk, baseY, phase: angle * 3.1, spin: 0.25 + size * 0.4 });
  }

  // The arena's power sigil, glowing up from the center of the stone.
  const sigilMaterial = maskedGlowSurface(0xffd24d, sigilUrl);
  const sigil = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), sigilMaterial);
  sigil.rotation.x = -Math.PI / 2;
  sigil.position.y = 0.312;
  markBloom(sigil);
  scene.add(sigil);

  // Two layers of painted cloud sprites drifting at different depths — the
  // parallax between them is what sells the sky's distance.
  const clouds: Array<{ sprite: THREE.Sprite; speed: number; wrap: number }> = [];
  const backMaterial = cloudSprite(cloudUrl, STYLE.clouds.back.tint, STYLE.clouds.back.opacity);
  const frontMaterial = cloudSprite(cloudUrl, STYLE.clouds.front.tint, STYLE.clouds.front.opacity);
  for (let i = 0; i < 5; i++) {
    const sprite = new THREE.Sprite(backMaterial);
    sprite.scale.set(11 + (i % 3) * 2.5, 4.6 + (i % 2), 1);
    sprite.position.set(-24 + i * 11, 9 + (i % 3) * 1.6, -32 - (i % 2) * 6);
    scene.add(sprite);
    clouds.push({ sprite, speed: STYLE.clouds.back.speed, wrap: 30 });
  }
  for (let i = 0; i < 4; i++) {
    const sprite = new THREE.Sprite(frontMaterial);
    sprite.scale.set(7.5 + (i % 2) * 2, 3.2 + (i % 2) * 0.6, 1);
    sprite.position.set(-18 + i * 12, 6.4 + (i % 2) * 1.3, -19 - (i % 3) * 3);
    scene.add(sprite);
    clouds.push({ sprite, speed: STYLE.clouds.front.speed, wrap: 26 });
  }

  return {
    sunDisc,
    update(dt, elapsed, urgent) {
      // Dusk clouds drift slowly across the sky, each layer at its own pace.
      for (const cloud of clouds) {
        cloud.sprite.position.x += dt * cloud.speed;
        if (cloud.sprite.position.x > cloud.wrap) cloud.sprite.position.x = -cloud.wrap;
      }

      // Debris bobs and turns on residual energy; the sigil breathes.
      for (const piece of debris) {
        piece.chunk.position.y = piece.baseY + Math.sin(elapsed * 0.8 + piece.phase) * 0.18;
        piece.chunk.rotation.y += dt * piece.spin;
      }
      sigilMaterial.opacity = 0.75 + Math.sin(elapsed * 1.3) * 0.15;

      // Final ten seconds: the whole arena feels the pressure.
      if (urgent) {
        const pulse = 0.5 + Math.sin(elapsed * 8) * 0.5;
        hemi.color.setHSL(0.0, 0.35 * pulse, 0.85);
        for (const material of arenaMaterials) {
          material.emissive.setHex(0xff3b3b);
          material.emissiveIntensity = 0.12 * pulse;
        }
      } else {
        hemi.color.setHex(0x8fa3ff);
        for (const material of arenaMaterials) {
          material.emissiveIntensity = 0;
        }
      }
    },
  };
}

/**
 * The backdrop beyond the fog: the painted dusk dome, a low sun disc, sparse
 * stars, and silhouette ridges. The ridges sit inside the fog range so
 * distance is implied by the existing fog; the dome, sun, and stars sit
 * beyond it, unfogged, as the sky itself. Returns the sun disc — the
 * pipeline's god-ray pass shines from it.
 */
function buildBackdrop(scene: THREE.Scene): THREE.Mesh {
  // Sky dome: one inverted sphere wearing the baked painted sky — nebula
  // drifts, mottling, and the warm horizon all live in the texture.
  const dome = new THREE.SphereGeometry(80, 32, 18);
  scene.add(new THREE.Mesh(dome, backdropSurface(0xffffff, { backSide: true, mapUrl: skyUrl })));

  // A low dusk sun, half-sunk behind the ridges.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(STYLE.sunDisc.radius, 32),
    backdropSurface(STYLE.sunDisc.color),
  );
  markBloom(sun);
  sun.position.set(...STYLE.sunDisc.position);
  sun.lookAt(0, 2, 0);
  scene.add(sun);

  // Sparse early stars, high in the dome where the dusk has deepened.
  const starPositions = new Float32Array(STYLE.stars.count * 3);
  for (let i = 0; i < STYLE.stars.count; i++) {
    // Random upper-hemisphere direction, kept well above the horizon.
    const azimuth = Math.random() * Math.PI * 2;
    const altitude = 0.25 + Math.random() * 1.2; // radians above horizon
    const r = 74;
    starPositions[i * 3] = Math.cos(azimuth) * Math.cos(altitude) * r;
    starPositions[i * 3 + 1] = Math.sin(altitude) * r;
    starPositions[i * 3 + 2] = Math.sin(azimuth) * Math.cos(altitude) * r;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  scene.add(
    new THREE.Points(
      starGeometry,
      starSurface(STYLE.stars.color, STYLE.stars.size, STYLE.stars.opacity),
    ),
  );

  // Distant silhouette ridges ringing the wasteland, fog-tinted by distance.
  // Low and far: they must read as a horizon line, never loom over the arena.
  const ridgeMaterial = glowSurface(STYLE.ridges.color);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.9;
    const distance = 56 + (i % 3) * 5;
    const height = 5 + ((i * 5) % 5);
    const ridge = new THREE.Mesh(
      new THREE.ConeGeometry(8 + (i % 4) * 3, height, 4),
      ridgeMaterial,
    );
    ridge.position.set(Math.cos(angle) * distance, height / 2 - 1, Math.sin(angle) * distance);
    ridge.rotation.y = i * 1.3;
    scene.add(ridge);
  }

  return sun;
}
