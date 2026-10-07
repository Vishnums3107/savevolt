/* eslint-disable no-bitwise */
/**
 * Share codes let people exchange SaveVolt data without a server: a friend's score for the
 * leaderboard, an invite to a shared goal, or a teammate's contribution to it.
 *
 * Format:  SV1<kind>.<base64url JSON>.<8-hex checksum>
 *   kind:  S = score card, G = goal invite, C = goal contribution
 * The checksum catches codes that were cut short or mistyped when pasted.
 */
import { hashString } from './hash';

export type ShareKind = 'S' | 'G' | 'C';

export interface ScorePayload {
  v: 1;
  id: string;
  name: string;
  points: number;
  level: number;
  weekSavedKwh: number;
  savingsPercent: number;
  streak: number;
  badges: number;
  at: string;
}

export interface GoalInvitePayload {
  v: 1;
  id: string;
  title: string;
  description: string;
  targetEnergy: number;
  deadline: string;
  createdBy: string;
  createdAt: string;
}

export interface ContributionPayload {
  v: 1;
  goalId: string;
  participant: string;
  kWh: number;
  at: string;
}

type PayloadFor<K extends ShareKind> = K extends 'S' ? ScorePayload : K extends 'G' ? GoalInvitePayload : ContributionPayload;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const utf8Encode = (text: string): number[] => {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
  }
  return bytes;
};

const utf8Decode = (bytes: number[]): string => {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let code: number;
    if (b < 0x80) { code = b; i += 1; } else if (b < 0xe0) {
      code = ((b & 31) << 6) | (bytes[i + 1] & 63); i += 2;
    } else if (b < 0xf0) {
      code = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63); i += 3;
    } else {
      code = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63); i += 4;
    }
    out += String.fromCodePoint(code);
  }
  return out;
};

export const base64UrlEncode = (text: string): string => {
  const bytes = utf8Encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
};

export const base64UrlDecode = (encoded: string): string => {
  const bytes: number[] = [];
  let buffer = 0; let bits = 0;
  for (const char of encoded) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error('bad character');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return utf8Decode(bytes);
};

const checksum = (kind: ShareKind, body: string) => hashString(`SV1${kind}.${body}`).toString(16).padStart(8, '0');

export const encodeShareCode = <K extends ShareKind>(kind: K, payload: PayloadFor<K>): string => {
  const body = base64UrlEncode(JSON.stringify(payload));
  return `SV1${kind}.${body}.${checksum(kind, body)}`;
};

const CODE_PATTERN = /SV1([SGC])\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})/;

/** Finds a share code anywhere in pasted text (people often paste the whole message). */
export const findShareCode = (text: string): string | null => text.match(CODE_PATTERN)?.[0] ?? null;

const isText = (value: unknown, max = 200) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isNumber = (value: unknown, max = 1e7) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const isDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isId = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);

const VALIDATORS: Record<ShareKind, (p: Record<string, unknown>) => boolean> = {
  S: (p) => isId(p.id) && isText(p.name, 40) && isNumber(p.points) && isNumber(p.level, 100) &&
    isNumber(p.weekSavedKwh, 1e5) && typeof p.savingsPercent === 'number' && Number.isFinite(p.savingsPercent) &&
    Math.abs(p.savingsPercent as number) <= 100 && isNumber(p.streak, 1e5) && isNumber(p.badges, 1000) && isDate(p.at),
  G: (p) => isId(p.id) && isText(p.title, 80) && typeof p.description === 'string' && p.description.length <= 500 &&
    isNumber(p.targetEnergy, 1e6) && (p.targetEnergy as number) > 0 && isDate(p.deadline) && isText(p.createdBy, 40) &&
    isDate(p.createdAt),
  C: (p) => isId(p.goalId) && isText(p.participant, 40) && isNumber(p.kWh, 1e6) && isDate(p.at),
};

const KIND_NAMES: Record<ShareKind, string> = { S: 'score card', G: 'goal invite', C: 'contribution' };

export interface DecodedShare<K extends ShareKind = ShareKind> {
  kind: K;
  payload: PayloadFor<K>;
}

/**
 * Decodes and validates a share code. Pass `expected` to accept only one kind; errors are
 * written for people (they are shown as-is).
 */
export const decodeShareCode = <K extends ShareKind>(text: string, expected?: K): DecodedShare<K> => {
  const code = findShareCode(text.trim());
  if (!code) throw new Error('That does not look like a SaveVolt code. Codes start with "SV1".');
  const [, kind, body, sum] = code.match(CODE_PATTERN)!;
  if (checksum(kind as ShareKind, body) !== sum) {
    throw new Error('This code is incomplete or was changed. Ask for it to be shared again.');
  }
  if (expected && kind !== expected) {
    throw new Error(`This is a ${KIND_NAMES[kind as ShareKind]}, not a ${KIND_NAMES[expected]}.`);
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecode(body));
  } catch {
    throw new Error('This code could not be read. Ask for it to be shared again.');
  }
  if (!payload || typeof payload !== 'object' || payload.v !== 1 || !VALIDATORS[kind as ShareKind](payload)) {
    throw new Error('This code was made by a different version of SaveVolt or contains invalid data.');
  }
  return { kind: kind as K, payload: payload as unknown as PayloadFor<K> };
};
