// Baked texture imports resolve to a URL (a data URI in the single-file
// build — vite-plugin-singlefile inlines every imported asset).
declare module '*.png' {
  const url: string;
  export default url;
}
