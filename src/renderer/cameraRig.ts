// The camera rig: a fixed home framing plus composable additive offsets —
// shake energy and a punch-in clip — that always decay back to zero. The
// base never moves, so drift is structurally impossible; a future camera
// move is one more offset, not a rewrite.

import * as THREE from 'three';
import { createChannel } from './timeline';
import { STYLE } from './style';

export interface CameraRig {
  addShake(amount: number): void;
  /** Quick punch-in toward the arena on a Super-mode blast. */
  punch(): void;
  update(dt: number, elapsed: number): void;
}

export function createCameraRig(camera: THREE.PerspectiveCamera): CameraRig {
  const home = new THREE.Vector3(0, 4.2, 10);
  camera.position.copy(home);
  camera.lookAt(0, 1.4, 0);

  let shake = 0;
  const punchOffset = new THREE.Vector3();
  const punchChannel = createChannel();

  return {
    addShake(amount) {
      shake = Math.max(shake, amount);
    },
    punch() {
      const { dolly, drop, duration, shake: punchShake } = STYLE.juice.punch;
      shake = Math.max(shake, punchShake);
      punchChannel.play({
        duration,
        apply(t) {
          // Snap in fast, ease back home.
          const strength = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
          punchOffset.set(0, -drop * strength, -dolly * strength);
        },
      });
    },
    update(dt, elapsed) {
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
    },
  };
}
