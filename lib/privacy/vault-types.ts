/**
 * LEGAL-IA — Privacy Vault types (browser-safe).
 *
 * Extracted from src/main/privacy/vault.ts so the renderer can import
 * the interfaces without pulling in `node:fs` / `better-sqlite3`.
 */

import type { SurrogateKind } from './surrogates'

export interface PrivacyVault {
  engagementId: string;
  forwardMap: Map<string, string> | null;
  reverseMap: Map<string, string> | null;
  storage: VaultStorage;
  close: () => void;
}

export interface VaultStorage {
  getOrCreate: (engagementId: string, originalHash: string, original: string, surrogate: string, kind: SurrogateKind) => boolean;
  getSurrogate: (engagementId: string, originalHash: string) => string | null;
  getOriginal: (engagementId: string, surrogate: string) => string | null;
  clearEngagement: (engagementId: string) => number;
  clearAll: () => number;
  getStats: () => VaultStats;
}

export interface VaultStats {
  engagement_id: string;
  total_mappings: number;
  by_kind: Record<string, number>;
  oldest_at: number;
  newest_at: number;
}
