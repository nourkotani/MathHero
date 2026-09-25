// The 2.5D side view (ticket #55): where the camera stands for any shape of
// arena region. A pure function of the aspect, so the rule is tested with
// plain math and the rig only eases toward its answer.

import { RIVAL_X, HERO_X } from './constants';
import { STYLE } from './style';

export type Focus = 'fight' | 'hero';

export interface Framing {
  position: [number, number, number];
  target: [number, number, number];
  /** Vertical field of view, in degrees. */
  fov: number;
}

/** What each focus must show, in world units (x span, y span). */
const SUBJECTS: Record<Focus, { left: number; right: number; bottom: number; top: number }> = {
  // Both fighters, heads, fists, and a little of the Rival's recoil room.
  fight: { left: HERO_X - 0.9, right: RIVAL_X + 1.1, bottom: 0.3, top: 3.3 },
  // The hero alone: Hero creation, Results, and the level-up ceremonies.
  hero: { left: HERO_X - 1.0, right: HERO_X + 1.0, bottom: 0.3, top: 3.4 },
};

/**
 * Stand the camera square to the fighters, at chest height, just far
 * enough back that the subject fills the frame with a margin — on a tall
 * phone the width decides the distance, on a wide screen the height does.
 */
export function sideViewFraming(aspect: number, focus: Focus): Framing {
  const { fov, margin, lift } = STYLE.camera;
  const s = SUBJECTS[focus];
  const cx = (s.left + s.right) / 2;
  const cy = (s.bottom + s.top) / 2;
  const halfW = ((s.right - s.left) / 2) * margin;
  const halfH = ((s.top - s.bottom) / 2) * margin;
  const tanV = Math.tan((fov * Math.PI) / 360);
  const distance = Math.max(halfH / tanV, halfW / (tanV * aspect));
  return {
    position: [cx, cy + lift, distance],
    target: [cx, cy, 0],
    fov,
  };
}
