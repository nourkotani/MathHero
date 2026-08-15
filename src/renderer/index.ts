// The three.js renderer. Interface: (state, effects) in via onStoreUpdate,
// plus frame(dt) from the shell's animation loop. Everything below —
// character builder, particle bursts, blast projectiles, dummy reactions,
// screen shake — is private implementation (ADR 0003: moments arrive as
// effects, never by diffing state).

import * as THREE from 'three';
import {
  DEFAULT_APPEARANCE,
  glowIntensityForLevel,
  HAIR_PRESETS,
  isFinalTenSeconds,
  levelForXp,
  OUTFIT_PRESETS,
  presetHex,
  SKIN_PRESETS,
  unlockedCosmetics,
} from '../core';
import type { GameEffect, GameState, HairStyle, HeroAppearance, StreakForm } from '../core';

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
  // Opacities are per shell; the aura's two nested shells overlap, so the
  // perceived density is roughly double what's written here.
  base: { hair: null, auraColor: 0x000000, auraOpacity: 0, emissive: 0 },
  aura: { hair: null, auraColor: 0x3ac0ff, auraOpacity: 0.28, emissive: 0.15 },
  surge: { hair: 0xffe14d, auraColor: 0x8f5aff, auraOpacity: 0.34, emissive: 0.35 },
  super: { hair: 0xffd700, auraColor: 0xffb300, auraOpacity: 0.4, emissive: 0.6 },
};

const HERO_X = -2.4;
const DUMMY_X = 2.4;

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

  let hero = buildHero(DEFAULT_APPEARANCE);
  let appearanceKey = JSON.stringify(DEFAULT_APPEARANCE);
  placeHero();
  scene.add(hero.group);

  function placeHero() {
    hero.group.position.set(HERO_X, 0.3, 0);
    hero.group.rotation.y = Math.PI / 2;
  }

  /** Swap the character model when the appearance changes (or is previewed). */
  function rebuildHero(appearance: HeroAppearance) {
    scene.remove(hero.group);
    hero.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) freeMesh(obj);
    });
    hero = buildHero(appearance);
    placeHero();
    scene.add(hero.group);
  }

  const dummy = buildTrainingDummy();
  dummy.position.set(DUMMY_X, 0.3, 0);
  scene.add(dummy);

  const ATTACK_DURATION = 0.55;
  const STAGGER_DURATION = 0.6;
  const blasts: Blast[] = [];
  const particles: Particle[] = [];
  let elapsed = 0;
  let punchTimer = 0; // hero attack animation
  let attackKind = 0; // which attack plays: punch / flying kick / spin / uppercut
  let attackCycle = 0;
  let staggerTimer = 0; // wrong-answer recoil
  let hitPending = false; // impact burst waiting for the strike to land
  let sparkAccum = 0; // fractional aura-spark spawns carried between frames
  let dummyKick = 0; // small recoil
  let dummyLaunch = 0; // dramatic super-blast launch
  let shake = 0; // camera shake energy
  let urgent = false; // final ten seconds of the Round
  let previewing = false; // hero creation: face the camera, not the dummy
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

  function applyLook(state: GameState) {
    // During hero creation the draft is previewed live on the 3D character.
    const player = state.players.find((p) => p.id === state.activePlayerId);
    const draft = state.phase === 'hero-creation' ? state.draft : null;
    const colors = draft?.colors ?? player?.colors;
    const appearance = draft?.appearance ?? player?.appearance;
    if (!colors || !appearance) return;
    const level = draft ? 0 : levelForXp(player?.xp ?? 0);

    const key = JSON.stringify(appearance);
    if (key !== appearanceKey) {
      appearanceKey = key;
      rebuildHero(appearance);
    }
    playerHair = presetHex(HAIR_PRESETS, colors.hair);
    playerGlow = glowIntensityForLevel(level);
    hero.bodyMaterial.color.setHex(presetHex(OUTFIT_PRESETS, colors.outfitPrimary));
    hero.trimMaterial.color.setHex(presetHex(OUTFIT_PRESETS, colors.outfitSecondary));
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
      particles.push({ mesh, velocity, life: 1, maxLife: 1, gravity: 9 });
    }
  }

  /** A single drifting energy mote — the building block of auras and trails. */
  function spark(color: number, origin: THREE.Vector3, velocity: THREE.Vector3, life: number, size = 0.06) {
    const mesh = new THREE.Mesh(
      new THREE.TetrahedronGeometry(size),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
    );
    mesh.position.copy(origin);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    scene.add(mesh);
    particles.push({ mesh, velocity, life, maxLife: life, gravity: 0 });
  }

  function fireBlast(big: boolean) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 0.42 : 0.24, 12, 10),
      new THREE.MeshBasicMaterial({ color: big ? 0xffe14d : 0x7ad7ff }),
    );
    mesh.position.set(HERO_X + 0.8, 1.6, 0);
    scene.add(mesh);
    blasts.push({ mesh, big });
    // Muzzle flash at the hero's outstretched fist.
    burst(big ? 0xffe14d : 0x7ad7ff, big ? 10 : 5, mesh.position.clone(), 1.6);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    onStoreUpdate(state, effects) {
      applyLook(state);
      urgent = isFinalTenSeconds(state);
      previewing = state.phase === 'hero-creation';
      for (const effect of effects) {
        switch (effect.type) {
          case 'ANSWER_CORRECT':
            // Cycle through different attacks so every strike feels fresh.
            attackKind = attackCycle++ % 4;
            punchTimer = ATTACK_DURATION;
            staggerTimer = 0;
            dummyKick = ATTACK_DURATION;
            hitPending = true;
            // A crackle of charge energy as the hero coils to strike.
            burst(currentForm === 'base' ? 0xffffff : FORM_LOOKS[currentForm].auraColor, 6, new THREE.Vector3(HERO_X + 0.4, 1.5, 0), 1.2);
            // Any transformed hero throws visible energy with each strike.
            if (currentForm !== 'base') fireBlast(false);
            break;
          case 'ANSWER_WRONG':
            staggerTimer = STAGGER_DURATION;
            punchTimer = 0;
            hitPending = false;
            shake = Math.max(shake, 0.15);
            break;
          case 'TRANSFORMED':
            applyForm(effect.form);
            burst(FORM_LOOKS[effect.form].auraColor, 24, hero.group.position.clone().setY(1.5), 3.5);
            shake = Math.max(shake, 0.25);
            break;
          case 'STREAK_BROKEN':
          case 'ROUND_ENDED':
          case 'ROUND_ABANDONED':
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

      // Pose the rig fresh every frame: fighting stance + idle breathing
      // first, then whichever action is running overrides the joints it
      // needs. Resetting first means an interrupted action can never leave
      // a limb stuck mid-swing.
      const bobY = 0.26 + Math.sin(elapsed * 2.2) * 0.04;
      // The flame churns: shells counter-rotate so the sculpted lobes slide
      // past each other, while the whole teardrop licks taller and thinner.
      hero.auraOuter.rotation.y = elapsed * 1.1;
      hero.auraInner.rotation.y = -elapsed * 1.9;
      const lick = 1 + Math.sin(elapsed * 9) * 0.05 + Math.sin(elapsed * 23) * 0.025;
      hero.aura.scale.set(
        1 + Math.sin(elapsed * 6) * 0.04,
        lick,
        1 + Math.cos(elapsed * 6) * 0.04,
      );
      hero.group.position.set(HERO_X, bobY, 0);
      hero.group.rotation.set(0, previewing ? 0.35 : Math.PI / 2, 0);

      // Guard stance: left foot forward, knees soft, fists raised.
      const j = hero.joints;
      const breathe = Math.sin(elapsed * 2.2);
      j.torso.rotation.set(0.06 + breathe * 0.02, 0, 0);
      j.head.rotation.set(-0.04, Math.sin(elapsed * 0.7) * 0.08, 0);
      j.armL.rotation.set(-0.55 + breathe * 0.04, 0, 0.3);
      j.armR.rotation.set(-0.55 + breathe * 0.04, 0, -0.3);
      j.elbowL.rotation.set(-1.55, 0, 0);
      j.elbowR.rotation.set(-1.55, 0, 0);
      j.legL.rotation.set(-0.22, 0, 0);
      j.legR.rotation.set(0.26, 0, 0);
      j.kneeL.rotation.set(0.38, 0, 0);
      j.kneeR.rotation.set(0.34, 0, 0);

      if (staggerTimer > 0) {
        // Wrong answer: knocked off balance — stumbling back, arms
        // windmilling, head rattling, front leg up, with a red wince.
        staggerTimer = Math.max(0, staggerTimer - dt);
        const recoil = Math.sin((staggerTimer / STAGGER_DURATION) * Math.PI);
        hero.group.position.x = HERO_X - recoil * 0.7;
        hero.group.rotation.z = recoil * 0.22;
        j.torso.rotation.x = -recoil * 0.5;
        j.head.rotation.y = Math.sin(elapsed * 30) * 0.35 * recoil;
        j.armL.rotation.set(-2.3 * recoil - 0.3, 0, 0.3 + Math.sin(elapsed * 24) * 0.5 * recoil);
        j.armR.rotation.set(-2.3 * recoil - 0.3, 0, -0.3 - Math.cos(elapsed * 24) * 0.5 * recoil);
        j.elbowL.rotation.x = -0.4;
        j.elbowR.rotation.x = -0.4;
        j.legL.rotation.x = -0.9 * recoil;
        j.kneeL.rotation.x = 1.2 * recoil + 0.2;
        if (staggerTimer > 0) {
          hero.bodyMaterial.emissive.setHex(0xff3b3b);
          hero.bodyMaterial.emissiveIntensity = recoil * 0.5;
        } else {
          applyForm(currentForm);
        }
      } else if (punchTimer > 0) {
        punchTimer = Math.max(0, punchTimer - dt);
        const t = 1 - punchTimer / ATTACK_DURATION;
        // Every attack reads DBZ-style: a coiled wind-up (w ramps then
        // releases), the strike snapping out and following through (s
        // rises to the hit and settles home).
        const w = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.2);
        const s = t < 0.3 ? 0 : Math.sin(((t - 0.3) / 0.7) * Math.PI);
        // The exact moment the strike lands: impact sparks fly off the dummy.
        if (hitPending && t >= 0.62) {
          hitPending = false;
          const hitColor = currentForm === 'base' ? 0xffffff : FORM_LOOKS[currentForm].auraColor;
          burst(hitColor, currentForm === 'base' ? 12 : 18, new THREE.Vector3(DUMMY_X - 0.55, 1.7, 0), 3.2);
          shake = Math.max(shake, currentForm === 'base' ? 0.12 : 0.2);
        }
        switch (attackKind) {
          case 0: // dash punch: coil back, lunge in with a straight right
            hero.group.position.x = HERO_X - w * 0.35 + s * 1.7;
            j.torso.rotation.set(s * 0.2, w * 0.5 - s * 0.55, 0);
            j.armR.rotation.set(0.6 * w - 1.62 * s, 0, -0.15);
            j.elbowR.rotation.x = -1.55 + 1.5 * s;
            j.armL.rotation.set(-0.4, 0, 0.35);
            break;
          case 1: // flying kick: crouch, launch, right leg pistons out
            hero.group.position.x = HERO_X - w * 0.3 + s * 2.0;
            hero.group.position.y = bobY + s * 0.9;
            j.torso.rotation.x = w * 0.3 - s * 0.55;
            j.legR.rotation.x = 0.4 * w - 1.5 * s;
            j.kneeR.rotation.x = 1.3 * w + 0.08;
            j.legL.rotation.x = 0.3;
            j.kneeL.rotation.x = 0.38 + 1.2 * s;
            j.armL.rotation.set(0.8 * s, 0, 0.5);
            j.armR.rotation.set(0.8 * s, 0, -0.5);
            break;
          case 2: // spin strike: wind opposite, whirl through with arms wide
            hero.group.position.x = HERO_X - w * 0.3 + s * 1.4;
            hero.group.rotation.y =
              Math.PI / 2 - w * 0.6 + (t < 0.3 ? 0 : (t - 0.3) / 0.7) * Math.PI * 2;
            j.torso.rotation.y = -w * 0.5;
            j.armL.rotation.set(-0.2, 0, 0.3 + 1.1 * s);
            j.armR.rotation.set(-0.2, 0, -0.3 - 1.1 * s);
            j.elbowL.rotation.x = -1.55 + 1.4 * s;
            j.elbowR.rotation.x = -1.55 + 1.4 * s;
            break;
          default: // rising uppercut: deep crouch, then fist drives skyward
            hero.group.position.x = HERO_X + s * 1.1;
            hero.group.position.y = bobY - w * 0.22 + s * 1.2;
            j.torso.rotation.x = w * 0.45 - s * 0.3;
            j.legL.rotation.x = -0.22 - w * 0.5;
            j.legR.rotation.x = 0.26 - w * 0.3 - s * 0.7;
            j.kneeL.rotation.x = 0.38 + w * 0.9;
            j.kneeR.rotation.x = 0.34 + w * 0.9;
            j.armR.rotation.set(0.7 * w - 2.5 * s, 0, -0.1);
            j.elbowR.rotation.x = -1.0 + 0.9 * s;
            j.armL.rotation.x = -0.3 + s * 0.5;
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

      // Transformed heroes shed rising energy motes that hug the body's
      // silhouette — narrow at the boots and head, widest at the torso —
      // so the aura reads as pouring off the fighter, not a vague cloud.
      if (currentForm !== 'base' || playerGlow > 0.3) {
        const rate = currentForm === 'super' ? 34 : currentForm === 'surge' ? 22 : 14;
        sparkAccum += dt * rate;
        const look = FORM_LOOKS[currentForm];
        const sparkColor = currentForm === 'base' ? 0xffe9a3 : look.auraColor;
        while (sparkAccum >= 1) {
          sparkAccum -= 1;
          const y = 0.15 + Math.random() * 2.1;
          const width = y < 0.9 ? 0.3 : y < 1.75 ? 0.48 : 0.28;
          const angle = Math.random() * Math.PI * 2;
          const origin = new THREE.Vector3(
            hero.group.position.x + Math.cos(angle) * width,
            hero.group.position.y + y,
            hero.group.position.z + Math.sin(angle) * width,
          );
          spark(
            sparkColor,
            origin,
            new THREE.Vector3(0, 1.6 + Math.random() * 1.6, 0),
            0.4 + Math.random() * 0.3,
          );
        }
      } else {
        sparkAccum = 0;
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
        blast.mesh.scale.setScalar(1 + Math.sin(elapsed * 40) * 0.2);
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
        p.velocity.y -= p.gravity * dt;
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

/** Joint pivots the frame loop poses every frame. Limb meshes hang inside. */
interface HeroJoints {
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
}

interface HeroRig {
  group: THREE.Group;
  joints: HeroJoints;
  hairMaterials: THREE.MeshStandardMaterial[];
  bodyMaterial: THREE.MeshStandardMaterial;
  trimMaterial: THREE.MeshStandardMaterial;
  /** Two counter-rotating flame shells; both share auraMaterial. */
  aura: THREE.Group;
  auraOuter: THREE.Mesh;
  auraInner: THREE.Mesh;
  auraMaterial: THREE.MeshBasicMaterial;
  /** Milestone cosmetic meshes keyed by their table id; hidden until unlocked. */
  cosmetics: Map<string, THREE.Object3D>;
}

/**
 * An original, DBZ-inspired (never copied) anime-style hero, assembled from
 * the chosen appearance: body style, hair style and length, garment, and
 * skin tone. The body is an articulated rig — shoulders, elbows, hips,
 * knees, torso, and head are pivot groups the animation loop poses.
 *
 * Rig layout (group-local y, feet at 0): hips 0.88, torso pivot 1.0,
 * shoulders 1.7, head pivot 1.88, head center ~2.04.
 */
function buildHero(appearance: HeroAppearance): HeroRig {
  const group = new THREE.Group();
  const girl = appearance.body === 'girl';

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3a6fd8, roughness: 0.6 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xff9f1c, roughness: 0.5 });
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: presetHex(SKIN_PRESETS, appearance.skinTone),
    roughness: 0.7,
  });

  // Pelvis: the gi's trousers. Girls get wider hips, boys a blockier seat.
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), bodyMaterial);
  pelvis.position.y = 0.92;
  pelvis.scale.set(girl ? 1.2 : 1.05, 0.55, girl ? 0.85 : 0.8);
  group.add(pelvis);

  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(girl ? 0.37 : 0.42, girl ? 0.37 : 0.42, 0.14, 16),
    trimMaterial,
  );
  belt.position.y = 1.03;
  belt.scale.z = 0.78;
  group.add(belt);

  // Torso pivot: leaning and twisting happen here; arms and head ride along.
  const torso = new THREE.Group();
  torso.position.y = 1.0;
  group.add(torso);

  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.3, 6, 12), bodyMaterial);
  chest.position.y = 0.35;
  chest.scale.set(girl ? 0.85 : 1.05, 1, girl ? 0.72 : 0.8);
  torso.add(chest);

  if (girl) {
    // A modest chest contour under the gi — silhouette, nothing more.
    const contour = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), bodyMaterial);
    contour.position.set(0, 0.5, 0.16);
    contour.scale.set(1.15, 0.7, 0.75);
    torso.add(contour);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.16, 10), skinMaterial);
  neck.position.y = 0.78;
  torso.add(neck);

  // Head pivot: nods, shakes, and the hair all swing together.
  const head = new THREE.Group();
  head.position.y = 0.88;
  torso.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), skinMaterial);
  skull.position.y = 0.16;
  head.add(skull);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(girl ? 0.055 : 0.045, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x222222 }),
    );
    eye.position.set(side * 0.13, 0.22, 0.29);
    head.add(eye);
  }

  // Anime hair from the chosen style; every strand shares the swappable
  // hair materials so streak forms and player colors recolor them all.
  const hairMaterials: THREE.MeshStandardMaterial[] = [];
  const hairMat = () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4 });
    hairMaterials.push(material);
    return material;
  };
  buildHair(head, appearance.hairStyle, appearance.hairLength === 'long', hairMat);

  // Arms: shoulder pivot → upper arm → elbow pivot → forearm, band, fist.
  const shoulderX = girl ? 0.47 : 0.55;
  const armW = girl ? 0.11 : 0.12;
  const buildArm = (side: number): [THREE.Group, THREE.Group] => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * shoulderX, 0.7, 0);
    torso.add(shoulder);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(armW, 0.26, 4, 8), bodyMaterial);
    upper.position.y = -0.17;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(armW - 0.015, 0.24, 4, 8), skinMaterial);
    forearm.position.y = -0.15;
    elbow.add(forearm);

    // Martial-artist wristbands in the outfit's trim color.
    const wristband = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.12, 10), trimMaterial);
    wristband.position.y = -0.28;
    elbow.add(wristband);

    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skinMaterial);
    fist.position.y = -0.4;
    elbow.add(fist);

    return [shoulder, elbow];
  };
  const [armL, elbowL] = buildArm(-1);
  const [armR, elbowR] = buildArm(1);

  // Legs: hip pivot → thigh → knee pivot → shin and boot.
  const hipX = girl ? 0.21 : 0.2;
  const legW = girl ? 0.15 : 0.16;
  const buildLeg = (side: number): [THREE.Group, THREE.Group] => {
    const hip = new THREE.Group();
    hip.position.set(side * hipX, 0.88, 0);
    group.add(hip);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(legW, 0.3, 4, 8), bodyMaterial);
    thigh.position.y = -0.21;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(legW - 0.025, 0.26, 4, 8), bodyMaterial);
    shin.position.y = -0.17;
    knee.add(shin);

    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.22, 10), trimMaterial);
    boot.position.set(0, -0.36, 0.03);
    knee.add(boot);

    return [hip, knee];
  };
  const [legL, kneeL] = buildLeg(-1);
  const [legR, kneeR] = buildLeg(1);

  // Garments beyond the basic gi.
  if (appearance.garment === 'cape') {
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.4, 0.05), trimMaterial);
    cape.position.set(0, 0.05, -0.38);
    cape.rotation.x = 0.12;
    torso.add(cape);
  } else if (appearance.garment === 'armor') {
    const plate = new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.34, 6, 12), trimMaterial);
    plate.position.y = 0.38;
    plate.scale.set(girl ? 0.92 : 1.1, 0.85, girl ? 0.8 : 0.9);
    torso.add(plate);
    for (const shoulder of [armL, armR]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), trimMaterial);
      pad.position.y = 0.02;
      pad.scale.set(1.2, 0.8, 1.1);
      shoulder.add(pad);
    }
  }

  // Front faces only: with two nested shells, double-sided rendering would
  // stack four color layers and wall the hero off inside the flame.
  const auraMaterial = new THREE.MeshBasicMaterial({
    color: 0x3ac0ff,
    transparent: true,
    opacity: 0,
  });
  // The aura is a teardrop of flame wrapped around the fighter: two shells
  // of the same lobed profile — the smaller inner one doubles up the color
  // into a bright core, and counter-rotation makes the fire churn.
  const auraGeometry = buildAuraGeometry();
  const auraOuter = new THREE.Mesh(auraGeometry, auraMaterial);
  const auraInner = new THREE.Mesh(auraGeometry, auraMaterial);
  auraInner.scale.set(0.62, 0.82, 0.62);
  const aura = new THREE.Group();
  aura.add(auraOuter);
  aura.add(auraInner);
  aura.position.y = 0.02;
  group.add(aura);

  const cosmetics = buildCosmetics();
  for (const mesh of cosmetics.values()) {
    mesh.visible = false;
    group.add(mesh);
  }

  return {
    group,
    joints: { torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR },
    hairMaterials,
    bodyMaterial,
    trimMaterial,
    aura,
    auraOuter,
    auraInner,
    auraMaterial,
    cosmetics,
  };
}

/**
 * The aura's flame: a teardrop profile that follows the hero's silhouette —
 * rounded at the boots, widest at the torso, tapering to a point above the
 * hair — with radial lobes sculpted in so the rim licks like fire when the
 * shells rotate.
 */
function buildAuraGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.18, 0),
    new THREE.Vector2(0.62, 0.12),
    new THREE.Vector2(0.82, 0.55),
    new THREE.Vector2(0.88, 1.0),
    new THREE.Vector2(0.78, 1.55),
    new THREE.Vector2(0.6, 2.1),
    new THREE.Vector2(0.4, 2.6),
    new THREE.Vector2(0.2, 3.0),
    new THREE.Vector2(0.0, 3.35),
  ];
  const geometry = new THREE.LatheGeometry(profile, 22);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const theta = Math.atan2(z, x);
    const lobe = 1 + 0.13 * Math.sin(theta * 3 + y * 2.2);
    position.setX(i, x * lobe);
    position.setZ(i, z * lobe);
  }
  return geometry;
}

type HairMat = () => THREE.MeshStandardMaterial;

/**
 * Anime hair styles, each in a short and a long variant, built in head-pivot
 * space so the whole do swings with every nod and shake.
 */
function buildHair(head: THREE.Group, style: HairStyle, long: boolean, hairMat: HairMat): void {
  const spike = (
    x: number,
    y: number,
    z: number,
    tiltX: number,
    tiltZ: number,
    radius = 0.14,
    height = 0.55,
  ) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 6), hairMat());
    cone.position.set(x, y, z);
    cone.rotation.x = tiltX;
    cone.rotation.z = tiltZ;
    head.add(cone);
  };
  const cap = (radiusScale: number, flatten: number, y: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.37 * radiusScale, 16, 12), hairMat());
    mesh.scale.set(1, flatten, 1);
    mesh.position.y = y;
    head.add(mesh);
  };

  switch (style) {
    case 'spiky': {
      spike(0, 0.74, 0, 0, 0);
      spike(0.18, 0.67, 0.05, 0, -0.5);
      spike(-0.18, 0.67, 0.05, 0, 0.5);
      spike(0.1, 0.62, -0.18, 0.5, -0.25);
      spike(-0.1, 0.62, -0.18, 0.5, 0.25);
      spike(0.05, 0.64, 0.2, -0.45, -0.15);
      spike(-0.05, 0.64, 0.2, -0.45, 0.15);
      if (long) {
        // A wild mane cascading down the back.
        spike(0.14, 0.12, -0.34, 2.7, -0.1, 0.13, 0.85);
        spike(-0.14, 0.12, -0.34, 2.7, 0.1, 0.13, 0.85);
        spike(0, 0.02, -0.38, 2.8, 0, 0.15, 1.0);
      }
      break;
    }
    case 'flame': {
      // One big swept-back flame of hair.
      spike(0, 0.67, -0.05, -0.55, 0, 0.24, long ? 1.1 : 0.75);
      spike(0.14, 0.57, -0.12, -0.7, -0.2, 0.18, long ? 0.9 : 0.6);
      spike(-0.14, 0.57, -0.12, -0.7, 0.2, 0.18, long ? 0.9 : 0.6);
      break;
    }
    case 'ponytail': {
      cap(1.02, 0.75, 0.27);
      spike(0, 0.47, -0.3, 2.45, 0, 0.12, long ? 0.9 : 0.5);
      if (long) spike(0, -0.13, -0.42, 2.9, 0, 0.1, 0.7);
      break;
    }
    case 'buzz': {
      cap(long ? 1.06 : 1.0, long ? 0.75 : 0.6, long ? 0.3 : 0.34);
      break;
    }
  }
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
