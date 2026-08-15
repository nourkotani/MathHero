// The three.js renderer. Interface: (state, effects) in via onStoreUpdate,
// plus frame(dt) from the shell's animation loop. Scene internals are private.

import * as THREE from 'three';
import type { GameEffect, GameState } from '../core';

export interface Renderer {
  onStoreUpdate(state: GameState, effects: GameEffect[]): void;
  frame(dtMs: number): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88bbee);
  scene.fog = new THREE.Fog(0x88bbee, 30, 70);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 4.2, 10);
  camera.lookAt(0, 1.4, 0);

  scene.add(new THREE.HemisphereLight(0xdfefff, 0x54402a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.6);
  sun.position.set(5, 10, 6);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(28, 48),
    new THREE.MeshStandardMaterial({ color: 0x7bb661 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const arena = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7.4, 0.3, 48),
    new THREE.MeshStandardMaterial({ color: 0xd9c9a3 }),
  );
  arena.position.y = 0.15;
  scene.add(arena);

  const hero = buildPlaceholderHero();
  hero.position.set(-2.4, 0.3, 0);
  hero.rotation.y = Math.PI / 2;
  scene.add(hero);

  const dummy = buildTrainingDummy();
  dummy.position.set(2.4, 0.3, 0);
  scene.add(dummy);

  let elapsed = 0;
  let punchTimer = 0; // seconds remaining in the hero's strike animation

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    onStoreUpdate(_state, effects) {
      for (const effect of effects) {
        if (effect.type === 'ANSWER_CORRECT') {
          punchTimer = 0.35;
        }
      }
    },
    frame(dtMs) {
      const dt = Math.min(dtMs, 100) / 1000;
      elapsed += dt;

      // Idle bob for both figures.
      hero.position.y = 0.3 + Math.sin(elapsed * 2.2) * 0.05;
      dummy.rotation.z = Math.sin(elapsed * 1.1) * 0.03;

      // Strike lunge toward the dummy on a correct answer.
      if (punchTimer > 0) {
        punchTimer = Math.max(0, punchTimer - dt);
        const t = punchTimer / 0.35;
        const lunge = Math.sin((1 - t) * Math.PI);
        hero.position.x = -2.4 + lunge * 1.5;
        dummy.rotation.x = lunge * 0.35;
      } else {
        hero.position.x = -2.4;
        dummy.rotation.x = 0;
      }

      renderer.render(scene, camera);
    },
  };
}

function buildPlaceholderHero(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 1.0, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x3a6fd8 }),
  );
  body.position.y = 1.0;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xf2c09a }),
  );
  head.position.y = 2.05;
  group.add(head);

  const hair = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0x2b2b2b }),
  );
  hair.position.y = 2.45;
  group.add(hair);
  return group;
}

function buildTrainingDummy(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.7, 0.35, 20),
    new THREE.MeshStandardMaterial({ color: 0x8a6642 }),
  );
  base.position.y = 0.18;
  group.add(base);

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 1.1, 12),
    new THREE.MeshStandardMaterial({ color: 0xa8834f }),
  );
  post.position.y = 0.9;
  group.add(post);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.6, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0xc9584a }),
  );
  torso.position.y = 1.8;
  group.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xd9d9d9 }),
  );
  head.position.y = 2.55;
  group.add(head);
  return group;
}
