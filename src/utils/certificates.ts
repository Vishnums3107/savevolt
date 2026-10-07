import { AppSettings, SavingsCertificate, UsageRecord } from '../types';
import { addDayKey, isMeasured, normalizeRecords, recordSavings, round, toDayKey } from './analytics';
import { sha256 } from './sha256';

export const GENESIS_HASH = '0'.repeat(64);

/** The exact text that is hashed; changing any field changes the hash. */
const certificatePayload = (c: Omit<SavingsCertificate, 'hash'>) =>
  [c.id, c.issuedAt, c.periodStart, c.periodEnd, c.kWhSaved.toFixed(4), c.co2AvoidedKg.toFixed(4),
    c.moneySaved.toFixed(4), c.daysCounted, c.previousHash].join('|');

export const hashCertificate = (c: Omit<SavingsCertificate, 'hash'>) => sha256(certificatePayload(c));

export interface CertificateDraft {
  periodStart: string;
  periodEnd: string;
  kWhSaved: number;
  co2AvoidedKg: number;
  moneySaved: number;
  daysCounted: number;
}

/**
 * Savings not yet certified: measured days after the last certificate, up to yesterday (today
 * may still change). Returns null when there is nothing positive to certify.
 */
export const draftCertificate = (
  records: UsageRecord[],
  certificates: SavingsCertificate[],
  settings: Pick<AppSettings, 'electricityRate' | 'co2Factor'>,
  todayKey: string,
): CertificateDraft | null => {
  const last = [...certificates].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)).pop();
  const after = last ? last.periodEnd : '0000-00-00';
  const yesterday = addDayKey(todayKey, -1);
  const days = normalizeRecords(records).filter((r) => {
    const key = toDayKey(r.date);
    return isMeasured(r) && key > after && key <= yesterday;
  });
  if (days.length === 0) return null;
  const net = days.reduce((sum, r) => sum + recordSavings(r), 0);
  if (net <= 0.01) return null;
  return {
    periodStart: toDayKey(days[0].date),
    periodEnd: toDayKey(days[days.length - 1].date),
    kWhSaved: round(net, 4),
    co2AvoidedKg: round(net * settings.co2Factor, 4),
    moneySaved: round(net * settings.electricityRate, 4),
    daysCounted: days.length,
  };
};

export const issueCertificate = (
  draft: CertificateDraft, certificates: SavingsCertificate[], now: Date,
): SavingsCertificate => {
  const previous = certificates[certificates.length - 1];
  const base: Omit<SavingsCertificate, 'hash'> = {
    id: `cert-${now.getTime().toString(36)}`,
    issuedAt: now.toISOString(),
    ...draft,
    previousHash: previous ? previous.hash : GENESIS_HASH,
  };
  return { ...base, hash: hashCertificate(base) };
};

export interface ChainCheck {
  valid: boolean;
  /** Index of the first certificate that fails, or -1. */
  brokenAt: number;
}

/** Recomputes every hash and link; any edited or removed certificate breaks the chain. */
export const verifyCertificateChain = (certificates: SavingsCertificate[]): ChainCheck => {
  let previous = GENESIS_HASH;
  for (let i = 0; i < certificates.length; i += 1) {
    const { hash, ...rest } = certificates[i];
    if (rest.previousHash !== previous || hashCertificate(rest) !== hash) return { valid: false, brokenAt: i };
    previous = hash;
  }
  return { valid: true, brokenAt: -1 };
};
