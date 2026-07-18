/**
 * LEGAL-IA — Surrogates (SRS §16.4.3).
 *
 * Generadores que preservan formato y validez técnica:
 *   - NIT con dígito verificador válido
 *   - celular colombiano +57 3XX
 *   - email en TLD `.test` (RFC 6761 — reservado para testing, nunca colisiona)
 *   - CC con/sin puntos
 *   - hash de 16 chars para nombres
 *
 * Determinismo: la misma entrada + el mismo engagement_id producen
 * el mismo surrogate. Se usa un PRNG sembrado con SHA-256.
 */

import { createHash } from 'node:crypto';

export type SurrogateKind =
  | 'cc'
  | 'ce'
  | 'nit'
  | 'ti'
  | 'passport'
  | 'celular_co'
  | 'fijo_co'
  | 'placa_co'
  | 'tarjeta_profesional'
  | 'eps_code'
  | 'email'
  | 'nombre'
  | 'direccion'
  | 'aws_key'
  | 'github_token'
  | 'slack_token'
  | 'jwt'
  | 'generic_api_key'
  | 'url_creds'
  | 'md5'
  | 'sha1'
  | 'sha256'
  | 'ntlm'
  | 'iban'
  | 'credit_card'
  | 'swift'
  | 'ipv4'
  | 'ipv6'
  | 'mac';

/** PRNG sembrado (mulberry32 con seed de 32 bits). */
function rngFromSeed(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromHash(hash: string): number {
  return parseInt(hash.slice(0, 8), 16) ^ 0x9e3779b9;
}

/** Dígito verificador NIT colombiano (DIAN). */
function nitDV(nineDigits: string): number {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = nineDigits.charCodeAt(i) - 48; // char '0' = 48
    sum += digit * weights[i]!;
  }
  const mod = sum % 11;
  return mod < 2 ? mod : 11 - mod;
}

function pick(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

const FIRST_NAMES = [
  'María', 'José', 'Juan', 'Ana', 'Carlos', 'Lucía', 'Pedro', 'Sofía', 'Luis', 'Diana',
  'Andrés', 'Paula', 'Jorge', 'Camila', 'Miguel', 'Laura', 'David', 'Valentina', 'Daniel', 'Carolina',
  'Ricardo', 'Adriana', 'Fernando', 'Patricia', 'Alejandro', 'Mónica', 'Santiago', 'Cristina', 'Sebastián', 'Isabel',
  'Camilo', 'Daniela', 'Felipe', 'Natalia', 'Tomás', 'Verónica', 'Manuel', 'Ángela', 'Joaquín', 'Beatriz',
];
const LAST_NAMES = [
  'García', 'Rodríguez', 'Martínez', 'López', 'Hernández', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres',
  'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Castro', 'Ortiz', 'Ruiz', 'Vargas',
  'Romero', 'Suárez', 'Mendoza', 'Jiménez', 'Ramos', 'Aguilar', 'Cortés', 'Delgado', 'Medina', 'Salazar',
];

const PROVIDERS_CO = ['claro', 'movistar', 'tigo', 'wom'];

export function generateSurrogate(kind: SurrogateKind, hash: string): string {
  const rand = rngFromSeed(seedFromHash(hash));

  switch (kind) {
    case 'cc': {
      const num = String(pick(rand, 10_000_000, 99_999_999));
      return formatCC(num);
    }
    case 'ce': {
      const num = String(pick(rand, 100_000, 9_999_999_999));
      return `CE ${num}`;
    }
    case 'nit': {
      const nine = String(pick(rand, 100_000_000, 999_999_999));
      return `NIT ${nine}-${nitDV(nine)}`;
    }
    case 'ti': {
      const num = String(pick(rand, 1_000_000_000, 9_999_999_999));
      return `TI ${num}`;
    }
    case 'passport': {
      const country = ['CO', 'AR', 'PE', 'BR', 'CL'][pick(rand, 0, 4)];
      return `${country}${pick(rand, 1_000_000, 9_999_999)}`;
    }
    case 'celular_co': {
      return `+57 3${pick(rand, 10, 99)} ${pick(rand, 100, 999)} ${pick(rand, 1000, 9999)}`;
    }
    case 'fijo_co': {
      return `+57 ${pick(rand, 1, 8)}${pick(rand, 10, 99)} ${pick(rand, 1000, 9999)}`;
    }
    case 'placa_co': {
      const letters = String.fromCharCode(65 + pick(rand, 0, 25)) + String.fromCharCode(65 + pick(rand, 0, 25)) + String.fromCharCode(65 + pick(rand, 0, 25));
      return `${letters}${pick(rand, 100, 999)}`;
    }
    case 'tarjeta_profesional': {
      return `T.P. ${pick(rand, 10_000, 99_999_99)}`;
    }
    case 'eps_code': {
      const eps = ['EPS001', 'EPS002', 'EPS005', 'EPS010', 'EPS013', 'EPS016', 'EPS017', 'EPS018'];
      return `EPS ${eps[pick(rand, 0, eps.length - 1)]!}`;
    }
    case 'email': {
      const fn = FIRST_NAMES[pick(rand, 0, FIRST_NAMES.length - 1)]!.toLowerCase().replace(/[áéíóú]/g, (m) =>
        ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }[m] ?? m),
      );
      const ln = LAST_NAMES[pick(rand, 0, LAST_NAMES.length - 1)]!.toLowerCase().replace(/[áéíóú]/g, (m) =>
        ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }[m] ?? m),
      );
      return `${fn}.${ln}${pick(rand, 1, 99)}@${fn}.test`;
    }
    case 'nombre': {
      return `${FIRST_NAMES[pick(rand, 0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[pick(rand, 0, LAST_NAMES.length - 1)]} ${LAST_NAMES[pick(rand, 0, LAST_NAMES.length - 1)]}`;
    }
    case 'direccion': {
      const prefixes = ['Cl', 'Cra', 'Tv', 'Dg'];
      const suffix = ['Sur', 'Norte', 'Este', 'Oeste'][pick(rand, 0, 3)];
      return `${prefixes[pick(rand, 0, 3)]} ${pick(rand, 1, 200)} #${pick(rand, 1, 200)}-${pick(rand, 1, 99)} ${suffix}`;
    }
    case 'aws_key':
      return `AKIA${randomAlphaNumeric(rand, 16).toUpperCase()}`;
    case 'github_token':
      return `ghp_${randomAlphaNumeric(rand, 36)}`;
    case 'slack_token':
      return `xoxb-${randomAlphaNumeric(rand, 20)}`;
    case 'jwt':
      return `eyJ${randomAlphaNumeric(rand, 20)}.eyJ${randomAlphaNumeric(rand, 20)}.${randomAlphaNumeric(rand, 30)}`;
    case 'generic_api_key':
      return `sk_test_${randomAlphaNumeric(rand, 32)}`;
    case 'url_creds':
      return `https://user:${randomAlphaNumeric(rand, 16)}@host.test`;
    case 'md5':
      return randomHex(rand, 32);
    case 'sha1':
      return randomHex(rand, 40);
    case 'sha256':
      return randomHex(rand, 64);
    case 'ntlm':
      return `${randomHex(rand, 32)}:${randomHex(rand, 32)}`;
    case 'iban':
      return `CO${pick(rand, 10, 99)}${randomAlphaNumeric(rand, 16).toUpperCase()}`;
    case 'credit_card':
      return Array.from({ length: 4 }, () => String(pick(rand, 1000, 9999))).join(' ');
    case 'swift':
      return `COLEG${randomAlphaNumeric(rand, 6).toUpperCase()}`;
    case 'ipv4':
      return `${pick(rand, 1, 223)}.${pick(rand, 0, 255)}.${pick(rand, 0, 255)}.${pick(rand, 1, 254)}`;
    case 'ipv6':
      return Array.from({ length: 8 }, () => randomHex(rand, 4)).join(':');
    case 'mac':
      return Array.from({ length: 6 }, () => randomHex(rand, 2)).join(':');
  }
}

function formatCC(digits: string): string {
  // Separadores de miles desde la derecha: 8 dígitos → XX.XXX.XXX,
  // 7 dígitos → X.XXX.XXX. (Antes las ramas estaban intercambiadas y
  // producían grupos de 4 dígitos, un formato de cédula inválido.)
  if (digits.length === 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length === 7) return `${digits.slice(0, 1)}.${digits.slice(1, 4)}.${digits.slice(4)}`;
  return digits;
}

function randomAlphaNumeric(rand: () => number, len: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: len }, () => alphabet[pick(rand, 0, alphabet.length - 1)]).join('');
}

function randomHex(rand: () => number, len: number): string {
  return Array.from({ length: len }, () => Math.floor(rand() * 16).toString(16)).join('');
}

/** Hash estable para tests: SHA-256 → hex truncado. */
export function stableHash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
