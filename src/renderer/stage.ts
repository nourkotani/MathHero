// The stage: dusk sky, fog, the light rig, the tournament arena, and the
// wasteland ring of rocks and drifting clouds. Owns the final-ten-seconds
// urgency treatment, since that plays on the arena and the ambient light.

import * as THREE from 'three';
import { environmentSurface, glowSurface } from './materials';
import { STYLE } from './style';

export interface Stage {
  update(dt: number, elapsed: number, urgent: boolean): void;
}

export function createStage(scene: THREE.Scene): Stage {
  // A dusk wasteland arena — dramatic anime-battle light, not a sunny field.
  scene.background = new THREE.Color(STYLE.sky);
  scene.fog = new THREE.Fog(STYLE.fog.color, STYLE.fog.near, STYLE.fog.far);

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

  const ground = new THREE.Mesh(new THREE.CircleGeometry(28, 48), environmentSurface(0x6d6242, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Tournament-style stone platform with a glowing energy rim.
  const arenaMaterial = environmentSurface(0xcfc8bd, 0.85);
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 0.3, 48), arenaMaterial);
  arena.position.y = 0.15;
  arena.receiveShadow = true;
  scene.add(arena);

  const arenaRim = new THREE.Mesh(
    new THREE.TorusGeometry(7.05, 0.07, 8, 64),
    glowSurface(0xffd24d, 0.7),
  );
  arenaRim.rotation.x = Math.PI / 2;
  arenaRim.position.y = 0.31;
  scene.add(arenaRim);

  // Jagged rock spires ring the battlefield.
  const rockMaterial = environmentSurface(0x5f5142, 1);
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + 0.4;
    const distance = 13 + (i % 3) * 4;
    const height = 2.5 + ((i * 7) % 5);
    const rock = new THREE.Mesh(new THREE.ConeGeometry(1.1 + (i % 2) * 0.7, height, 5), rockMaterial);
    rock.position.set(Math.cos(angle) * distance, height / 2, Math.sin(angle) * distance);
    rock.rotation.y = i * 1.7;
    scene.add(rock);
  }

  // Slow dusk clouds drifting high overhead.
  const clouds: THREE.Mesh[] = [];
  const cloudMaterial = glowSurface(0xb18fd9, 0.35);
  for (let i = 0; i < 5; i++) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(2.4 + (i % 3), 10, 8), cloudMaterial);
    cloud.scale.set(1.8, 0.35, 1);
    cloud.position.set(-20 + i * 9, 12 + (i % 3) * 2.5, -18 - (i % 2) * 6);
    scene.add(cloud);
    clouds.push(cloud);
  }

  return {
    update(dt, elapsed, urgent) {
      // Dusk clouds drift slowly across the sky.
      for (const cloud of clouds) {
        cloud.position.x += dt * 0.4;
        if (cloud.position.x > 26) cloud.position.x = -26;
      }

      // Final ten seconds: the whole arena feels the pressure.
      if (urgent) {
        const pulse = 0.5 + Math.sin(elapsed * 8) * 0.5;
        hemi.color.setHSL(0.0, 0.35 * pulse, 0.85);
        arenaMaterial.emissive.setHex(0xff3b3b);
        arenaMaterial.emissiveIntensity = 0.12 * pulse;
      } else {
        hemi.color.setHex(0x8fa3ff);
        arenaMaterial.emissiveIntensity = 0;
      }
    },
  };
}
