/**
 * Privacy Shield — MC Labs.
 *
 * Anonimiza datos personales (cédulas, NITs, nombres, emails, celulares,
 * direcciones, cuentas/tarjetas) ANTES de enviar cualquier texto a la IA
 * (OpenRouter), y los restaura en la respuesta. Ningún dato real del
 * contribuyente sale hacia el modelo.
 *
 * Portado de LEGAL-IA (motor determinístico + surrogates que preservan
 * formato). Vault en memoria por petición (sin persistencia de PII).
 */
import { randomUUID } from 'node:crypto'
import { Anonymizer } from './anonymizer'
import { createInMemoryVault } from './vault'
import type { PrivacyVault } from './vault-types'

export { Anonymizer } from './anonymizer'
export { createInMemoryVault } from './vault'
export type { PrivacyVault } from './vault-types'

// Modo contable por defecto: NO toca montos con separador de miles.
const engineFinancial = new Anonymizer({ allowJuridicalAllowlist: true, financialSafe: true })
const engineFull = new Anonymizer({ allowJuridicalAllowlist: true, financialSafe: false })

export interface Shielded {
    /** Texto con la PII reemplazada por surrogates. */
    text: string
    /** Vault para restaurar (mantener en memoria durante la petición). */
    vault: PrivacyVault
    /** Cantidad de datos sensibles reemplazados. */
    replacements: number
}

/**
 * Anonimiza el texto. Devuelve el texto seguro para la IA + el vault.
 * Por defecto usa el modo contable (financialSafe): protege cédulas, NITs,
 * nombres, emails, celulares y direcciones, pero NUNCA los montos.
 * Pasa `financialSafe: false` para documentos no contables (jurídicos).
 */
export function shield(
    text: string,
    opts: { engagementId?: string; financialSafe?: boolean } = {},
): Shielded {
    const vault = createInMemoryVault(opts.engagementId ?? randomUUID())
    const engine = opts.financialSafe === false ? engineFull : engineFinancial
    const res = engine.anonymize(text ?? '', vault)
    return { text: res.text, vault, replacements: res.replacements }
}

/** Restaura los datos reales en la respuesta de la IA. (No depende del modo.) */
export function unshield(text: string, vault: PrivacyVault): string {
    return engineFull.restore(text ?? '', vault).text
}
