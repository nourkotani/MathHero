// The Training Dummy: a cosmetic opponent. It reacts — varied recoils on
// hits, a launch and a drop-back-in on full-power blasts, a cheeky taunt when
// the hero flinches — but never affects scoring. Its body and every clip are
// baked in Blender (scripts/blender/training_dummy.py, ADR 0007); this module
// only picks which clip plays. Each call comes from an effect (ADR 0003).

import * as THREE from 'three';
import { DUMMY_X } from './constants';
import { loadModel } from './models';
import dummyModelUrl from './models/training-dummy.glb';
import { STYLE } from './style';

/** The hit clips, in variety order. Wilder ones wait for a transformed hero. */
const HIT_CLIPS: ReadonlyArray<{ clip: string; strongOnly?: boolean }> = [
  { clip: 'HitBack' },
  { clip: 'HitTwist' },
  { clip: 'HitSpin', strongOnly: true },
];

/** Airborne clips: the Dummy is off its spot, so hits and taunts wait. */
const AIRBORNE = new Set(['Launch', 'Recover']);

export interface Dummy {
  group: THREE.Group;
  /** A hit lands: next clip from the variety rotation; transformed heroes
   *  (strong) unlock the wilder entries. */
  hit(strong: boolean): void;
  /** A full-power blast lands: fly out of the frame, then drop back in. */
  launch(): void;
  /** The hero flinched at a wrong answer: a cheeky wiggle. */
  taunt(): void;
  update(dt: number): void;
}

export function createDummy(): Dummy {
  const group = new THREE.Group();
  group.position.set(DUMMY_X, 0.3, 0);

  let mixer: THREE.AnimationMixer | null = null;
  const actions = new Map<string, THREE.AnimationAction>();
  let current: THREE.AnimationAction | null = null;
  let variety = 0;

  function play(name: string) {
    const next = actions.get(name);
    if (!next) return; // not decoded yet: the Dummy is not on screen either
    const blend = STYLE.dummyBlend;
    if (current && current !== next) current.fadeOut(blend);
    next.reset().fadeIn(blend).play();
    current = next;
  }

  const airborne = () => current !== null && AIRBORNE.has(current.getClip().name);

  // The body joins the group a moment after boot, once the inlined bytes
  // decode.
  loadModel(dummyModelUrl, (model, clips) => {
    // The turn lives on the model: a three-quarter view shows the face.
    model.rotation.y = STYLE.dummyTurn;
    group.add(model);
    mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) {
      const action = mixer.clipAction(clip);
      if (clip.name !== 'Idle') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions.set(clip.name, action);
    }
    // One-shot clips hand back to idle; a launch hands on to the recover.
    // Only the clip that is playing may hand on: a clip that was already
    // fading out can still reach its end during the blend, and must not
    // cut off the clip that replaced it (a Launch cut off by a Recover).
    mixer.addEventListener('finished', (event) => {
      if (event.action !== current) return;
      play(event.action.getClip().name === 'Launch' ? 'Recover' : 'Idle');
    });
    play('Idle');
  });

  return {
    group,
    hit(strong) {
      if (airborne()) return;
      const pool = HIT_CLIPS.filter((h) => strong || !h.strongOnly);
      const pick = pool[variety++ % pool.length];
      if (pick) play(pick.clip);
    },
    launch() {
      play('Launch');
    },
    taunt() {
      if (!airborne()) play('Taunt');
    },
    update(dt) {
      mixer?.update(dt);
    },
  };
}
