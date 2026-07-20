/**
 * LEGAL-IA — Anonymizer (SRS §16.4.3).
 *
 * Cinco archivos en `src/privacy/`:
 *   - regex-anonymizer.ts   (este) — reglas determinísticas por prioridad
 *   - legal-patterns.ts     — disparadores contextuales jurídicos
 *   - surrogates.ts         — generadores que preservan formato
 *   - vault.ts              — SQLite local
 *   - gateway.ts            — listener loopback
 *
 * Orden de prioridad (NO cambiar sin ADR):
 *   1. tokens/API keys (AWS, GitHub, Slack, JWT, genéricas, URLs con credenciales)
 *   2. hashes (MD5/SHA-1/SHA-256/NTLM)
 *   3. financiero (IBAN, tarjetas, SWIFT, cuentas con prefijo)
 *   4. identidad colombiana
 *      (CC con/sin puntos, CE, NIT con DV, TI, pasaporte, celular, fijo,
 *       placas, tarjeta profesional, EPS, email)
 *   5. nombres y apellidos (lista cerrada + disparadores contextuales)
 *   6. direcciones colombianas (Cl/Cra/Tv/Dg/Mz/Apto, Barrio/Vereda)
 *   7. infraestructura (IPv4/IPv6, MAC, paths con PII)
 *
 * Allowlist jurídica (HU-802): las citas normativas y jurisprudenciales
 * NO se anonimizan aunque contengan números que colisionan.
 *
 * Determinismo: misma PII dentro del mismo engagement → mismo surrogate.
 * El vault garantiza esta invariante (getOrCreate).
 */

import { createHash } from 'node:crypto';

import { JURIDICAL_ALLOWLIST, LEGAL_TRIGGER_PATTERNS } from './legal-patterns';
import { generateSurrogate, type SurrogateKind } from './surrogates';
import type { PrivacyVault } from './vault-types';
import { getOrCreate } from './vault-utils';

export interface AnonymizationResult {
  text: string;
  replacements: number;
  mappings: Array<{ original_hash: string; surrogate: string; kind: SurrogateKind }>;
}

export interface RestorationResult {
  text: string;
  replacements: number;
}

export interface AnonymizerOptions {
  /** Override de la allowlist jurídica (desactivar para tests). */
  allowJuridicalAllowlist?: boolean;
  /** Patrones regex adicionales por despliegue/org. */
  customPatterns?: string[];
  /**
   * Modo contable: NO anonimiza números sueltos con separador de miles
   * (1.234.567) porque en documentos contables son MONTOS, no cédulas.
   * Las cédulas se siguen detectando cuando van precedidas de un
   * disparador ("cédula", "C.C.", "documento"). Evita corromper cifras.
   */
  financialSafe?: boolean;
}

/** Token PII detectado, pendiente de resolver contra el vault. */
interface DetectedMatch {
  kind: SurrogateKind;
  value: string;
  start: number;
  end: number;
}

interface Rule {
  kind: SurrogateKind;
  pattern: RegExp;
  /** Identificador opcional para activar/desactivar la regla por modo. */
  id?: string;
  /** Disparador contextual (ventana de N chars antes) para reducir FP. */
  contextTrigger?: RegExp;
  /**
   * Disparador contextual DESPUÉS del match (ventana de N chars).
   * En documentos jurídicos el identificador suele seguir al nombre:
   * "PEDRO SALAZAR MEJÍA, C.C. 12.345.678". Si se definen ambos
   * disparadores, basta con que uno coincida.
   */
  contextTriggerAfter?: RegExp;
}

/**
 * Reglas de detección. El orden importa — se itera y se descartan
 * solapamientos por el último match que cubre la posición.
 */
const RULES: Rule[] = [
  // 1. Tokens / API keys (antes que nada: si es un secret, sale primero).
  { kind: 'aws_key', pattern: /AKIA[0-9A-Z]{16}/g },
  { kind: 'github_token', pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { kind: 'slack_token', pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'jwt', pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  {
    kind: 'generic_api_key',
    pattern: /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key)[\s:="']+([A-Za-z0-9_-]{24,})\b/gi,
  },
  {
    kind: 'url_creds',
    pattern: /https?:\/\/[^\s/:@]+:[^\s/:@]+@[^\s/]+/g,
  },
  // 2. Hashes.
  { kind: 'md5', pattern: /\b[a-f0-9]{32}\b/gi },
  { kind: 'sha1', pattern: /\b[a-f0-9]{40}\b/gi },
  { kind: 'sha256', pattern: /\b[a-f0-9]{64}\b/gi },
  { kind: 'ntlm', pattern: /\b[a-f0-9]{32}:[a-f0-9]{32}\b/gi },
  // 3. Financiero.
  { kind: 'iban', pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
  { kind: 'credit_card', pattern: /\b(?:\d[ -]*?){13,19}\b/g },
  // SWIFT/BIC: exactamente 8 u 11 caracteres, empieza con 4 letras de banco.
  // Requiere "SWIFT" o "BIC" en el contexto previo: sin ese disparador,
  // cualquier palabra jurídica en mayúsculas de 8/11 letras (CONTRATO,
  // DEMANDADO…) sería un falso positivo.
  {
    kind: 'swift',
    pattern: /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
    contextTrigger: /\b(?:SWIFT|BIC)\b/i,
  },
  // 4. Identidad colombiana.
  {
    // Cédula colombiana: 6-10 dígitos con al menos UN separador (punto).
    // Sin separador, un número de 6-10 dígitos es ambiguo (monto, fecha, etc.).
    // Formatos comunes:
    //   12.345.678        (8 dígitos, 2 separadores) — más común
    //   1.234.567        (7 dígitos, 2 separadores)
    //   1.234.567.890    (10 dígitos, 3 separadores) — NIT/CC empresa
    //   1234567.890      (10 dígitos, 1 separador)
    kind: 'cc',
    pattern: /\b\d{1,3}(?:\.\d{3}){1,3}\b/g,
    id: 'cc_dotted_bare',
  },
  // Cédula CON puntos pero SOLO con disparador ("cédula 79.842.631"). Se usa
  // en modo contable, donde el número punteado suelto es un monto, no PII.
  {
    kind: 'cc',
    pattern: /\b\d{1,3}(?:\.\d{3}){1,3}\b/g,
    id: 'cc_dotted_ctx',
    contextTrigger: LEGAL_TRIGGER_PATTERNS.cedulaPrefijo,
  },
  // Cédula SIN separadores (6-10 dígitos): solo con disparador contextual
  // previo ("cédula", "C.C.", "documento", "identificado con"). Cubre el
  // lenguaje informal ("contactar a juan perez con cedula 722272096") sin
  // convertir cualquier número largo en falso positivo.
  {
    kind: 'cc',
    pattern: /\b\d{6,10}\b/g,
    contextTrigger: LEGAL_TRIGGER_PATTERNS.cedulaPrefijo,
  },
  { kind: 'ce', pattern: /\bCE\s*:?\s*\d{6,12}\b/gi },
  {
    kind: 'nit',
    pattern: /\b(?:NIT|nit)[\s.:]*\s*(\d{9}-?\d?)\b/g,
  },
  { kind: 'ti', pattern: /\bTI\s*:?\s*\d{10,11}\b/gi },
  { kind: 'passport', pattern: /\b[A-Z]{2}\d{7}\b/g },
  {
    kind: 'celular_co',
    pattern: /(?:\+?57\s?)?3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
  },
  // Fijo colombiano. El patrón anterior ([1-8]\d{2}\d{4} sin anclas)
  // marcaba cualquier cifra de 7 dígitos — incluidos montos en pesos.
  // Ahora: formato unificado de 10 dígitos (60X…) con/sin +57, o formato
  // legado SOLO con prefijo +57 explícito.
  {
    kind: 'fijo_co',
    pattern: /(?:\+?57[\s-]?)?60\d[\s-]?\d{3}[\s-]?\d{4}\b|\+?57[\s-]?[1-8][\s-]?\d{3}[\s-]?\d{4}\b/g,
  },
  // Fijo legado de 7 dígitos sin prefijo: solo con disparador contextual
  // ("Tel:", "teléfono", "fijo", "línea") para no capturar montos.
  {
    kind: 'fijo_co',
    pattern: /\b[1-8]\d{2}[\s-]?\d{4}\b/g,
    contextTrigger: /(?:tel[eé]fono|tel\.?|fijo|l[ií]nea)\s*:?\s*$/i,
  },
  // Placa: excluye siglas jurídicas frecuentes seguidas de número
  // ("LEY 100", "ART 123", "EXP 456"…) que comparten el formato AAA-999.
  {
    kind: 'placa_co',
    pattern: /\b(?!(?:LEY|ART|DEC|RES|EXP|RAD|NUM|CAP|INC|PAR|ORD|LIT|PAG)[\s-]?\d)[A-Z]{3}[\s-]?\d{3}\b/g,
  },
  { kind: 'tarjeta_profesional', pattern: /\b(?:T\.?P\.?|M\.?P\.?)\s*\d{2,7}\b/gi },
  { kind: 'eps_code', pattern: /\bEPS\s*:?\s*[A-Z]{2,5}\d{2,6}\b/gi },
  { kind: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // 5. Nombres y apellidos (con disparador contextual).
  {
    kind: 'nombre',
    pattern: /\b[A-Z][a-záéíóúñ]{2,}(?:\s+[A-Z][a-záéíóúñ]{2,}){1,4}\b/g,
    contextTrigger: LEGAL_TRIGGER_PATTERNS.nombre,
    contextTriggerAfter: LEGAL_TRIGGER_PATTERNS.nombreDespues,
  },
  // 5b. Nombres en MAYÚSCULAS — el formato estándar de partes y
  // comparecientes en documentos jurídicos colombianos ("PEDRO ANTONIO
  // SALAZAR MEJÍA, C.C. …"). Exige disparador antes (señor, demandante…)
  // o después (", C.C.", ", identificado con", ", mayor de edad") para no
  // capturar encabezados ("FUNDAMENTOS DE DERECHO") ni razones sociales.
  {
    kind: 'nombre',
    pattern: /\b[A-ZÁÉÍÓÚÑ]{3,}(?:\s+(?:DE(?:L|\s+LA|\s+LOS)?\s+)?[A-ZÁÉÍÓÚÑ]{3,}){1,4}\b/g,
    contextTrigger: LEGAL_TRIGGER_PATTERNS.nombreMayusculas,
    contextTriggerAfter: LEGAL_TRIGGER_PATTERNS.nombreDespues,
  },
  // 5c. Nombres en minúsculas — lenguaje informal ("contactar a juan
  // perez con cedula…"). SOLO con disparador fuerte inmediatamente antes;
  // los conectores (con/de/la…) cortan el nombre para no arrastrar el
  // resto de la frase.
  {
    kind: 'nombre',
    pattern:
      /\b(?!(?:con|del|de|la|el|los|las|en|por|para|que|y|al|su|una?)\b)[a-záéíóúñ]{2,}(?:\s+(?!(?:con|del|de|la|el|los|las|en|por|para|que|y|al|su|una?)\b)[a-záéíóúñ]{2,}){1,3}\b/g,
    contextTrigger: LEGAL_TRIGGER_PATTERNS.nombreInformal,
  },
  // 6. Direcciones colombianas.
  {
    kind: 'direccion',
    pattern: /\b(?:Cl|Cra|Cr|Tv|Tv\.?|Dg|Dg\.?|Mz|Apto|Barrio|Vereda|Corregimiento)[\s.]?\s*\d{1,4}[A-Z]?(?:[\s-]\d{1,3})?(?:\s+Sur|Norte|Este|Oeste)?\b/gi,
  },
  // 7. Infraestructura.
  { kind: 'ipv4', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { kind: 'ipv6', pattern: /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g },
  { kind: 'mac', pattern: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g },
];

export class Anonymizer {
  private readonly allowJuridicalAllowlist: boolean;
  private readonly customPatterns: RegExp[];
  private readonly rules: Rule[];

  constructor(opts: AnonymizerOptions = {}) {
    this.allowJuridicalAllowlist = opts.allowJuridicalAllowlist ?? true;
    this.customPatterns = (opts.customPatterns ?? []).map((p) => new RegExp(p, 'g'));
    // Modo contable: quita la regla de número punteado suelto (montos) y
    // conserva la versión con disparador de cédula. Modo normal: al revés.
    const drop = opts.financialSafe ? 'cc_dotted_bare' : 'cc_dotted_ctx';
    this.rules = RULES.filter((r) => r.id !== drop);
  }

  /**
   * Anonimiza un texto, resolviendo cada PII detectada a un surrogate
   * determinístico vía el vault. Cumple NF-P2 (0 red) y NF-P4 (tests).
   */
  anonymize(text: string, vault: PrivacyVault): AnonymizationResult {
    if (!text) {return { text, replacements: 0, mappings: [] };}
    const detected: DetectedMatch[] = [];

    for (const rule of this.rules) {
      rule.pattern.lastIndex = 0;
      let m: RegExpExecArray | null;

      while ((m = rule.pattern.exec(text)) !== null) {
        if (this.allowJuridicalAllowlist && isInJuridicalAllowlist(text, m.index, m[0])) {
          continue;
        }

        if (rule.contextTrigger || rule.contextTriggerAfter) {
          const beforeOk = rule.contextTrigger ? isContextual(text, m.index, rule.contextTrigger) : false;

          const afterOk = rule.contextTriggerAfter
            ? isContextualAfter(text, m.index + m[0].length, rule.contextTriggerAfter)
            : false;

          if (!beforeOk && !afterOk) {continue;}
        }

        detected.push({ kind: rule.kind, value: m[0], start: m.index, end: m.index + m[0].length });
      }
    }

    for (const pat of this.customPatterns) {
      pat.lastIndex = 0;
      let m: RegExpExecArray | null;

      while ((m = pat.exec(text)) !== null) {
        detected.push({ kind: 'generic_api_key', value: m[0], start: m.index, end: m.index + m[0].length });
      }
    }

    if (detected.length === 0) {return { text, replacements: 0, mappings: [] };}

    // Resolver solapamientos: gana el match más largo; en empate, el primero.
    detected.sort((a, b) => a.start - b.start || b.end - a.end);
    const final: DetectedMatch[] = [];
    let cursor = 0;

    for (const d of detected) {
      if (d.start < cursor) {continue;}
      final.push(d);
      cursor = d.end;
    }

    let out = '';
    let pos = 0;
    const mappings: AnonymizationResult['mappings'] = [];

    for (const d of final) {
      out += text.slice(pos, d.start);
      const hash = hashOriginal(d.value, vault.engagementId);
      const surrogate = getOrCreate(vault, hash, d.value, d.kind, () => generateSurrogate(d.kind, hash));
      out += surrogate;
      mappings.push({ original_hash: hash, surrogate, kind: d.kind });
      pos = d.end;
    }

    out += text.slice(pos);

    return { text: out, replacements: final.length, mappings };
  }

  /**
   * Restaura surrogates a sus originales. Se llama en streaming
   * sobre cada chunk entrante; el gateway mantiene un buffer
   * igual a la longitud del surrogate más largo para no partir
   * surrogates entre chunks.
   *
   * Estrategia: iterar sobre los surrogates conocidos del engagement
   * y reemplazar cada uno por su original. O(n×m) en el peor caso,
   * pero n es chico (decenas de surrogates por expediente) y m es
   * el tamaño del chunk.
   */
  restore(text: string, vault: PrivacyVault): RestorationResult {
    if (!text) {return { text, replacements: 0 };}

    if (!vault.forwardMap || vault.forwardMap.size === 0) {
      return { text, replacements: 0 };
    }

    // Ordenar surrogates por longitud descendente para evitar
    // reemplazos parciales (CC corto dentro de CC largo).
    const surrogates = [...vault.forwardMap.keys()].sort((a, b) => b.length - a.length);
    let out = text;
    let replacements = 0;

    for (const surrogate of surrogates) {
      const original = vault.forwardMap.get(surrogate);

      if (original === undefined) {continue;}
      // Escapar regex specials en el surrogate.
      const escaped = surrogate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Word boundary para no matchear dentro de palabras más largas.
      // Pero los surrogates pueden tener espacios (direcciones), así que
      // usamos un check más laxo: si la posición del match está rodeada
      // por alphanumeric, lo saltamos.
      const re = new RegExp(escaped, 'g');
      out = out.replace(re, (match, offset) => {
        const before = offset > 0 ? out[offset - 1] ?? '' : '';
        const after = offset + match.length < out.length ? out[offset + match.length] ?? '' : '';

        // Si ambos lados son alfanuméricos, probablemente el surrogate es
        // substring de otra cosa — saltamos.
        if (/[A-Za-zÀ-ÿ0-9]/.test(before) || /[A-Za-zÀ-ÿ0-9]/.test(after)) {
          return match;
        }

        replacements++;

        return original;
      });
    }

    return { text: out, replacements };
  }
}

function hashOriginal(value: string, engagementId: string): string {
  return createHash('sha256').update(`${engagementId} ${value}`).digest('hex');
}

function isContextual(text: string, idx: number, trigger: RegExp): boolean {
  const window = text.slice(Math.max(0, idx - 40), idx);
  trigger.lastIndex = 0;

  return trigger.test(window);
}

function isContextualAfter(text: string, end: number, trigger: RegExp): boolean {
  const window = text.slice(end, Math.min(text.length, end + 40));
  trigger.lastIndex = 0;

  return trigger.test(window);
}

function isInJuridicalAllowlist(text: string, idx: number, value: string): boolean {
  // Coincide si el match está ADYACENTE a un patrón de cita normativa
  // o jurisprudencial, en la misma oración (±30 chars, sin cruzar
  // saltos de párrafo).
  //
  // Esto evita que una cita en un párrafo aparte "proteja" PII que
  // no le pertenece. Ejemplo del bug que arreglamos: "Ley 1581 de 2012"
  // en FUNDAMENTOS no debe proteger un email en NOTIFICACIONES
  // (400 chars de distancia, párrafo diferente).
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + value.length + 30);
  // Si hay un salto de párrafo entre la cita y el match, no protegemos.
  const between = text.slice(start, end);

  if (/\n\s*\n/.test(between)) {return false;}

  for (const pat of JURIDICAL_ALLOWLIST) {
    pat.lastIndex = 0;

    if (pat.test(between)) {return true;}
  }

  return false;
}
