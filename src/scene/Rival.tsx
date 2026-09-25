/** @jsxImportSource react */
// The Rival's body is the Tripo fighter (ADR 0011): a cosmetic opponent
// that takes the hero's strikes. The director (renderer/rival.ts) picks
// the clip; this component plays it with drei's useAnimations and fades
// from the old clip to the new one. A Rapier sensor is the hurtbox: a hero
// fist or boot that enters it lands the strike.
//
// Every cue is a clip of the baked model. Launch and Recover are
// HY-Motion clips (ADR 0012): the body is thrown back, then drops in and
// lands. This component adds the flight out of the frame and back, timed
// on the clips' own lengths (the clip owns its length).

import { useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RIVAL_X, FIGHTER_HEIGHT } from '../renderer/constants';
import type { RivalDirector } from '../renderer/rival';
import { STYLE } from '../renderer/style';
import { FIGHTER_SOURCE_HEIGHT, FighterModel, useFighterClips } from './models/FighterModel';

/** The launch: how far up and back the fighter flies (out of the frame)
 *  over the Launch clip, and the fraction of the Recover clip by which it
 *  is back on its spot: the clip's landing crouch (the window chosen in
 *  scripts/blender/sources/hy-motion/clips.json). */
const LAUNCH = { back: 7, up: 3, landAt: 0.4 };

/** The hurtbox: the fighter's body and head, half-extents in game units. */
const HURTBOX_HALF: [number, number, number] = [0.45, FIGHTER_HEIGHT / 2 - 0.05, 0.45];
const HURTBOX_CENTER_Y = FIGHTER_HEIGHT / 2;

const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export function Rival({
  director,
  timeScale,
  onStruck,
}: {
  director: RivalDirector;
  /** The render time scale (the hitstop freeze), read every frame. */
  timeScale: () => number;
  /** A hero fist or boot entered the hurtbox. */
  onStruck: () => void;
}) {
  const model = useRef<THREE.Group>(null);
  const flight = useRef<THREE.Group>(null);
  const clips = useFighterClips();
  const { actions, mixer } = useAnimations(clips, model);
  const [cue, setCue] = useState(director.cue());
  const cueRef = useRef(cue);
  const since = useRef(0); // scaled seconds since the cue began

  useEffect(() => director.onCue(setCue), [director]);

  // Every clip but Idle plays once and holds its last pose; the director
  // hands on to the next clip when one ends, by the cue's own name.
  useEffect(() => {
    for (const clip of clips) {
      const action = actions[clip.name];
      if (!action || clip.name === 'Idle') continue;
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      const now = cueRef.current.clip;
      if (now === event.action.getClip().name) director.finished(now);
    };
    mixer.addEventListener('finished', onFinished);
    return () => mixer.removeEventListener('finished', onFinished);
  }, [actions, clips, director, mixer]);

  // Reset and fade into the new clip, so the change never snaps.
  useEffect(() => {
    cueRef.current = cue;
    since.current = 0;
    const action = actions[cue.clip];
    action?.reset().fadeIn(STYLE.rivalBlend).play();
    return () => {
      action?.fadeOut(STYLE.rivalBlend);
    };
  }, [actions, cue]);

  useFrame((_, delta) => {
    // The hitstop freeze reaches the fighter's clips and its flight too.
    const scale = timeScale();
    mixer.timeScale = scale;
    since.current += delta * scale;
    const group = flight.current;
    if (!group) return;
    const now = cueRef.current.clip;
    const length = actions[now]?.getClip().duration ?? 1;
    if (now === 'Launch') {
      const t = Math.min(1, since.current / length);
      group.position.set(LAUNCH.back * easeIn(t), LAUNCH.up * easeOut(t), 0);
    } else if (now === 'Recover') {
      const t = 1 - easeOut(Math.min(1, since.current / (length * LAUNCH.landAt)));
      group.position.set(LAUNCH.back * t, LAUNCH.up * t, 0);
    } else {
      group.position.set(0, 0, 0);
    }
  });

  return (
    <group position={[RIVAL_X, 0.3, 0]}>
      <group ref={flight}>
        {/* Tripo faces +X: turn to face the hero (-X), a three-quarter view
            toward the camera, and scale the ~1 m model to the game. */}
        <FighterModel
          groupRef={model}
          rotation-y={Math.PI + STYLE.rivalTurn}
          scale={FIGHTER_HEIGHT / FIGHTER_SOURCE_HEIGHT}
        />
      </group>
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
