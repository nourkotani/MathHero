// Baked model imports resolve to a URL (a data URI in the single-file build —
// vite-plugin-singlefile inlines every imported asset). See ADR 0007.
declare module '*.glb' {
  const url: string;
  export default url;
}
