// The reactions module: the single place that maps the core's effects[] to
// animations, particles, and ceremonies (ADR 0003 — moments arrive as
// effects, never by diffing state). Owns the hero's action state: streak
// form, attack and stagger timers, and the aura's shed sparks.

import * as THREE from 'three';
import type { GameEffect, StreakForm } from '../core';
import { ATTACK_DURATION, DUMMY_X, HERO_X, STAGGER_DURATION } from './constants';
import { applyFormToRig, FORM_LOOKS } from './hero';
import type { HeroRig } from './hero';
import type { Dummy } from './dummy';
import type { Fx } from './fx';

export interface Reactions {
  handleEffects(effects: GameEffect[]): void;
  /** The Player's permanent identity: chosen hair color + level glow. */
  setPlayerLook(hair: number, glow: number): void;
  /** Re-dress the current rig (after colors change or the hero rebuilds). */
  refreshForm(): void;
  isStaggering(): boolean;
  update(dt: number, elapsed: number, previewing: boolean): void;
}

export function createReactions(opts: {
  getHero(): HeroRig;
  dummy: Dummy;
  fx: Fx;
  addShake(amount: number): void;
}): Reactions {
  const { getHero, dummy, fx, addShake } = opts;

  let punchTimer = 0; // hero attack animation
  let attackKind = 0; // which attack plays: punch / flying kick / spin / uppercut
  let attackCycle = 0;
  let staggerTimer = 0; // wrong-answer recoil
  let hitPending = false; // impact burst waiting for the strike to land
  let sparkAccum = 0; // fractional aura-spark spawns carried between frames
  let currentForm: StreakForm = 'base';
  let playerHair = 0x2b2b2b;
  let playerGlow = 0;

  function applyForm(form: StreakForm) {
    currentForm = form;
    applyFormToRig(getHero(), form, playerHair, playerGlow);
  }
  applyForm('base');

  return {
    handleEffects(effects) {
      const hero = getHero();
      for (const effect of effects) {
        switch (effect.type) {
          case 'ANSWER_CORRECT':
            // Cycle through different attacks so every strike feels fresh.
            attackKind = attackCycle++ % 4;
            punchTimer = ATTACK_DURATION;
            staggerTimer = 0;
            dummy.kick(ATTACK_DURATION);
            hitPending = true;
            // A crackle of charge energy as the hero coils to strike.
            fx.burst(currentForm === 'base' ? 0xffffff : FORM_LOOKS[currentForm].auraColor, 6, new THREE.Vector3(HERO_X + 0.4, 1.5, 0), 1.2);
            // Any transformed hero throws visible energy with each strike.
            if (currentForm !== 'base') fx.fireBlast(false);
            break;
          case 'ANSWER_WRONG':
            staggerTimer = STAGGER_DURATION;
            punchTimer = 0;
            hitPending = false;
            addShake(0.15);
            break;
          case 'TRANSFORMED':
            applyForm(effect.form);
            fx.burst(FORM_LOOKS[effect.form].auraColor, 24, hero.group.position.clone().setY(1.5), 3.5);
            addShake(0.25);
            break;
          case 'STREAK_BROKEN':
          case 'ROUND_ENDED':
          case 'ROUND_ABANDONED':
            applyForm('base');
            break;
          case 'BLAST_FIRED':
            fx.fireBlast(true);
            break;
          case 'LEVEL_UP':
            fx.burst(0xffd700, 26, hero.group.position.clone().setY(1.2), 4);
            addShake(0.3);
            break;
          case 'NEW_PERSONAL_BEST':
            fx.burst(0x8f5aff, 20, new THREE.Vector3(0, 2.0, 0), 4.5);
            fx.burst(0x3ac0ff, 20, new THREE.Vector3(0, 2.4, 0), 3.5);
            break;
          default:
            break;
        }
      }
    },
    setPlayerLook(hair, glow) {
      playerHair = hair;
      playerGlow = glow;
    },
    refreshForm() {
      applyForm(currentForm);
    },
    isStaggering: () => staggerTimer > 0,
    update(dt, elapsed, previewing) {
      const hero = getHero();

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
          fx.burst(hitColor, currentForm === 'base' ? 12 : 18, new THREE.Vector3(DUMMY_X - 0.55, 1.7, 0), 3.2);
          addShake(currentForm === 'base' ? 0.12 : 0.2);
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
          fx.spark(
            sparkColor,
            origin,
            new THREE.Vector3(0, 1.6 + Math.random() * 1.6, 0),
            0.4 + Math.random() * 0.3,
          );
        }
      } else {
        sparkAccum = 0;
      }
    },
  };
}
