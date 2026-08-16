// Transient spectacle: particle bursts, drifting energy motes, and blast
// projectiles. Short-lived meshes come and go every frame, so this module
// owns their GPU cleanup too.

import * as THREE from 'three';
import { flipbookMaterial, glowSurface, markBloom, sparkSprite, warmFlipbook } from './materials';
import { isOutlineHull } from './cel';
import { DUMMY_X, HERO_X } from './constants';
import { STYLE } from './style';
import impactStarUrl from './textures/impact-star.png';
import shockwaveUrl from './textures/shockwave.png';

interface Particle {
  sprite: THREE.Sprite;
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

/** One playing flipbook: steps its own texture window frame by frame. */
interface Flip {
  object: THREE.Object3D;
  material: THREE.SpriteMaterial | THREE.MeshBasicMaterial;
  map: THREE.Texture;
  frames: number;
  life: number;
  maxLife: number;
  /** World scale at birth → at death. */
  from: number;
  to: number;
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
  /** An expanding impact shockwave — camera-facing pulse, or flat on the
   *  arena floor for the big launches. */
  shockwave(color: number, origin: THREE.Vector3, big: boolean, ground?: boolean): void;
  /** The classic anime four-point impact flash. */
  impactStar(color: number, origin: THREE.Vector3): void;
  fireBlast(big: boolean): void;
  update(dt: number, elapsed: number): void;
}

export function createFx(scene: THREE.Scene, onBlastImpact: (big: boolean) => void): Fx {
  const blasts: Blast[] = [];
  const particles: Particle[] = [];
  const flips: Flip[] = [];

  // Decode the sheets at startup — the first hit is always seconds away.
  warmFlipbook(shockwaveUrl);
  warmFlipbook(impactStarUrl);

  /** Start one flipbook instance; it owns its texture window until it dies. */
  function playFlip(
    url: string,
    frames: number,
    color: number,
    origin: THREE.Vector3,
    duration: number,
    from: number,
    to: number,
    ground = false,
  ) {
    const { material, map } = flipbookMaterial(url, frames, color, ground ? 'flat' : 'sprite');
    let object: THREE.Object3D;
    if (ground) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.rotation.x = -Math.PI / 2;
      object = mesh;
    } else {
      object = new THREE.Sprite(material as THREE.SpriteMaterial);
    }
    object.position.copy(origin);
    markBloom(object);
    scene.add(object);
    flips.push({ object, material, map, frames, life: duration, maxLife: duration, from, to });
  }

  function shockwave(color: number, origin: THREE.Vector3, big: boolean, ground = false) {
    const s = STYLE.impact.shockwave;
    playFlip(
      shockwaveUrl,
      8,
      color,
      ground ? origin.clone().setY(0.36) : origin,
      big ? s.bigDuration : s.duration,
      big ? s.bigFrom : s.from,
      big ? s.bigTo : s.to,
      ground,
    );
  }

  function impactStar(color: number, origin: THREE.Vector3) {
    const s = STYLE.impact.star;
    playFlip(impactStarUrl, 6, color, origin, s.duration, s.from, s.to);
  }

  /** One soft glow mote: the baked spark puff, tinted, bloom-marked. */
  function mote(color: number, size: number, origin: THREE.Vector3): THREE.Sprite {
    const sprite = new THREE.Sprite(sparkSprite(color));
    sprite.scale.setScalar(size);
    sprite.position.copy(origin);
    markBloom(sprite);
    scene.add(sprite);
    return sprite;
  }

  function burst(color: number, count: number, origin: THREE.Vector3, speed: number) {
    for (let i = 0; i < count; i++) {
      const sprite = mote(color, 0.34 + (i % 3) * 0.08, origin);
      const theta = (i / count) * Math.PI * 2;
      const up = 1.5 + (i % 3);
      const velocity = new THREE.Vector3(Math.cos(theta) * speed, up, Math.sin(theta) * speed);
      particles.push({ sprite, velocity, life: 1, maxLife: 1, gravity: 9 });
    }
  }

  function spark(
    color: number,
    origin: THREE.Vector3,
    velocity: THREE.Vector3,
    life: number,
    size = 0.06,
  ) {
    const sprite = mote(color, size * 5, origin);
    particles.push({ sprite, velocity, life, maxLife: life, gravity: 0 });
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
    shockwave,
    impactStar,
    fireBlast,
    update(dt, elapsed) {
      // Flipbooks: step the frame window, grow, and die at the last frame.
      for (let i = flips.length - 1; i >= 0; i--) {
        const f = flips[i];
        if (!f) continue;
        f.life -= dt;
        const at = 1 - Math.max(0, f.life) / f.maxLife;
        const frame = Math.min(f.frames - 1, Math.floor(at * f.frames));
        f.map.offset.x = frame / f.frames;
        const scale = f.from + (f.to - f.from) * at;
        f.object.scale.setScalar(scale);
        if (f.life <= 0) {
          scene.remove(f.object);
          if (f.object instanceof THREE.Mesh) f.object.geometry.dispose();
          f.map.dispose();
          f.material.dispose();
          flips.splice(i, 1);
        }
      }
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
          const color = blast.big ? 0xffe14d : 0x7ad7ff;
          burst(color, blast.big ? 30 : 14, blast.mesh.position, blast.big ? 4 : 2.8);
          // The arcade finisher: a racing shockwave and the anime flash
          // frame; big launches also slam a ring flat across the arena.
          shockwave(color, blast.mesh.position.clone(), blast.big);
          impactStar(0xffffff, blast.mesh.position.clone());
          if (blast.big) shockwave(color, blast.mesh.position.clone(), true, true);
          scene.remove(blast.mesh);
          freeMesh(blast.mesh);
          blasts.splice(i, 1);
          onBlastImpact(blast.big);
        }
      }

      // Particles: rise, fall, fade. The shared spark texture is never
      // disposed — only each mote's own tinted material.
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (!p) continue;
        p.life -= dt;
        p.velocity.y -= p.gravity * dt;
        p.sprite.position.addScaledVector(p.velocity, dt);
        p.sprite.material.opacity = Math.max(0, p.life / p.maxLife);
        if (p.life <= 0) {
          scene.remove(p.sprite);
          p.sprite.material.dispose();
          particles.splice(i, 1);
        }
      }
    },
  };
}
