/** @jsxImportSource react */
// The Training Dummy in the R3F scene (ADR 0009). The director
// (renderer/dummy.ts) picks the clip; this component plays it with drei's
// useAnimations and fades from the old clip to the new one. A Rapier sensor
// is the Dummy's hurtbox: a hero fist or boot that enters it lands the strike.

import { useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DUMMY_X } from '../renderer/constants';
import type { DummyDirector } from '../renderer/dummy';
import { STYLE } from '../renderer/style';
import { TrainingDummyModel, useDummyClips } from './models/TrainingDummyModel';

/** The hurtbox: the Dummy's body and head, half-extents in metres. */
const HURTBOX_HALF: [number, number, number] = [0.45, 0.8, 0.45];
const HURTBOX_CENTER_Y = 1.3;

export function TrainingDummy({
  director,
  timeScale,
  onStruck,
}: {
  director: DummyDirector;
  /** The render time scale (the hitstop freeze), read every frame. */
  timeScale: () => number;
  /** A hero fist or boot entered the hurtbox. */
  onStruck: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const clips = useDummyClips();
  const { actions, mixer } = useAnimations(clips, group);
  const [cue, setCue] = useState(director.cue());

  useEffect(() => director.onCue(setCue), [director]);

  // Every clip but Idle plays once and holds its last pose; the director
  // hands on to the next clip when one ends.
  useEffect(() => {
    for (const clip of clips) {
      const action = actions[clip.name];
      if (!action || clip.name === 'Idle') continue;
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    const onFinished = (event: { action: THREE.AnimationAction }) =>
      director.finished(event.action.getClip().name);
    mixer.addEventListener('finished', onFinished);
    return () => mixer.removeEventListener('finished', onFinished);
  }, [actions, clips, director, mixer]);

  // Reset and fade into the new clip, so the change never snaps.
  useEffect(() => {
    const action = actions[cue.clip];
    action?.reset().fadeIn(STYLE.dummyBlend).play();
    return () => {
      action?.fadeOut(STYLE.dummyBlend);
    };
  }, [actions, cue]);

  // The hitstop freeze reaches the Dummy's clips too.
  useFrame(() => {
    mixer.timeScale = timeScale();
  });

  return (
    <group position={[DUMMY_X, 0.3, 0]}>
      {/* The turn lives on the model: a three-quarter view shows the face. */}
      <TrainingDummyModel groupRef={group} rotation-y={STYLE.dummyTurn} />
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          sensor
          args={HURTBOX_HALF}
          position={[0, HURTBOX_CENTER_Y, 0]}
          activeCollisionTypes={ActiveCollisionTypes.ALL}
          onIntersectionEnter={onStruck}
        />
      </RigidBody>
    </group>
  );
}
