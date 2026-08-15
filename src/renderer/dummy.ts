// The Training Dummy: a cosmetic opponent. It reacts — small recoils on
// hits, a dramatic launch on super blasts, a cheeky taunt while the hero
// staggers — but never affects scoring.

import * as THREE from 'three';
import { characterSurface } from './materials';
import { ATTACK_DURATION, DUMMY_X } from './constants';

export interface Dummy {
  group: THREE.Group;
  /** Small recoil; timer in seconds (hit strikes and small blasts differ). */
  kick(duration: number): void;
  /** Dramatic super-blast launch: up, over, and a full flip. */
  launch(): void;
  update(dt: number, elapsed: number, heroStaggering: boolean): void;
}

export function createDummy(): Dummy {
  const group = buildTrainingDummy();
  group.position.set(DUMMY_X, 0.3, 0);

  let kickTimer = 0;
  let launchTimer = 0;

  return {
    group,
    kick(duration) {
      kickTimer = duration;
    },
    launch() {
      launchTimer = 0.9;
    },
    update(dt, elapsed, heroStaggering) {
      if (launchTimer > 0) {
        launchTimer = Math.max(0, launchTimer - dt);
        const t = 1 - launchTimer / 0.9; // 0 → 1 over the launch
        const arc = Math.sin(t * Math.PI);
        group.position.x = DUMMY_X + t * 2.2;
        group.position.y = 0.3 + arc * 2.4;
        group.rotation.x = t * Math.PI * 2;
        if (launchTimer === 0) {
          group.position.set(DUMMY_X, 0.3, 0);
          group.rotation.x = 0;
        }
      } else if (kickTimer > 0) {
        kickTimer = Math.max(0, kickTimer - dt);
        group.rotation.x = Math.sin((1 - kickTimer / ATTACK_DURATION) * Math.PI) * 0.35;
      } else if (heroStaggering) {
        // The dummy does a cheeky little taunt wobble while the hero winces.
        group.rotation.x = 0;
        group.rotation.z = Math.sin(elapsed * 18) * 0.12;
      } else {
        group.rotation.x = 0;
        group.rotation.z = Math.sin(elapsed * 1.1) * 0.03;
      }
    },
  };
}

function buildTrainingDummy(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.7, 0.35, 20),
    characterSurface(0x8a6642, 1),
  );
  base.position.y = 0.18;
  group.add(base);

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 1.1, 12),
    characterSurface(0xa8834f, 1),
  );
  post.position.y = 0.9;
  group.add(post);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.6, 6, 12),
    characterSurface(0xc9584a, 1),
  );
  torso.position.y = 1.8;
  group.add(torso);

  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 20, 16),
    characterSurface(0xd9d9d9, 1),
  );
  face.position.y = 2.55;
  group.add(face);

  const target = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.045, 8, 20),
    characterSurface(0xffffff, 1),
  );
  target.position.set(-0.38, 1.8, 0);
  target.rotation.y = Math.PI / 2;
  group.add(target);

  return group;
}
