// The camera rig: a side-view home framing plus composable additive
// offsets — shake energy and a punch-in clip — that always decay back to
// zero. The home comes from framing.ts for the arena's shape and the
// current focus; when either changes, the rig eases to the new home, so
// drift is structurally impossible. A future camera move is one more
// offset, not a rewrite.

import * as THREE from 'three';
import { sideViewFraming } from './framing';
import type { Focus } from './framing';
import { createChannel } from './timeline';
import { STYLE } from './style';

export interface CameraRig {
  /** Frame the arena region's shape for a focus: both fighters, or the hero. */
  setView(aspect: number, focus: Focus): void;
  addShake(amount: number): void;
  /** Quick punch-in toward the fight on Super-mode blasts and ceremonies. */
  punch(): void;
  /** A small punch-in on a strike landing. */
  nudge(): void;
  update(dt: number, elapsed: number): void;
}

export function createCameraRig(camera: THREE.PerspectiveCamera): CameraRig {
  const home = new THREE.Vector3();
  const target = new THREE.Vector3();
  const goalHome = new THREE.Vector3();
  const goalTarget = new THREE.Vector3();
  let goalFov = camera.fov;
  let placed = false;

  let shake = 0;
  const punchOffset = new THREE.Vector3();
  const punchChannel = createChannel();
  const toTarget = new THREE.Vector3();

  function punchClip(scale: number) {
    const { dolly, drop, duration, shake: punchShake } = STYLE.juice.punch;
    shake = Math.max(shake, punchShake * scale);
    punchChannel.play({
      duration,
      apply(t) {
        // Snap in fast, ease back home — along the line of sight.
        const strength = (t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75) * scale;
        toTarget.subVectors(target, home).normalize();
        punchOffset.copy(toTarget).multiplyScalar(dolly * strength);
        punchOffset.y -= drop * strength;
      },
    });
  }

  return {
    setView(aspect, focus) {
      const f = sideViewFraming(aspect, focus);
      goalHome.set(...f.position);
      goalTarget.set(...f.target);
      goalFov = f.fov;
      if (!placed) {
        // The first framing is where the camera starts: no ease from nowhere.
        home.copy(goalHome);
        target.copy(goalTarget);
        camera.fov = goalFov;
        camera.updateProjectionMatrix();
        placed = true;
      }
    },
    addShake(amount) {
      shake = Math.max(shake, amount);
    },
    punch() {
      punchClip(1);
    },
    nudge() {
      punchClip(STYLE.juice.nudge);
    },
    update(dt, elapsed) {
      // Ease toward the framing for the current shape and focus.
      const ease = 1 - Math.exp(-STYLE.camera.ease * dt);
      home.lerp(goalHome, ease);
      target.lerp(goalTarget, ease);
      if (Math.abs(camera.fov - goalFov) > 0.01) {
        camera.fov += (goalFov - camera.fov) * ease;
        camera.updateProjectionMatrix();
      }

      punchOffset.set(0, 0, 0);
      punchChannel.update(dt, elapsed);

      // Screen shake decays exponentially.
      if (shake > 0.001) {
        shake *= Math.exp(-6 * dt);
      } else {
        shake = 0;
      }
      camera.position.set(
        home.x + punchOffset.x + Math.sin(elapsed * 71) * shake * 0.25,
        home.y + punchOffset.y + Math.sin(elapsed * 89) * shake * 0.2,
        home.z + punchOffset.z,
      );
      camera.lookAt(target);
    },
  };
}
