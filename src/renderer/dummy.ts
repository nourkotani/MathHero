// The Training Dummy: a cosmetic opponent. It reacts — varied recoils on
// hits, a dramatic launch on super blasts, a cheeky taunt while the hero
// staggers — but never affects scoring. Hit reactions are a data table:
// adding a new one is a new entry, not new animation machinery.

import * as THREE from 'three';
import { characterSurface } from './materials';
import { applyCelTreatment } from './cel';
import { DUMMY_X } from './constants';
import { createChannel } from './timeline';

/** A hit reaction: a fixed-length pose over normalized time. */
interface ReactionDef {
  label: string;
  duration: number;
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
    pose(group, t) {
      // One full yaw spin with a little tilt, ending square again.
      group.rotation.y = t * Math.PI * 2;
      group.rotation.x = Math.sin(t * Math.PI) * 0.15;
    },
  },
];

export interface Dummy {
  group: THREE.Group;
  /** A hit lands: play the next reaction from the variety rotation. */
  hit(): void;
  /** Dramatic super-blast launch: up, over, and a full flip. */
  launch(): void;
  update(dt: number, elapsed: number, heroStaggering: boolean): void;
}

export function createDummy(): Dummy {
  const group = buildTrainingDummy();
  applyCelTreatment(group);
  group.position.set(DUMMY_X, 0.3, 0);

  const channel = createChannel();
  let variety = 0;

  const resetPose = () => {
    group.position.set(DUMMY_X, 0.3, 0);
    group.rotation.set(0, 0, 0);
  };

  return {
    group,
    hit() {
      const reaction = HIT_REACTIONS[variety++ % HIT_REACTIONS.length];
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

function buildTrainingDummy(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.7, 0.35, 20),
    characterSurface(0x8a6642),
  );
  base.position.y = 0.18;
  group.add(base);

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 1.1, 12),
    characterSurface(0xa8834f),
  );
  post.position.y = 0.9;
  group.add(post);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.6, 6, 12),
    characterSurface(0xc9584a),
  );
  torso.position.y = 1.8;
  group.add(torso);

  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 20, 16),
    characterSurface(0xd9d9d9),
  );
  face.position.y = 2.55;
  group.add(face);

  const target = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.045, 8, 20),
    characterSurface(0xffffff),
  );
  target.position.set(-0.38, 1.8, 0);
  target.rotation.y = Math.PI / 2;
  group.add(target);

  return group;
}
