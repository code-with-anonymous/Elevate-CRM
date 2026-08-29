// ─────────────────────────────────────────────────────────────────────────────
// e2e/global-teardown.ts — stop everything global-setup started.
// ─────────────────────────────────────────────────────────────────────────────
import { globalTeardownInner } from './global-setup';

export default async function globalTeardown() {
  await globalTeardownInner();
}
