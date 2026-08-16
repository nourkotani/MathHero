// Anime speed-lines as a screen-space post effect: a ring of radial white
// streaks flashing in from the edges on big hits, gone in a third of a
// second. Lives behind the pipeline facade (ADR 0004) on the full tier only.

import { Uniform } from 'three';
import { Effect } from 'postprocessing';
import { STYLE } from './style';

const fragmentShader = /* glsl */ `
  uniform float intensity;
  uniform float seed;

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 d = uv - 0.5;
    d.x *= 1.6; // keep the ring roughly round on a widescreen frame
    float r = length(d);
    float turn = atan(d.y, d.x) / 6.28318 + 0.5;
    float slot = floor(turn * SLOTS);
    float f = fract(turn * SLOTS);
    // A thin streak in the middle of each angular slot, with a random
    // per-slot (and per-flash, via seed) starting radius.
    float line = smoothstep(0.38, 0.5, f) * smoothstep(0.62, 0.5, f);
    float start = 0.26 + hash(slot + seed) * 0.24;
    float reach = smoothstep(start, start + 0.16, r);
    float a = intensity * line * reach * STRENGTH;
    outputColor = vec4(mix(inputColor.rgb, vec3(1.0), a), inputColor.a);
  }
`;

export class SpeedLinesEffect extends Effect {
  constructor() {
    super('SpeedLinesEffect', fragmentShader, {
      defines: new Map<string, string>([
        ['SLOTS', STYLE.speedLines.slots.toFixed(1)],
        ['STRENGTH', STYLE.speedLines.strength.toFixed(3)],
      ]),
      uniforms: new Map<string, Uniform>([
        ['intensity', new Uniform(0)],
        ['seed', new Uniform(0)],
      ]),
    });
  }

  /** Fire one flash: full strength now, decayed to nothing by update(). */
  flash(): void {
    this.uniforms.get('intensity')!.value = 1;
    this.uniforms.get('seed')!.value = Math.random() * 100;
  }

  override update(_renderer: unknown, _inputBuffer: unknown, deltaTime = 0): void {
    const intensity = this.uniforms.get('intensity')!;
    intensity.value = Math.max(0, (intensity.value as number) - deltaTime * STYLE.speedLines.decay);
  }
}
