// The impact frame as a screen-space post effect: for a few hundredths of a
// second the whole frame turns two-tone — ink for the dark, warm paper for
// the light — like a held panel in an anime fight. It fires only when the
// gate in impactFrame.ts allows it, and lives behind the pipeline facade
// (ADR 0004).

import { Color, Uniform } from 'three';
import { Effect } from 'postprocessing';
import { STYLE } from './style';

const fragmentShader = /* glsl */ `
  uniform float strength;
  uniform vec3 ink;
  uniform vec3 paper;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float luma = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));
    float light = smoothstep(THRESHOLD - 0.04, THRESHOLD + 0.04, luma);
    vec3 tone = mix(ink, paper, light);
    outputColor = vec4(mix(inputColor.rgb, tone, strength), inputColor.a);
  }
`;

export class ImpactFrameEffect extends Effect {
  private remaining = 0;

  constructor() {
    const s = STYLE.impactFrame;
    super('ImpactFrameEffect', fragmentShader, {
      defines: new Map<string, string>([['THRESHOLD', s.threshold.toFixed(3)]]),
      uniforms: new Map<string, Uniform>([
        ['strength', new Uniform(0)],
        ['ink', new Uniform(new Color(s.ink))],
        ['paper', new Uniform(new Color(s.paper))],
      ]),
    });
  }

  /** Hold one impact frame; update() ends it after its short duration. */
  flash(): void {
    this.remaining = STYLE.impactFrame.duration;
  }

  override update(_renderer: unknown, _inputBuffer: unknown, deltaTime = 0): void {
    this.remaining = Math.max(0, this.remaining - deltaTime);
    // Full strength while it holds, then a quick release over the last
    // third, so the frame ends clean instead of popping.
    const d = STYLE.impactFrame.duration;
    this.uniforms.get('strength')!.value =
      this.remaining <= 0 ? 0 : Math.min(1, this.remaining / (d / 3)) * STYLE.impactFrame.strength;
  }
}
