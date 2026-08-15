// Transient spectacle: particle bursts, drifting energy motes, and blast
// projectiles. Short-lived meshes come and go every frame, so this module
// owns their GPU cleanup too.

import * as THREE from 'three';
import { glowSurface, markBloom } from './materials';
import { isOutlineHull } from './cel';
import { DUMMY_X, HERO_X } from './constants';
import { STYLE } from './style';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  /** Downward pull; 0 for energy motes that just drift and fade. */
  gravity: number;
}

interface Blast {
  mesh: THREE.Mesh;
  big: boolean;
}

/** Short-lived meshes must release their GPU resources when removed. */
export function freeMesh(mesh: THREE.Mesh): void {
  // Outline hulls borrow their parent's geometry and a shared ink material —
  // the parent's own disposal covers them.
  if (isOutlineHull(mesh)) return;
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
}

export interface Fx {
  burst(color: number, count: number, origin: THREE.Vector3, speed: number): void;
  /** A single drifting energy mote — the building block of auras and trails. */
  spark(
    color: number,
    origin: THREE.Vector3,
    velocity: THREE.Vector3,
    life: number,
    size?: number,
  ): void;
  fireBlast(big: boolean): void;
  update(dt: number, elapsed: number): void;
}

export function createFx(scene: THREE.Scene, onBlastImpact: (big: boolean) => void): Fx {
  const blasts: Blast[] = [];
  const particles: Particle[] = [];

  function burst(color: number, count: number, origin: THREE.Vector3, speed: number) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), glowSurface(color, 1));
      markBloom(mesh);
      mesh.position.copy(origin);
      const theta = (i / count) * Math.PI * 2;
      const up = 1.5 + (i % 3);
      const velocity = new THREE.Vector3(Math.cos(theta) * speed, up, Math.sin(theta) * speed);
      scene.add(mesh);
      particles.push({ mesh, velocity, life: 1, maxLife: 1, gravity: 9 });
    }
  }

  function spark(
    color: number,
    origin: THREE.Vector3,
    velocity: THREE.Vector3,
    life: number,
    size = 0.06,
  ) {
    const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(size), glowSurface(color, 1));
    markBloom(mesh);
    mesh.position.copy(origin);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    scene.add(mesh);
    particles.push({ mesh, velocity, life, maxLife: life, gravity: 0 });
  }

  function fireBlast(big: boolean) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 0.42 : 0.24, 12, 10),
      glowSurface(big ? 0xffe14d : 0x7ad7ff),
    );
    markBloom(mesh);
    mesh.position.set(HERO_X + 0.8, 1.6, 0);
    scene.add(mesh);
    blasts.push({ mesh, big });
    // Muzzle flash at the hero's outstretched fist.
    burst(big ? 0xffe14d : 0x7ad7ff, big ? 10 : 5, mesh.position.clone(), 1.6);
  }

  return {
    burst,
    spark,
    fireBlast,
    update(dt, elapsed) {
      // Energy blasts fly toward the dummy and burst on impact.
      for (let i = blasts.length - 1; i >= 0; i--) {
        const blast = blasts[i];
        if (!blast) continue;
        blast.mesh.position.x += dt * (blast.big ? 16 : 20);
        // Smear: stretched along its flight, squashed across it, still
        // pulsing. The impact burst is the snap-back.
        const pulse = 1 + Math.sin(elapsed * 40) * 0.15;
        blast.mesh.scale.set(
          STYLE.juice.smear.along * pulse,
          STYLE.juice.smear.across * pulse,
          STYLE.juice.smear.across * pulse,
        );
        // Energy crackles off the projectile as it screams across the arena.
        spark(
          blast.big ? 0xffe14d : 0x7ad7ff,
          blast.mesh.position
            .clone()
            .add(
              new THREE.Vector3(
                -0.2,
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3,
              ),
            ),
          new THREE.Vector3(-1.5, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
          0.3,
          blast.big ? 0.08 : 0.05,
        );
        if (blast.mesh.position.x >= DUMMY_X - 0.3) {
          burst(blast.big ? 0xffe14d : 0x7ad7ff, blast.big ? 30 : 14, blast.mesh.position, blast.big ? 4 : 2.8);
          scene.remove(blast.mesh);
          freeMesh(blast.mesh);
          blasts.splice(i, 1);
          onBlastImpact(blast.big);
        }
      }

      // Particles: rise, fall, fade.
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (!p) continue;
        p.life -= dt;
        p.velocity.y -= p.gravity * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife);
        if (p.life <= 0) {
          scene.remove(p.mesh);
          freeMesh(p.mesh);
          particles.splice(i, 1);
        }
      }
    },
  };
}
