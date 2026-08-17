// The reactions module: the single place that maps the core's effects[] to
// animations, particles, and ceremonies (ADR 0003 — moments arrive as
// effects, never by diffing state). Hero actions are clips on a shared
// channel: attacks (with anticipation wind-up) and the wrong-answer stagger.

import * as THREE from 'three';
import type { GameEffect, StreakForm } from '../core';
import { DUMMY_X, HERO_X } from './constants';
import { STYLE } from './style';
import { applyFormToRig, composeLook } from './hero';
import type { FormPalette, HeroRig } from './hero';
import type { Dummy } from './dummy';
import type { Fx } from './fx';
import { createChannel } from './timeline';
import type { Clip } from './timeline';

/** The idle breathing bob — the attack clips build on the same baseline. */
const heroBob = (elapsed: number) => 0.26 + Math.sin(elapsed * 2.2) * 0.04;

/** The juice hooks reactions may pull: shake, render freeze, camera punch. */
export interface Juice {
  addShake(amount: number): void;
  /** Render-side freeze; the Game Core clock is untouchable from here. */
  hitstop(): void;
  /** Camera punch-in on Super-mode blasts. */
  punchCamera(): void;
  /** Anime speed-lines flash on transformations and Super blasts. */
  speedLines(): void;
}

export interface Reactions {
  handleEffects(effects: GameEffect[]): void;
  /** The Player's permanent identity: chosen hair, level glow, earned Form. */
  setPlayerLook(hair: number, glow: number, palette: FormPalette | null): void;
  /** Re-dress the current rig (after colors change or the hero rebuilds). */
  refreshForm(): void;
  isStaggering(): boolean;
  update(dt: number, elapsed: number, previewing: boolean): void;
}

export function createReactions(opts: {
  getHero(): HeroRig;
  dummy: Dummy;
  fx: Fx;
  juice: Juice;
}): Reactions {
  const { getHero, dummy, fx, juice } = opts;

  const heroChannel = createChannel();
  let attackCycle = 0;
  let sparkAccum = 0; // fractional aura-spark spawns carried between frames
  let arcAccum = 0; // fractional lightning-arc spawns, same trick
  let currentForm: StreakForm = 'base';
  let playerHair = 0x2b2b2b;
  let playerGlow = 0;
  /** The hero's earned Form, or null before the first one is earned. */
  let palette: FormPalette | null = null;

  function applyForm(form: StreakForm) {
    currentForm = form;
    applyFormToRig(getHero(), form, playerHair, playerGlow, palette);
  }

  /** What the hero looks like right now: earned Form × current Streak. */
  const look = () => composeLook(currentForm, palette);
  applyForm('base');

  /**
   * One of four DBZ-style strikes: an anticipation crouch, then the original
   * wind-up/strike curve — w coils and releases, s snaps out to the hit and
   * settles home. The impact burst (and hitstop at high streaks) fires at
   * the exact moment the strike lands.
   */
  function attackClip(kind: number): Clip {
    let hitPending = true;
    const { duration, anticipation } = STYLE.juice.attack;
    const total = anticipation + duration;
    return {
      duration: total,
      apply(tc, elapsed) {
        const hero = getHero();
        const j = hero.joints;
        const bobY = heroBob(elapsed);
        const tAbs = tc * total;
        if (tAbs < anticipation) {
          // Anticipation: a coiled crouch, fists drawn, before the release.
          const c = tAbs / anticipation;
          hero.group.position.y = bobY - c * 0.16;
          j.torso.rotation.x = 0.06 + c * 0.3;
          j.legL.rotation.x = -0.22 - c * 0.5;
          j.legR.rotation.x = 0.26 - c * 0.35;
          j.kneeL.rotation.x = 0.38 + c * 0.85;
          j.kneeR.rotation.x = 0.34 + c * 0.85;
          j.armL.rotation.x = -0.55 - c * 0.4;
          j.armR.rotation.x = -0.55 - c * 0.4;
          return;
        }
        const t = (tAbs - anticipation) / duration;
        const w = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.2);
        const s = t < 0.3 ? 0 : Math.sin(((t - 0.3) / 0.7) * Math.PI);
        // The exact moment the strike lands: impact sparks fly off the dummy.
        if (hitPending && t >= 0.62) {
          hitPending = false;
          const hit = look();
          const transformed = currentForm !== 'base';
          const impact = new THREE.Vector3(DUMMY_X - 0.55, 1.7, 0);
          fx.burst(hit.hitColor, transformed ? 18 : 12, impact, 3.2);
          // Every strike lands with the anime flash frame; transformed
          // heroes also punch a shockwave through the air.
          fx.impactStar(impact);
          if (transformed) fx.shockwave(hit.hitColor, impact, false);
          juice.addShake(transformed ? 0.2 : 0.12);
          // High-streak hits freeze the frame for a beat — weight, not lag.
          if (hit.hitstop) juice.hitstop();
        }
        switch (kind) {
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
      },
    };
  }

  /**
   * Wrong answer: knocked off balance — stumbling back, arms windmilling,
   * head rattling, front leg up, with a red wince that fades on recovery.
   */
  function staggerClip(): Clip {
    return {
      duration: STYLE.juice.stagger.duration,
      apply(t, elapsed) {
        const hero = getHero();
        const j = hero.joints;
        const recoil = Math.sin(t * Math.PI);
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
        hero.bodyMaterial.emissive.setHex(0xff3b3b);
        hero.bodyMaterial.emissiveIntensity = recoil * 0.5;
      },
      onDone() {
        applyForm(currentForm);
      },
    };
  }

  /**
   * The Landmark transformation: a two-second power-up on the spot — coil
   * low gathering light, then erupt skyward, arms thrown wide, gold energy
   * pouring off in three staged waves as the new form ignites.
   */
  function landmarkClip(): Clip {
    const waves = [0.15, 0.5, 0.8];
    let nextWave = 0;
    return {
      duration: 2.0,
      apply(t, elapsed) {
        const hero = getHero();
        const j = hero.joints;
        if (nextWave < waves.length && t >= (waves[nextWave] ?? 1)) {
          nextWave += 1;
          const count = 14 + nextWave * 8;
          fx.burst(nextWave === 3 ? 0xffffff : 0xffd700, count, hero.group.position.clone().setY(1.3), 2.6 + nextWave);
          // Each wave of the Landmark gathering pulls a grand ring inward.
          fx.chargeRing(0xffd700, hero.group.position.clone().setY(1.3), true);
          juice.addShake(0.18 + nextWave * 0.08);
        }
        if (t < 0.4) {
          // Gathering: a deep coil, fists drawn to the sides.
          const c = t / 0.4;
          hero.group.position.y = heroBob(elapsed) - c * 0.2;
          j.torso.rotation.x = 0.06 + c * 0.35;
          j.kneeL.rotation.x = 0.38 + c * 0.9;
          j.kneeR.rotation.x = 0.34 + c * 0.9;
          j.armL.rotation.set(-0.2, 0, 0.75);
          j.armR.rotation.set(-0.2, 0, -0.75);
          return;
        }
        // Eruption: rise past standing, arch back, arms thrown wide to the
        // sky, easing home over the tail of the clip.
        const e = Math.min(1, (t - 0.4) / 0.25);
        const settle = t > 0.8 ? (t - 0.8) / 0.2 : 0;
        const lift = Math.sin(e * Math.PI * 0.5) * (1 - settle);
        hero.group.position.y = heroBob(elapsed) + lift * 0.55;
        j.torso.rotation.x = 0.06 - lift * 0.3;
        j.head.rotation.x = -lift * 0.35;
        j.armL.rotation.set(-2.6 * lift - 0.2, 0, 0.9 * lift + 0.3);
        j.armR.rotation.set(-2.6 * lift - 0.2, 0, -0.9 * lift - 0.3);
        j.elbowL.rotation.x = -0.3 * (1 - lift) - 1.55 * (1 - lift);
        j.elbowR.rotation.x = -0.3 * (1 - lift) - 1.55 * (1 - lift);
      },
    };
  }

  return {
    handleEffects(effects) {
      const hero = getHero();
      for (const effect of effects) {
        switch (effect.type) {
          case 'ANSWER_CORRECT':
            // Cycle through different attacks so every strike feels fresh.
            heroChannel.play(attackClip(attackCycle++ % 4), 'attack');
            dummy.hit(currentForm !== 'base');
            // A crackle of charge energy as the hero coils to strike.
            fx.burst(look().hitColor, 6, new THREE.Vector3(HERO_X + 0.4, 1.5, 0), 1.2);
            // Any transformed hero throws visible energy with each strike,
            // colored by the form that threw it.
            if (currentForm !== 'base') fx.fireBlast(false, look().auraColor);
            break;
          case 'ANSWER_WRONG':
            heroChannel.play(staggerClip(), 'stagger');
            juice.addShake(0.15);
            break;
          case 'TRANSFORMED':
            applyForm(effect.form);
            fx.burst(look().auraColor, 24, hero.group.position.clone().setY(1.5), 3.5);
            // Power rushes inward as the new form ignites.
            fx.chargeRing(
              look().auraColor,
              hero.group.position.clone().setY(1.3),
              effect.form === 'super',
            );
            juice.addShake(0.25);
            juice.speedLines();
            break;
          case 'STREAK_BROKEN':
          case 'ROUND_ENDED':
          case 'ROUND_ABANDONED':
            applyForm('base');
            break;
          case 'BLAST_FIRED':
            fx.fireBlast(true);
            juice.punchCamera();
            juice.speedLines();
            break;
          case 'LEVEL_UP':
            if (effect.cosmetic?.landmark) {
              // A Landmark Level: the full transformation scene. The hero
              // powers up live on the Results stage while the new form
              // ignites — staged bursts, speed-lines, the camera punch.
              heroChannel.play(landmarkClip(), 'landmark');
              juice.punchCamera();
              juice.speedLines();
            } else {
              fx.burst(0xffd700, 26, hero.group.position.clone().setY(1.2), 4);
              juice.addShake(0.3);
            }
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
    setPlayerLook(hair, glow, formPalette) {
      playerHair = hair;
      playerGlow = glow;
      palette = formPalette;
    },
    refreshForm() {
      applyForm(currentForm);
    },
    isStaggering: () => heroChannel.label() === 'stagger',
    update(dt, elapsed, previewing) {
      const hero = getHero();

      // Pose the rig fresh every frame: fighting stance + idle breathing
      // first, then whichever clip is running overrides the joints it
      // needs. Resetting first means an interrupted action can never leave
      // a limb stuck mid-swing.
      const bobY = heroBob(elapsed);
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
      // The flame leans and rights itself, so the edge licks sideways too.
      hero.aura.rotation.z = Math.sin(elapsed * 3.4) * 0.045;
      hero.group.position.set(HERO_X, bobY, 0);
      hero.group.rotation.set(0, previewing ? 0.35 : Math.PI / 2, 0);

      // The power-mote ring circles the fighter and breathes vertically.
      hero.powerMotes.rotation.y = elapsed * 1.3;
      hero.powerMotes.position.y = 1.05 + Math.sin(elapsed * 2.6) * 0.07;

      // Earned cosmetics live: wings beat, halos turn and drift, trails
      // flicker, spirits orbit. Each piece declared its own motion when it
      // was built, so nothing here special-cases a cosmetic by name.
      for (const motor of hero.cosmeticMotors) {
        const { object, motion } = motor;
        if (!object.visible) continue;
        if (motion.spin !== undefined) object.rotation.y = elapsed * motion.spin;
        if (motion.bob) object.position.y = motor.restY + Math.sin(elapsed * motion.bob.speed) * motion.bob.amp;
        if (motion.flap) {
          object.rotation.z = motor.restRoll + Math.sin(elapsed * motion.flap.speed) * motion.flap.amp;
        }
        if (motion.pitch) {
          object.rotation.x =
            motor.restPitch + Math.sin(elapsed * motion.pitch.speed) * motion.pitch.amp;
        }
        if (motion.pulse) {
          object.scale.setScalar(
            motor.restScale * (1 + Math.sin(elapsed * motion.pulse.speed) * motion.pulse.amp),
          );
        }
      }

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

      heroChannel.update(dt, elapsed);

      // Transformed heroes shed rising energy motes that hug the body's
      // silhouette — narrow at the boots and head, widest at the torso —
      // so the aura reads as pouring off the fighter, not a vague cloud.
      const now = look();
      if (now.moteRate > 0 || playerGlow > 0.3) {
        const rate = now.moteRate > 0 ? now.moteRate : 14;
        sparkAccum += dt * rate;
        const sparkColor = now.sparkColor;
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

      // Lightning: charged forms crackle with re-striking arcs, and a worn
      // storm cosmetic (one wisps-slot tier at a time) arcs around its own
      // wisp ring, in the palette stamped on the piece when it was built.
      const storm = [...hero.cosmetics.values()].find(
        (mesh) => mesh.visible && typeof mesh.userData.arcColor === 'number',
      );
      const stormColor = storm?.userData.arcColor as number | undefined;
      const { arcRate } = now;
      const L = STYLE.lightning;
      const totalRate = arcRate + (storm ? L.cosmeticRate : 0);
      if (totalRate > 0) {
        arcAccum += dt * totalRate;
        while (arcAccum >= 1) {
          arcAccum -= 1;
          const fromStorm =
            stormColor !== undefined && (arcRate === 0 || Math.random() < L.cosmeticShare);
          const angle = Math.random() * Math.PI * 2;
          const band = fromStorm ? L.stormRadius : L.formRadius;
          const height = fromStorm ? L.stormHeight : L.formHeight;
          const radius = band.min + Math.random() * band.spread;
          const y = height.min + Math.random() * height.spread;
          fx.lightning(
            fromStorm && stormColor !== undefined ? stormColor : now.sparkColor,
            new THREE.Vector3(
              hero.group.position.x + Math.cos(angle) * radius,
              hero.group.position.y + y,
              hero.group.position.z + Math.sin(angle) * radius,
            ),
            L.size.min + Math.random() * L.size.spread,
          );
        }
      } else {
        arcAccum = 0;
      }
    },
  };
}
