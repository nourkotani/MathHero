// The three.js renderer. Interface: (state, effects) in via onStoreUpdate,
// plus frame(dt) from the shell's animation loop. Scene internals are private.

import * as THREE from 'three';
import {
  glowIntensityForLevel,
  HAIR_PRESETS,
  levelForXp,
  OUTFIT_PRESETS,
  presetHex,
  unlockedCosmetics,
} from '../core';
import type { GameEffect, GameState, StreakForm } from '../core';

export interface Renderer {
  onStoreUpdate(state: GameState, effects: GameEffect[]): void;
  frame(dtMs: number): void;
}

// First-pass visual treatment per streak form; the polish ticket re-skins
// these mappings without the core knowing. hair: null keeps the Player's own
// hair color; surge/super override it with charged energy colors.
const FORM_LOOKS: Record<
  StreakForm,
  { hair: number | null; auraColor: number; auraOpacity: number; emissive: number }
> = {
  base: { hair: null, auraColor: 0x000000, auraOpacity: 0, emissive: 0 },
  aura: { hair: null, auraColor: 0x3ac0ff, auraOpacity: 0.45, emissive: 0.15 },
  surge: { hair: 0xffe14d, auraColor: 0x8f5aff, auraOpacity: 0.6, emissive: 0.35 },
  super: { hair: 0xffd700, auraColor: 0xffb300, auraOpacity: 0.8, emissive: 0.6 },
};

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
  hero.group.position.set(-2.4, 0.3, 0);
  hero.group.rotation.y = Math.PI / 2;
  scene.add(hero.group);

  const dummy = buildTrainingDummy();
  dummy.position.set(2.4, 0.3, 0);
  scene.add(dummy);

  const blasts: THREE.Mesh[] = [];
  let elapsed = 0;
  let punchTimer = 0; // seconds remaining in the hero's strike animation
  let dummyKick = 0; // seconds remaining in the dummy's recoil
  let currentForm: StreakForm = 'base';
  let playerHair = 0x2b2b2b;
  let playerGlow = 0; // permanent per-level glow, derived from Hero Level

  function applyForm(form: StreakForm) {
    currentForm = form;
    const look = FORM_LOOKS[form];
    const hairHex = look.hair ?? playerHair;
    hero.hairMaterial.color.setHex(hairHex);
    hero.hairMaterial.emissive.setHex(hairHex);
    hero.hairMaterial.emissiveIntensity = Math.max(look.emissive, playerGlow * 0.5);
    hero.bodyMaterial.emissive.setHex(look.auraColor === 0 ? 0xffffff : look.auraColor);
    hero.bodyMaterial.emissiveIntensity = Math.max(look.emissive, playerGlow * 0.25);
    hero.auraMaterial.color.setHex(look.auraColor);
    hero.auraMaterial.opacity = Math.max(look.auraOpacity, playerGlow * 0.2);
  }
  applyForm('base');

  function applyPlayerColors(state: GameState) {
    const player = state.players.find((p) => p.id === state.activePlayerId);
    if (!player) return;
    const level = levelForXp(player.xp);
    playerHair = presetHex(HAIR_PRESETS, player.colors.hair);
    playerGlow = glowIntensityForLevel(level);
    hero.bodyMaterial.color.setHex(presetHex(OUTFIT_PRESETS, player.colors.outfitPrimary));
    hero.trimMaterial.color.setHex(presetHex(OUTFIT_PRESETS, player.colors.outfitSecondary));
    const unlockedIds = new Set(unlockedCosmetics(level).map((c) => c.id));
    for (const [id, mesh] of hero.cosmetics) {
      mesh.visible = unlockedIds.has(id);
    }
    applyForm(currentForm);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    onStoreUpdate(state, effects) {
      applyPlayerColors(state);
      for (const effect of effects) {
        switch (effect.type) {
          case 'ANSWER_CORRECT':
            punchTimer = 0.35;
            dummyKick = 0.35;
            break;
          case 'TRANSFORMED':
            applyForm(effect.form);
            break;
          case 'STREAK_BROKEN':
          case 'ROUND_ENDED':
            applyForm('base');
            break;
          case 'BLAST_FIRED': {
            const blast = new THREE.Mesh(
              new THREE.SphereGeometry(0.28, 12, 10),
              new THREE.MeshBasicMaterial({ color: 0xffe14d }),
            );
            blast.position.set(-1.6, 1.6, 0);
            scene.add(blast);
            blasts.push(blast);
            break;
          }
          default:
            break;
        }
      }
    },
    frame(dtMs) {
      const dt = Math.min(dtMs, 100) / 1000;
      elapsed += dt;

      // Idle bob for both figures; the aura slowly spins.
      hero.group.position.y = 0.3 + Math.sin(elapsed * 2.2) * 0.05;
      hero.aura.rotation.y = elapsed * 1.5;
      dummy.rotation.z = Math.sin(elapsed * 1.1) * 0.03;

      // Strike lunge toward the dummy on a correct answer.
      if (punchTimer > 0) {
        punchTimer = Math.max(0, punchTimer - dt);
        const lunge = Math.sin((1 - punchTimer / 0.35) * Math.PI);
        hero.group.position.x = -2.4 + lunge * 1.5;
      } else {
        hero.group.position.x = -2.4;
      }
      if (dummyKick > 0) {
        dummyKick = Math.max(0, dummyKick - dt);
        dummy.rotation.x = Math.sin((1 - dummyKick / 0.35) * Math.PI) * 0.35;
      } else {
        dummy.rotation.x = 0;
      }

      // Energy blasts fly toward the dummy and burst.
      for (let i = blasts.length - 1; i >= 0; i--) {
        const blast = blasts[i];
        if (!blast) continue;
        blast.position.x += dt * 14;
        if (blast.position.x >= dummy.position.x) {
          scene.remove(blast);
          blasts.splice(i, 1);
          dummyKick = 0.5;
        }
      }

      renderer.render(scene, camera);
    },
  };
}

interface HeroRig {
  group: THREE.Group;
  hairMaterial: THREE.MeshStandardMaterial;
  bodyMaterial: THREE.MeshStandardMaterial;
  trimMaterial: THREE.MeshStandardMaterial;
  aura: THREE.Mesh;
  auraMaterial: THREE.MeshBasicMaterial;
  /** Milestone cosmetic meshes keyed by their table id; hidden until unlocked. */
  cosmetics: Map<string, THREE.Object3D>;
}

function buildPlaceholderHero(): HeroRig {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3a6fd8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.0, 6, 12), bodyMaterial);
  body.position.y = 1.0;
  group.add(body);

  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xff9f1c });
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.18, 16), trimMaterial);
  belt.position.y = 0.85;
  group.add(belt);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xf2c09a }),
  );
  head.position.y = 2.05;
  group.add(head);

  const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2b2b });
  const hair = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 8), hairMaterial);
  hair.position.y = 2.45;
  group.add(hair);

  const auraMaterial = new THREE.MeshBasicMaterial({
    color: 0x3ac0ff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const aura = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.8, 16, 1, true), auraMaterial);
  aura.position.y = 1.4;
  group.add(aura);

  const cosmetics = buildCosmetics();
  for (const mesh of cosmetics.values()) {
    mesh.visible = false;
    group.add(mesh);
  }

  return { group, hairMaterial, bodyMaterial, trimMaterial, aura, auraMaterial, cosmetics };
}

/** One simple mesh per milestone cosmetic id from the core's table. */
function buildCosmetics(): Map<string, THREE.Object3D> {
  const cosmetics = new Map<string, THREE.Object3D>();
  const glowMaterial = (color: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });

  const crimsonAura = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.06, 10, 32),
    glowMaterial(0xff3b3b),
  );
  crimsonAura.rotation.x = Math.PI / 2;
  crimsonAura.position.y = 0.15;
  cosmetics.set('crimson-aura', crimsonAura);

  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 24), glowMaterial(0xffd700));
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 2.85;
  cosmetics.set('energy-crown', crown);

  const wisps = new THREE.Group();
  for (const [x, y] of [
    [-0.7, 1.4],
    [0.7, 1.7],
    [-0.5, 2.2],
  ] as const) {
    const wisp = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), glowMaterial(0x9be7ff));
    wisp.position.set(x, y, 0.2);
    wisps.add(wisp);
  }
  cosmetics.set('lightning-wisps', wisps);

  const wings = new THREE.Group();
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), glowMaterial(0x7dffa0));
    wing.position.set(side * 0.6, 1.5, -0.4);
    wing.rotation.z = side * 2.4;
    wings.add(wing);
  }
  cosmetics.set('energy-wings', wings);

  const trail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.2, 8), glowMaterial(0xffa94d));
  trail.position.set(0, 1.0, -0.7);
  trail.rotation.x = Math.PI / 2;
  cosmetics.set('comet-trail', trail);

  const halo = new THREE.Group();
  for (const dy of [0, 0.25] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 24), glowMaterial(0xfff3b0));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3.0 + dy;
    halo.add(ring);
  }
  cosmetics.set('twin-halo', halo);

  return cosmetics;
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
