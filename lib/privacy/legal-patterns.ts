/**
 * LEGAL-IA — Patrones contextuales jurídicos (SRS §16.4.3).
 *
 * Disparadores que, detectados en la ventana previa al match,
 * elevan la confianza de que el match es PII real (no falso positivo).
 *
 * Allowlist jurídica: patrones que, si aparecen en el contexto,
 * INDICAN que el match NO debe anonimizarse (es cita normativa).
 */

const N = String.raw`\s*`;

/** Disparadores para nombres propios (jurídicos): */
export const LEGAL_TRIGGER_PATTERNS = {
  nombre: new RegExp(
    `(?:identificado|identificada|señor|señora|Sr\\.|Sra\\.|Dr\\.|Dra\\.|ciudadano|ciudadana|demandante|demandado|denunciante|denunciado|procesado|investigado|representante legal de|abogado de|apoderado de|apoderada de|compareciente|declarante|querellante|accionante|accionado|sindicado|condenado|víctima|testigo|indiciado|imputado)${N}`,
    'i',
  ),
  direccion: new RegExp(
    `(?:reside en|domiciliado en|domiciliada en|con domicilio en|vecino de|residente en|ubicado en|ubicada en)${N}`,
    'i',
  ),
  email: new RegExp(`(?:correo|email|e-mail|correo electrónico)${N}(?:de:?|del?)${N}`, 'i'),
  /**
   * Disparadores para nombres en MAYÚSCULAS. Versión con límites de palabra
   * estrictos: "Señores" (encabezado a entidad) NO debe disparar, "señor" sí.
   */
  nombreMayusculas: new RegExp(
    `(?:señor(?:a)?\\b|Sr\\.|Sra\\.|Dr\\.|Dra\\.|demandante|demandado|denunciante|denunciado|` +
      `procesado|investigado|vendedor|comprador|arrendador|arrendatario|testigo|apoderad[oa]|` +
      `compareciente|declarante|querellante|accionante|accionado|víctima|imputado|entre)${N}:?${N}$`,
    'i',
  ),
  /**
   * Disparadores DESPUÉS del nombre: en escritos jurídicos el identificador
   * sigue inmediatamente al nombre. Anclado al inicio de la ventana para
   * exigir adyacencia.
   */
  nombreDespues: new RegExp(
    String.raw`^[\s,]*\(?\s*(?:mayor de edad|identificad[oa]\b|(?:con\s+)?c[eé]dula\b|C\.?\s?C\.?\s?(?:N[oº°]\.?\s*)?\d)`,
    'i',
  ),
  /**
   * Disparadores para nombres escritos en minúsculas (lenguaje informal:
   * "contactar a juan perez…"). Anclados al final de la ventana previa
   * para exigir adyacencia — sin esto, cualquier par de palabras en
   * minúsculas sería un falso positivo.
   */
  nombreInformal: new RegExp(
    String.raw`(?:contactar?\s+a|comun[ií]carse\s+con|comun[ií]cate\s+con|llamar\s+a|llama\s+a|escribir(?:le)?\s+a|notificar\s+a|citar\s+a|se[nñ]or(?:a)?|do[nñ]a?|cliente|a\s+nombre\s+de)\s*:?\s*$`,
    'i',
  ),
  /**
   * Disparador para cédulas SIN separadores de miles (6-10 dígitos):
   * "cédula 722272096", "C.C. 79842631", "documento 1020304050",
   * "identificado con 79842631". Sin disparador, un número de 6-10
   * dígitos es ambiguo (monto, radicado, fecha) y no se toca.
   */
  cedulaPrefijo: new RegExp(
    String.raw`(?:c[eé]dula(?:\s+de\s+ciudadan[ií]a)?(?:\s+(?:no|n[uú]m(?:ero)?|nro)\.?)?|c\.?\s?c\.?|documento(?:\s+de\s+identidad)?|identificad[oa]\s+con|identificaci[oó]n)\s*[.:#°]?\s*$`,
    'i',
  ),
} as const;

/** Citas jurídicas que NO se anonimizan (HU-802). */
export const JURIDICAL_ALLOWLIST: RegExp[] = [
  // Ley X de YYYY / Ley XXXX de YYYY / Ley X.YYY de YYYY
  new RegExp(String.raw`\bLey\s+\d{1,4}(?:\.\d{1,3})?\s+de\s+\d{4}\b`, 'gi'),
  // Decreto X de YYYY / Decreto XXXX de YYYY
  new RegExp(String.raw`\bDecreto\s+\d{1,4}(?:\.\d{1,3})?\s+de\s+\d{4}\b`, 'gi'),
  // Decreto Único Reglamentario 1074 de 2015
  new RegExp(String.raw`\bDecreto\s+\d{1,4}\s+de\s+\d{4}\b`, 'gi'),
  // Sentencia T-XXX/YY, C-XXX/YY, SU-XXX/YY, T-XXX de YYYY
  new RegExp(String.raw`\b(?:Sentencia\s+)?(?:[TCAHSU])-?\d{2,5}\s*(?:de\s+\d{4}|\/\d{2,4})\b`, 'gi'),
  // Art. X del E.T. / Art. YYY E.T. / artículos 383, 392 del E.T.
  // Usa [\s\S] para cruzar saltos de línea (los textos jurídicos pueden
  // estar envueltos entre `art. NN` y `E.T.` por word wrap).
  new RegExp(String.raw`\bart(?:[ií]culo[s]?|\.)?\s+\d{1,4}[\s\S]*?(?:del\s+)?E\.?T\.?`, 'gi'),
  // Art. 392 del Estatuto Tributario
  new RegExp(String.raw`\bart(?:[ií]culo[s]?|\.)?\s+\d{1,4}[\s\S]*?del\s+Estatuto\s+Tributario`, 'gi'),
  // Art. NNN de la Constitución Política (art. 86 C.P., art. 49 C.P., etc.)
  new RegExp(String.raw`\bart(?:[ií]culo[s]?|\.)?\s+\d{1,4}[\s\S]*?(?:de\s+la\s+)?C\.?P\.?`, 'gi'),
  // Art. NNN del Código Civil / Código Penal / etc.
  new RegExp(String.raw`\bart(?:[ií]culo[s]?|\.)?\s+\d{1,4}[\s\S]*?del\s+C[oó]digo\s+\w+`, 'gi'),
  // Código Civil / Código Penal / etc.
  new RegExp(String.raw`\bC[oó]digo\s+(?:Civil|Penal|Laboral|de\s+Comercio|de\s+Procedimiento\s+\w+|de\s+\w+)`, 'gi'),
  // Constitución Política de Colombia
  new RegExp(String.raw`\bConstituci[oó]n\s+Pol[ií]tica(?:\s+de\s+Colombia)?`, 'gi'),
  // Corte Constitucional / Corte Suprema
  new RegExp(String.raw`\bCorte\s+(?:Constitucional|Suprema\s+de\s+Justicia)`, 'gi'),
  // CSJ (Corte Suprema de Justicia) — abreviatura
  new RegExp(String.raw`\bCSJ\s+(?:Sala\s+\w+\s+)?(?:Civil|Penal|Laboral)`, 'gi'),
];
