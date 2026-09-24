import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DUMMY_X, HERO_X } from './constants';
import { sideViewFraming } from './framing';

/** Where a world point lands on screen, in normalized device coordinates. */
function project(aspect: number, focus: 'fight' | 'hero', point: THREE.Vector3): THREE.Vector3 {
  const f = sideViewFraming(aspect, focus);
  const camera = new THREE.PerspectiveCamera(f.fov, aspect, 0.1, 200);
  camera.position.set(...f.position);
  camera.lookAt(...f.target);
  camera.updateMatrixWorld();
  return point.clone().project(camera);
}

// The outer corners of both fighters: feet on the stone (y 0.3), heads and
// raised fists up to y 3.2, a little body width either side.
const HERO_EDGES = [new THREE.Vector3(HERO_X - 0.7, 0.3, 0), new THREE.Vector3(HERO_X - 0.7, 3.2, 0)];
const DUMMY_EDGES = [new THREE.Vector3(DUMMY_X + 0.9, 0.3, 0), new THREE.Vector3(DUMMY_X + 0.9, 3.2, 0)];

const ASPECTS = {
  'phone portrait arena': 402 / (874 * 0.42),
  'iPad portrait arena': 820 / (1180 * 0.42),
  'very tall window': 0.6,
  desktop: 1280 / 720,
  'iPad landscape': 1180 / 820,
  'phone turned sideways': 874 / 402,
};

describe('the side-view framing', () => {
  for (const [name, aspect] of Object.entries(ASPECTS)) {
    it(`keeps both fighters fully in frame: ${name}`, () => {
      for (const point of [...HERO_EDGES, ...DUMMY_EDGES]) {
        const ndc = project(aspect, 'fight', point);
        expect(Math.abs(ndc.x), `x of ${point.toArray()}`).toBeLessThan(0.97);
        expect(Math.abs(ndc.y), `y of ${point.toArray()}`).toBeLessThan(0.97);
      }
    });
  }

  it('puts the hero on the left and the Training Dummy on the right', () => {
    const hero = project(16 / 9, 'fight', new THREE.Vector3(HERO_X, 1.5, 0));
    const dummy = project(16 / 9, 'fight', new THREE.Vector3(DUMMY_X, 1.5, 0));
    expect(hero.x).toBeLessThan(0);
    expect(dummy.x).toBeGreaterThan(0);
  });

  it('is a side view: the camera looks across the arena, not down on it', () => {
    const f = sideViewFraming(16 / 9, 'fight');
    const down = f.position[1] - f.target[1];
    const across = Math.hypot(f.position[0] - f.target[0], f.position[2] - f.target[2]);
    expect(Math.atan2(down, across)).toBeLessThan((15 * Math.PI) / 180);
  });

  for (const [name, aspect] of Object.entries(ASPECTS)) {
    it(`the hero focus keeps the whole hero in frame: ${name}`, () => {
      for (const point of HERO_EDGES) {
        const ndc = project(aspect, 'hero', point);
        expect(Math.abs(ndc.x)).toBeLessThan(0.97);
        expect(Math.abs(ndc.y)).toBeLessThan(0.97);
      }
    });
  }
});
