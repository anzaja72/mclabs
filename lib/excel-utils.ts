/**
 * Utilidades de lectura de Excel para archivos REALES de software contable.
 *
 * Los exportes (Siigo, Alegra, World Office, etc.) casi siempre traen filas de
 * título antes de los encabezados: nombre de la empresa, NIT, período, normas.
 * Leer la fila 1 como encabezado hace que "no se lean los datos". Esta utilidad
 * localiza la fila de encabezados buscando palabras clave y arma los objetos
 * desde ahí.
 */
import * as XLSX from 'xlsx'

const normalizar = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Convierte una hoja en objetos {encabezado: valor} detectando la fila de
 * encabezados: la primera (dentro de `maxScan`) que contenga al menos
 * `minCoincidencias` de las palabras clave dadas (sin distinguir tildes ni
 * mayúsculas). Devuelve [] si no la encuentra.
 */
export function hojaAObjetos(
    ws: XLSX.WorkSheet,
    palabrasClave: string[],
    opts: { maxScan?: number; minCoincidencias?: number } = {}
): Record<string, unknown>[] {
    const { maxScan = 30, minCoincidencias = 2 } = opts
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false })
    if (!aoa.length) return []

    const claves = palabrasClave.map(normalizar)
    let headerIdx = -1
    for (let i = 0; i < Math.min(aoa.length, maxScan); i++) {
        const celdas = (aoa[i] || []).map(c => normalizar(String(c ?? '')))
        const hits = new Set<string>()
        for (const celda of celdas) {
            if (!celda) continue
            for (const k of claves) if (celda.includes(k)) hits.add(k)
        }
        if (hits.size >= minCoincidencias) { headerIdx = i; break }
    }
    if (headerIdx === -1) return []

    const headers = (aoa[headerIdx] || []).map((h, i) => String(h ?? '').trim() || `col_${i}`)
    const out: Record<string, unknown>[] = []
    for (let i = headerIdx + 1; i < aoa.length; i++) {
        const row = aoa[i] || []
        if (row.every(v => v === '' || v == null)) continue
        const obj: Record<string, unknown> = {}
        headers.forEach((h, j) => { obj[h] = row[j] ?? '' })
        out.push(obj)
    }
    return out
}

/** Palabras clave típicas de un auxiliar/libro contable colombiano. */
export const CLAVES_CONTABLE = [
    'identificacion', 'nit', 'tercero', 'debito', 'credito', 'debe', 'haber',
    'comprobante', 'fecha', 'cuenta contable',
]

/** Palabras clave del reporte de documentos electrónicos DIAN. */
export const CLAVES_DIAN = [
    'tipo de documento', 'cufe', 'folio', 'prefijo', 'nit emisor', 'nit receptor',
    'total', 'grupo', 'fecha emision',
]
