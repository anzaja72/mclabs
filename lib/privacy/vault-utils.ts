/**
 * LEGAL-IA — Vault utility functions (pure, no Node APIs).
 *
 * Extracted from src/main/privacy/vault.ts so the renderer can import
 * the pure `getOrCreate` helper without pulling in `node:fs` /
 * `better-sqlite3` through the SQLite-backed vault factory.
 */

import type { SurrogateKind } from './surrogates'
import type { PrivacyVault } from './vault-types'

/**
 * Resolves or creates a surrogate for the given PII token.
 *
 * Pure function — uses the vault's storage interface for persistence but
 * doesn't touch any Node APIs. Safe to import from the renderer.
 */
export function getOrCreate(
  vault: PrivacyVault,
  originalHash: string,
  original: string,
  kind: SurrogateKind,
  generate: () => string,
): string {
  const existing = vault.storage.getSurrogate(vault.engagementId, originalHash)
  const surrogate = existing ?? generate()

  if (!existing) {
    vault.storage.getOrCreate(vault.engagementId, originalHash, original, surrogate, kind)
  }

  // Populate maps lazily for restore. Also on the `existing` path: a mapping
  // persisted in a previous run isn't in the in-memory maps yet, and restore
  // only consults the maps — skipping this leaves the surrogate unrestored
  // in responses.
  let fwd = vault.forwardMap
  let rev = vault.reverseMap

  if (!fwd || !rev) {
    fwd = new Map()
    rev = new Map()
    vault.forwardMap = fwd
    vault.reverseMap = rev
  }

  fwd.set(surrogate, original)
  rev.set(surrogate, originalHash)

  return surrogate
}
