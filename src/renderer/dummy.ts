// The Training Dummy: a cosmetic opponent. It reacts — varied recoils on
// hits, a dramatic launch on super blasts, a cheeky taunt while the hero
// staggers — but never affects scoring. Hit reactions are a data table:
// adding a new one is a new entry, not new animation machinery.

import * as THREE from 'three';
import { DUMMY_X } from './constants';
import { loadModel } from './models';
import { STYLE } from './style';
import dummyModelUrl from './models/training-dummy.glb';
import { createChannel } from './timeline';

/** A hit reaction: a fixed-length pose over normalized time. */
interface ReactionDef {
  label: string;
  duration: number;
  /** Reserved for transformed heroes — plain hits never look this wild. */
  strongOnly?: boolean;
  pose(group: THREE.Group, t: number, elapsed: number): void;
}

const HIT_REACTIONS: ReactionDef[] = [
  {
    label: 'rock-back',
    duration: 0.55,
    pose(group, t) {
      group.rotation.x = Math.sin(t * Math.PI) * 0.35;
    },
  },
  {
    label: 'side-sway',
    duration: 0.5,
    pose(group, t) {
      // A full there-and-back wobble across the hit.
      group.rotation.z = Math.sin(t * Math.PI * 2) * 0.28;
      group.rotation.x = Math.sin(t * Math.PI) * 0.12;
    },
  },
  {
    label: 'spin',
    duration: 0.6,
    strongOnly: true,
    pose(group, t) {
      // One full yaw spin with a little tilt, ending square again.
      group.rotation.y = t * Math.PI * 2;
      group.rotation.x = Math.sin(t * Math.PI) * 0.15;
    },
  },
];

export interface Dummy {
  group: THREE.Group;
  /** A hit lands: next reaction from the variety rotation; transformed
   *  heroes (strong) unlock the wilder entries. */
  hit(strong: boolean): void;
  /** Dramatic super-blast launch: up, over, and a full flip. */
  launch(): void;
  update(dt: number, elapsed: number, heroStaggering: boolean): void;
}

export function createDummy(): Dummy {
  // The body is baked in Blender (scripts/blender/training_dummy.py); it
  // joins the group a moment after boot, once the inlined bytes decode.
  // Every reaction moves the group, so none of them waits for the model.
  const group = new THREE.Group();
  loadModel(dummyModelUrl, (model) => {
    // The turn lives on the model, under the group that the reactions move.
    model.rotation.y = STYLE.dummyTurn;
    group.add(model);
  });
  group.position.set(DUMMY_X, 0.3, 0);

  const channel = createChannel();
  let variety = 0;

  const resetPose = () => {
    group.position.set(DUMMY_X, 0.3, 0);
    group.rotation.set(0, 0, 0);
  };

  return {
    group,
    hit(strong) {
      const pool = HIT_REACTIONS.filter((r) => strong || !r.strongOnly);
      const reaction = pool[variety++ % pool.length];
      if (!reaction) return;
      channel.play(
        {
          duration: reaction.duration,
          apply: (t, elapsed) => reaction.pose(group, t, elapsed),
          onDone: resetPose,
        },
        reaction.label,
      );
    },
    launch() {
      channel.play(
        {
          duration: 0.9,
          apply(t) {
            const arc = Math.sin(t * Math.PI);
            group.position.x = DUMMY_X + t * 2.2;
            group.position.y = 0.3 + arc * 2.4;
            group.rotation.x = t * Math.PI * 2;
          },
          onDone: resetPose,
        },
        'launch',
      );
    },
    update(dt, elapsed, heroStaggering) {
      if (channel.playing()) {
        channel.update(dt, elapsed);
        return;
      }
      if (heroStaggering) {
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
