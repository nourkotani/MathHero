// The three.js renderer. Interface: (state, effects) in via onStoreUpdate,
// plus frame(dt) from the shell's animation loop. Everything below —
// character builder, particle bursts, blast projectiles, dummy reactions,
// screen shake — is private implementation (ADR 0003: moments arrive as
// effects, never by diffing state).

import * as THREE from 'three';
import {
  glowIntensityForLevel,
  HAIR_PRESETS,
  isFinalTenSeconds,
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

// Visual treatment per streak form, keyed by the core's form names.
// hair: null keeps the Player's own hair color.
const FORM_LOOKS: Record<
  StreakForm,
  { hair: number | null; auraColor: number; auraOpacity: number; emissive: number }
> = {
  base: { hair: null, auraColor: 0x000000, auraOpacity: 0, emissive: 0 },
  aura: { hair: null, auraColor: 0x3ac0ff, auraOpacity: 0.45, emissive: 0.15 },
  surge: { hair: 0xffe14d, auraColor: 0x8f5aff, auraOpacity: 0.6, emissive: 0.35 },
  super: { hair: 0xffd700, auraColor: 0xffb300, auraOpacity: 0.8, emissive: 0.6 },
};

const HERO_X = -2.4;
const DUMMY_X = 2.4;

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface Blast {
  mesh: THREE.Mesh;
  big: boolean;
}

/** Short-lived meshes must release their GPU resources when removed. */
function freeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // A dusk wasteland arena — dramatic anime-battle light, not a sunny field.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1f3a);
  scene.fog = new THREE.Fog(0x453156, 26, 68);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  const cameraHome = new THREE.Vector3(0, 4.2, 10);
  camera.position.copy(cameraHome);
  camera.lookAt(0, 1.4, 0);

  const hemi = new THREE.HemisphereLight(0x8fa3ff, 0x5a3b22, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb26b, 2.0);
  sun.position.set(6, 7, 5);
  scene.add(sun);
  // Cool rim light from behind, so the figures pop against the dusk.
  const rim = new THREE.DirectionalLight(0x3ac0ff, 0.7);
  rim.position.set(-5, 6, -8);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(28, 48),
    new THREE.MeshStandardMaterial({ color: 0x6d6242, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Tournament-style stone platform with a glowing energy rim.
  const arenaMaterial = new THREE.MeshStandardMaterial({ color: 0xcfc8bd, roughness: 0.85 });
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 0.3, 48), arenaMaterial);
  arena.position.y = 0.15;
  scene.add(arena);

  const arenaRim = new THREE.Mesh(
    new THREE.TorusGeometry(7.05, 0.07, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xffd24d, transparent: true, opacity: 0.7 }),
  );
  arenaRim.rotation.x = Math.PI / 2;
  arenaRim.position.y = 0.31;
  scene.add(arenaRim);

  // Jagged rock spires ring the battlefield.
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x5f5142, roughness: 1 });
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
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xb18fd9,
    transparent: true,
    opacity: 0.35,
  });
  for (let i = 0; i < 5; i++) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(2.4 + (i % 3), 10, 8), cloudMaterial);
    cloud.scale.set(1.8, 0.35, 1);
    cloud.position.set(-20 + i * 9, 12 + (i % 3) * 2.5, -18 - (i % 2) * 6);
    scene.add(cloud);
    clouds.push(cloud);
  }

  const hero = buildHero();
  hero.group.position.set(HERO_X, 0.3, 0);
  hero.group.rotation.y = Math.PI / 2;
  scene.add(hero.group);

  const dummy = buildTrainingDummy();
  dummy.position.set(DUMMY_X, 0.3, 0);
  scene.add(dummy);

  const ATTACK_DURATION = 0.45;
  const STAGGER_DURATION = 0.6;
  const blasts: Blast[] = [];
  const particles: Particle[] = [];
  let elapsed = 0;
  let punchTimer = 0; // hero attack animation
  let attackKind = 0; // which attack plays: punch / flying kick / spin / uppercut
  let attackCycle = 0;
  let staggerTimer = 0; // wrong-answer recoil
  let dummyKick = 0; // small recoil
  let dummyLaunch = 0; // dramatic super-blast launch
  let shake = 0; // camera shake energy
  let urgent = false; // final ten seconds of the Round
  let currentForm: StreakForm = 'base';
  let playerHair = 0x2b2b2b;
  let playerGlow = 0;

  function applyForm(form: StreakForm) {
    currentForm = form;
    const look = FORM_LOOKS[form];
    const hairHex = look.hair ?? playerHair;
    for (const spike of hero.hairMaterials) {
      spike.color.setHex(hairHex);
      spike.emissive.setHex(hairHex);
      spike.emissiveIntensity = Math.max(look.emissive, playerGlow * 0.5);
    }
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

  function burst(color: number, count: number, origin: THREE.Vector3, speed: number) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
      );
      mesh.position.copy(origin);
      const theta = (i / count) * Math.PI * 2;
      const up = 1.5 + (i % 3);
      const velocity = new THREE.Vector3(Math.cos(theta) * speed, up, Math.sin(theta) * speed);
      scene.add(mesh);
      particles.push({ mesh, velocity, life: 1, maxLife: 1 });
    }
  }

  function fireBlast(big: boolean) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 0.34 : 0.2, 12, 10),
      new THREE.MeshBasicMaterial({ color: big ? 0xffe14d : 0x7ad7ff }),
    );
    mesh.position.set(HERO_X + 0.8, 1.6, 0);
    scene.add(mesh);
    blasts.push({ mesh, big });
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    onStoreUpdate(state, effects) {
      applyPlayerColors(state);
      urgent = isFinalTenSeconds(state);
      for (const effect of effects) {
        switch (effect.type) {
          case 'ANSWER_CORRECT':
            // Cycle through different attacks so every strike feels fresh.
            attackKind = attackCycle++ % 4;
            punchTimer = ATTACK_DURATION;
            staggerTimer = 0;
            dummyKick = ATTACK_DURATION;
            // Any transformed hero throws visible energy with each strike.
            if (currentForm !== 'base') fireBlast(false);
            break;
          case 'ANSWER_WRONG':
            staggerTimer = STAGGER_DURATION;
            punchTimer = 0;
            shake = Math.max(shake, 0.15);
            break;
          case 'TRANSFORMED':
            applyForm(effect.form);
            burst(FORM_LOOKS[effect.form].auraColor, 14, hero.group.position.clone().setY(1.5), 3);
            shake = Math.max(shake, 0.25);
            break;
          case 'STREAK_BROKEN':
          case 'ROUND_ENDED':
            applyForm('base');
            break;
          case 'BLAST_FIRED':
            fireBlast(true);
            break;
          case 'LEVEL_UP':
            burst(0xffd700, 26, hero.group.position.clone().setY(1.2), 4);
            shake = Math.max(shake, 0.3);
            break;
          case 'NEW_PERSONAL_BEST':
            burst(0x8f5aff, 20, new THREE.Vector3(0, 2.0, 0), 4.5);
            burst(0x3ac0ff, 20, new THREE.Vector3(0, 2.4, 0), 3.5);
            break;
          default:
            break;
        }
      }
    },
    frame(dtMs) {
      const dt = Math.min(dtMs, 100) / 1000;
      elapsed += dt;

      // Idle bob; the aura spins and breathes. Attacks layer on top.
      const bobY = 0.3 + Math.sin(elapsed * 2.2) * 0.05;
      hero.aura.rotation.y = elapsed * 1.5;
      hero.aura.scale.setScalar(1 + Math.sin(elapsed * 6) * 0.05);
      hero.group.position.set(HERO_X, bobY, 0);
      hero.group.rotation.set(0, Math.PI / 2, 0);

      if (staggerTimer > 0) {
        // Wrong answer: the hero staggers back with a red wince, then recovers.
        staggerTimer = Math.max(0, staggerTimer - dt);
        const recoil = Math.sin((staggerTimer / STAGGER_DURATION) * Math.PI);
        hero.group.position.x = HERO_X - recoil * 0.6;
        hero.group.rotation.z = recoil * 0.3;
        if (staggerTimer > 0) {
          hero.bodyMaterial.emissive.setHex(0xff3b3b);
          hero.bodyMaterial.emissiveIntensity = recoil * 0.5;
        } else {
          applyForm(currentForm);
        }
      } else if (punchTimer > 0) {
        punchTimer = Math.max(0, punchTimer - dt);
        const t = 1 - punchTimer / ATTACK_DURATION;
        const drive = Math.sin(t * Math.PI); // out and back
        switch (attackKind) {
          case 0: // dash punch
            hero.group.position.x = HERO_X + drive * 1.6;
            hero.group.rotation.z = -drive * 0.2;
            break;
          case 1: // flying kick
            hero.group.position.x = HERO_X + drive * 1.9;
            hero.group.position.y = bobY + drive * 0.9;
            hero.group.rotation.z = -drive * 0.9;
            break;
          case 2: // spin strike
            hero.group.position.x = HERO_X + drive * 1.4;
            hero.group.rotation.y = Math.PI / 2 + t * Math.PI * 2;
            break;
          default: // rising uppercut
            hero.group.position.x = HERO_X + drive * 1.0;
            hero.group.position.y = bobY + drive * 1.3;
            hero.group.rotation.z = drive * 0.45;
            break;
        }
      }

      // Dummy reactions: small recoil on hits, dramatic launch on super blasts.
      if (dummyLaunch > 0) {
        dummyLaunch = Math.max(0, dummyLaunch - dt);
        const t = 1 - dummyLaunch / 0.9; // 0 → 1 over the launch
        const arc = Math.sin(t * Math.PI);
        dummy.position.x = DUMMY_X + t * 2.2;
        dummy.position.y = 0.3 + arc * 2.4;
        dummy.rotation.x = t * Math.PI * 2;
        if (dummyLaunch === 0) {
          dummy.position.set(DUMMY_X, 0.3, 0);
          dummy.rotation.x = 0;
        }
      } else if (dummyKick > 0) {
        dummyKick = Math.max(0, dummyKick - dt);
        dummy.rotation.x = Math.sin((1 - dummyKick / ATTACK_DURATION) * Math.PI) * 0.35;
      } else if (staggerTimer > 0) {
        // The dummy does a cheeky little taunt wobble while the hero winces.
        dummy.rotation.x = 0;
        dummy.rotation.z = Math.sin(elapsed * 18) * 0.12;
      } else {
        dummy.rotation.x = 0;
        dummy.rotation.z = Math.sin(elapsed * 1.1) * 0.03;
      }

      // Dusk clouds drift slowly across the sky.
      for (const cloud of clouds) {
        cloud.position.x += dt * 0.4;
        if (cloud.position.x > 26) cloud.position.x = -26;
      }

      // Energy blasts fly toward the dummy and burst on impact.
      for (let i = blasts.length - 1; i >= 0; i--) {
        const blast = blasts[i];
        if (!blast) continue;
        blast.mesh.position.x += dt * (blast.big ? 16 : 20);
        blast.mesh.scale.setScalar(1 + Math.sin(elapsed * 40) * 0.15);
        if (blast.mesh.position.x >= DUMMY_X - 0.3) {
          burst(blast.big ? 0xffe14d : 0x7ad7ff, blast.big ? 16 : 8, blast.mesh.position, 2.5);
          scene.remove(blast.mesh);
          freeMesh(blast.mesh);
          blasts.splice(i, 1);
          if (blast.big) {
            dummyLaunch = 0.9;
            shake = Math.max(shake, 0.4);
          } else {
            dummyKick = 0.4;
          }
        }
      }

      // Particles: rise, fall, fade.
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (!p) continue;
        p.life -= dt;
        p.velocity.y -= 9 * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife);
        if (p.life <= 0) {
          scene.remove(p.mesh);
          freeMesh(p.mesh);
          particles.splice(i, 1);
        }
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

      // Screen shake decays exponentially.
      if (shake > 0.001) {
        shake *= Math.exp(-6 * dt);
        camera.position.set(
          cameraHome.x + Math.sin(elapsed * 71) * shake * 0.25,
          cameraHome.y + Math.sin(elapsed * 89) * shake * 0.2,
          cameraHome.z,
        );
      } else {
        camera.position.copy(cameraHome);
      }

      renderer.render(scene, camera);
    },
  };
}

interface HeroRig {
  group: THREE.Group;
  hairMaterials: THREE.MeshStandardMaterial[];
  bodyMaterial: THREE.MeshStandardMaterial;
  trimMaterial: THREE.MeshStandardMaterial;
  aura: THREE.Mesh;
  auraMaterial: THREE.MeshBasicMaterial;
  /** Milestone cosmetic meshes keyed by their table id; hidden until unlocked. */
  cosmetics: Map<string, THREE.Object3D>;
}

/** An original, DBZ-inspired (never copied) anime-style hero. */
function buildHero(): HeroRig {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3a6fd8, roughness: 0.6 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xff9f1c, roughness: 0.5 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xf2c09a, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.8, 6, 12), bodyMaterial);
  torso.position.y = 1.15;
  torso.scale.set(1, 1, 0.8);
  group.add(torso);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.16, 16), trimMaterial);
  belt.position.y = 0.82;
  group.add(belt);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), bodyMaterial);
    leg.position.set(side * 0.22, 0.4, 0);
    group.add(leg);

    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 10), trimMaterial);
    boot.position.set(side * 0.22, 0.11, 0.02);
    group.add(boot);

    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 4, 8), bodyMaterial);
    arm.position.set(side * 0.58, 1.25, 0);
    arm.rotation.z = side * 0.35;
    group.add(arm);

    // Martial-artist wristbands in the outfit's trim color.
    const wristband = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 10), trimMaterial);
    wristband.position.set(side * 0.68, 1.02, 0);
    wristband.rotation.z = side * 0.35;
    group.add(wristband);

    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skinMaterial);
    fist.position.set(side * 0.72, 0.92, 0);
    group.add(fist);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), skinMaterial);
  head.position.y = 2.05;
  group.add(head);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x222222 }),
    );
    eye.position.set(side * 0.13, 2.1, 0.31);
    group.add(eye);
  }

  // Spiky anime hair: a crown of tilted cones, all sharing swappable materials.
  const hairMaterials: THREE.MeshStandardMaterial[] = [];
  const spikes: Array<[number, number, number, number, number]> = [
    // [x, y, z, tiltX, tiltZ]
    [0, 2.62, 0, 0, 0],
    [0.18, 2.55, 0.05, 0, -0.5],
    [-0.18, 2.55, 0.05, 0, 0.5],
    [0.1, 2.5, -0.18, 0.5, -0.25],
    [-0.1, 2.5, -0.18, 0.5, 0.25],
    [0.05, 2.52, 0.2, -0.45, -0.15],
    [-0.05, 2.52, 0.2, -0.45, 0.15],
  ];
  for (const [x, y, z, tiltX, tiltZ] of spikes) {
    const material = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4 });
    hairMaterials.push(material);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 6), material);
    spike.position.set(x, y, z);
    spike.rotation.x = tiltX;
    spike.rotation.z = tiltZ;
    group.add(spike);
  }

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

  return { group, hairMaterials, bodyMaterial, trimMaterial, aura, auraMaterial, cosmetics };
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

  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xd9d9d9 }),
  );
  face.position.y = 2.55;
  group.add(face);

  const target = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.045, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  target.position.set(-0.38, 1.8, 0);
  target.rotation.y = Math.PI / 2;
  group.add(target);

  return group;
}
