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
  /** A small camera punch-in on a strike landing. */
  nudgeCamera(): void;
  /** Anime speed-lines flash on transformations and Super blasts. */
  speedLines(): void;
  /** One impact frame on a big hit, if the safety gate allows it. */
  impactFrame(): void;
}

export interface Reactions {
  handleEffects(effects: GameEffect[]): void;
  /** A hero fist or boot touched the Dummy's hurtbox. */
  strikeContact(): void;
  /** The Player's permanent identity: chosen hair, level glow, earned Form. */
  setPlayerLook(hair: number, glow: number, palette: FormPalette | null): void;
  /** Re-dress the current rig (after colors change or the hero rebuilds). */
  refreshForm(): void;
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

  /** The strike in the air: it lands once, on contact or at the fallback. */
  let pendingStrike: { kind: number; landed: boolean; active: boolean } | null = null;

  /**
   * The moment a strike lands: impact sparks fly off the dummy and the
   * Dummy recoils. A hero fist or boot touching the Dummy's hurtbox
   * (src/scene/HeroHitboxes.tsx) calls this; so does the fallback in
   * attackClip, so no strike ever goes without its hit.
   */
  function landStrike() {
    const strike = pendingStrike;
    if (!strike || strike.landed || !strike.active) return;
    strike.landed = true;
    const kind = strike.kind;
    const hit = look();
    const transformed = currentForm !== 'base';
    dummy.hit(transformed);
    const impact = new THREE.Vector3(DUMMY_X - 0.55, 1.7, 0);
    fx.burst(hit.hitColor, transformed ? 18 : 12, impact, 3.2);
    // Every strike lands with the anime flash frame; transformed
    // heroes also punch a shockwave through the air.
    fx.impactStar(impact);
    // A hand-drawn slash across every strike, its angle set by the
    // attack, colored by the Form once the hero has transformed.
    const angles = STYLE.impact.slash.angles;
    fx.slash(transformed ? hit.hitColor : 0xffffff, impact, angles[kind % angles.length] ?? 0);
    if (transformed) fx.shockwave(hit.hitColor, impact, false);
    juice.addShake(transformed ? 0.2 : 0.12);
    juice.nudgeCamera();
    // High-streak hits freeze the frame for a beat — weight, not lag —
    // and land as a big hit: a comic burst and an impact frame.
    if (hit.hitstop) {
      juice.hitstop();
      fx.comicBurst(impact);
      juice.impactFrame();
    }
  }

  /**
   * One of four strikes. The pose is an authored Blender clip (Attack0–3:
   * an anticipation crouch, the wind-up, the dash-in strike, and home).
   * The strike lands when a fist or boot touches the Dummy (landStrike);
   * this clip opens the contact window and lands it late if nothing touched.
   */
  function attackClip(kind: number): Clip {
    // A new strike cuts off the old one's clip; the old hit still lands.
    if (pendingStrike && !pendingStrike.landed) {
      pendingStrike.active = true;
      landStrike();
    }
    const strike = { kind, landed: false, active: false };
    pendingStrike = strike;
    const { duration, anticipation } = STYLE.juice.attack;
    const total = anticipation + duration;
    getHero().play(`Attack${kind}`);
    return {
      duration: total,
      apply(tc) {
        const t = (tc * total - anticipation) / duration;
        // The wind-up never lands: contact counts from the strike on.
        if (t >= STYLE.juice.attack.contactFrom) strike.active = true;
        if (t >= STYLE.juice.attack.landBy && pendingStrike === strike) landStrike();
      },
      onDone() {
        if (pendingStrike === strike) pendingStrike = null;
      },
    };
  }

  /**
   * Wrong answer: the authored Stagger clip knocks the hero off balance;
   * this clip adds the red wince on the outfit that fades on recovery.
   */
  function staggerClip(): Clip {
    getHero().play('Stagger');
    return {
      duration: STYLE.juice.stagger.duration,
      apply(t) {
        const hero = getHero();
        const recoil = Math.sin(t * Math.PI);
        hero.bodyMaterial.emissive.setHex(0xff3b3b);
        hero.bodyMaterial.emissiveIntensity = recoil * 0.5;
      },
      onDone() {
        applyForm(currentForm);
      },
    };
  }

  /**
   * The Landmark transformation: the authored Transform clip coils low and
   * erupts skyward; this clip pours the gold energy off in three staged
   * waves and swaps the hair at the moment of ascension.
   */
  function landmarkClip(): Clip {
    const waves = [0.15, 0.5, 0.8];
    let nextWave = 0;
    // The old hair shows while the power gathers; the new Form's hair
    // (a shared mane from Wild Mane on) takes over as the hero erupts.
    let ascended = false;
    getHero().showHair(getHero().hairBefore);
    getHero().play('Transform');
    return {
      duration: 2.0,
      // However the scene ends, the hero leaves it wearing the new hair.
      onDone: () => getHero().showHair(getHero().hairNow),
      apply(t) {
        const hero = getHero();
        if (nextWave < waves.length && t >= (waves[nextWave] ?? 1)) {
          nextWave += 1;
          const count = 14 + nextWave * 8;
          fx.burst(nextWave === 3 ? 0xffffff : 0xffd700, count, hero.group.position.clone().setY(1.3), 2.6 + nextWave);
          // Each wave of the Landmark gathering pulls a grand ring inward.
          fx.chargeRing(0xffd700, hero.group.position.clone().setY(1.3), true);
          juice.addShake(0.18 + nextWave * 0.08);
        }
        if (!ascended && t >= 0.4) {
          ascended = true;
          hero.showHair(hero.hairNow);
        }
      },
    };
  }


  return {
    strikeContact: landStrike,
    handleEffects(effects) {
      const hero = getHero();
      for (const effect of effects) {
        switch (effect.type) {
          case 'ANSWER_CORRECT':
            // Cycle through different attacks so every strike feels fresh.
            heroChannel.play(attackClip(attackCycle++ % 4), 'attack');
            // A crackle of charge energy as the hero coils to strike.
            fx.burst(look().hitColor, 6, new THREE.Vector3(HERO_X + 0.4, 1.5, 0), 1.2);
            // Any transformed hero throws visible energy with each strike,
            // colored by the form that threw it.
            if (currentForm !== 'base') fx.fireBlast(false, look().auraColor);
            break;
          case 'ANSWER_WRONG':
            heroChannel.play(staggerClip(), 'stagger');
            dummy.taunt();
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
            // The hero powers up once the strike that earned it has landed.
            // (Reaching Super fires a Blast in the same moment: the Blast
            // takes over at once, and the Charge yields to it.)
            hero.play('Charge', true);
            break;
          case 'STREAK_BROKEN':
            applyForm('base');
            break;
          case 'ROUND_ENDED':
            applyForm('base');
            // Results: a hop and a fist to the sky (a Landmark scene that
            // follows in the same effects takes over).
            hero.play('Victory');
            break;
          case 'ROUND_ABANDONED':
            applyForm('base');
            hero.play('Idle');
            break;
          case 'BLAST_FIRED':
            // A full-power blast replaces the strike pose at once, so the
            // pose matches the blast leaving the hero's hands; it also
            // drops a queued Charge.
            hero.play('Blast');
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

      // Every pose is an authored Blender clip (Idle between actions); the
      // code clips below only time effects (impacts, the wince, the waves).
      hero.animate(dt);

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
