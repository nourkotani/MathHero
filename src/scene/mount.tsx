/** @jsxImportSource react */
// The R3F root (ADR 0009). React Three Fiber owns the #scene canvas: its
// WebGL renderer, scene, camera and frame loop. The Preact overlay keeps
// #ui. Both read the same store; the scene reacts to effects[] only
// (ADR 0003), through the Arena component's subscription.

import { createRoot, extend } from '@react-three/fiber';
import * as THREE from 'three';
import type { Store } from '../app/store';
import { createCamera, createGl } from '../renderer';
import { Arena } from './Arena';

// JSX elements such as <skinnedMesh> need their three.js classes registered.
extend(THREE as unknown as Parameters<typeof extend>[0]);

export async function mountScene(canvas: HTMLCanvasElement, store: Store): Promise<void> {
  const root = createRoot(canvas);
  // Every configure() call takes the full props: a call without the camera
  // makes R3F swap in a default camera.
  const props = {
    gl: createGl(canvas),
    camera: createCamera(canvas),
    // The look is decided in materials.ts: sRGB output, no tone mapping,
    // and plain PCF shadows softened by the sun's radius (stage.ts).
    flat: true,
    shadows: 'percentage' as const,
    dpr: [1, 2] as [number, number],
  };
  // The canvas box is the arena region of the Layout, not its parent.
  await root.configure({ ...props, size: sizeOf(canvas) });
  // The Layout moves the arena region; R3F follows the canvas box.
  new ResizeObserver(() => {
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
    void root.configure({ ...props, size: sizeOf(canvas) });
  }).observe(canvas);
  root.render(<Arena store={store} />);
}

function sizeOf(canvas: HTMLCanvasElement) {
  return { width: canvas.clientWidth || 1, height: canvas.clientHeight || 1, top: 0, left: 0 };
}
