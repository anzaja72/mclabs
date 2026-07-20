/**
 * Privacy Shield — vault en memoria (serverless).
 *
 * Adaptado de LEGAL-IA (que usa SQLite): en MC Labs el ciclo
 * anonimizar → IA → restaurar ocurre dentro de UNA sola petición, así
 * que un mapa en memoria por request es suficiente y no persiste PII.
 */
import type { SurrogateKind } from './surrogates'
import type { PrivacyVault, VaultStorage, VaultStats } from './vault-types'

export function createInMemoryVault(engagementId: string): PrivacyVault {
    const byHash = new Map<string, { original: string; surrogate: string; kind: SurrogateKind; at: number }>()
    const bySurrogate = new Map<string, string>()

    const storage: VaultStorage = {
        getOrCreate(eng, originalHash, original, surrogate, kind) {
            const key = `${eng}|${originalHash}`
            if (byHash.has(key)) return false
            byHash.set(key, { original, surrogate, kind, at: Date.now() })
            bySurrogate.set(`${eng}|${surrogate}`, original)
            return true
        },
        getSurrogate(eng, originalHash) {
            return byHash.get(`${eng}|${originalHash}`)?.surrogate ?? null
        },
        getOriginal(eng, surrogate) {
            return bySurrogate.get(`${eng}|${surrogate}`) ?? null
        },
        clearEngagement() { const n = byHash.size; byHash.clear(); bySurrogate.clear(); return n },
        clearAll() { const n = byHash.size; byHash.clear(); bySurrogate.clear(); return n },
        getStats(): VaultStats {
            return { engagement_id: engagementId, total_mappings: byHash.size, by_kind: {}, oldest_at: 0, newest_at: 0 }
        },
    }

    return { engagementId, forwardMap: new Map(), reverseMap: new Map(), storage, close: () => {} }
}
