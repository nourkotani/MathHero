/** @jsxImportSource react */
// The hero's hitboxes (ADR 0009): one Rapier sensor ball on each fist and
// each boot. Each frame the balls follow the bones of the hero's authored
// clip. The Rival's hurtbox reports the contact; the core already decided
// that the strike happens (ADR 0003), and the contact only times it.

import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat';
import { useRef } from 'react';
import type * as THREE from 'three';

/** The strike points: the fists and the boots, in the order the renderer gives. */
const STRIKE_POINTS = 4;
const STRIKE_RADIUS = 0.22;

export function HeroHitboxes({ strikePoints }: { strikePoints: () => THREE.Vector3[] }) {
  const bodies = useRef<Array<RapierRigidBody | null>>([]);

  useFrame(() => {
    const points = strikePoints();
    points.forEach((point, i) => bodies.current[i]?.setNextKinematicTranslation(point));
  });

  return (
    <>
      {Array.from({ length: STRIKE_POINTS }, (_, i) => (
        <RigidBody
          key={i}
          ref={(body) => {
            bodies.current[i] = body;
          }}
          type="kinematicPosition"
          colliders={false}
        >
          <BallCollider
            sensor
            args={[STRIKE_RADIUS]}
            activeCollisionTypes={ActiveCollisionTypes.ALL}
          />
        </RigidBody>
      ))}
    </>
  );
}
