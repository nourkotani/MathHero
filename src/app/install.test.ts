import { describe, expect, it } from 'vitest';
import { shouldRegisterWorker } from './install';

describe('the hosted-install worker rule (ADR 0006)', () => {
  it('registers only on the hosted copy, served over HTTPS', () => {
    expect(shouldRegisterWorker('https:')).toBe(true);
  });

  it('never registers for the single file or a local server', () => {
    expect(shouldRegisterWorker('file:')).toBe(false); // a double-click, a viewer app
    expect(shouldRegisterWorker('http:')).toBe(false); // the dev server
  });
});
