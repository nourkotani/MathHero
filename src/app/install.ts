// The hosted copy (ADR 0006): the service worker and the manifest live
// beside the game on GitHub Pages, never inside it. The single file opened
// from disk or a viewer app never registers anything and requests nothing.

/** Register the worker only on the hosted copy, which is always HTTPS. */
export function shouldRegisterWorker(protocol: string): boolean {
  return protocol === 'https:';
}

export function registerHostedWorker(): void {
  if (!shouldRegisterWorker(window.location.protocol) || !('serviceWorker' in navigator)) return;
  // A failed registration only means no offline copy this time; the game
  // itself is already running.
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

/**
 * Hand the exported Save File to the parent. On a touch device that can
 * share files (iPhone, iPad), the share sheet offers "Save to Files";
 * elsewhere the browser downloads it, as it always has.
 */
export function deliverSaveFile(text: string, name: string): void {
  const file = new File([text], name, { type: 'application/json' });
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch((error: unknown) => {
      // The parent closed the sheet: nothing to do. Anything else: download.
      if (!(error instanceof DOMException && error.name === 'AbortError')) download(file);
    });
    return;
  }
  download(file);
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  // Revoking immediately can cut the download short on slow devices.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
