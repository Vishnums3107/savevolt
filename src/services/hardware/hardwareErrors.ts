import { logError } from '../../utils/errorHandler';

/**
 * Why a smart-home request failed. Every service throws HardwareError so screens can show a
 * plain-language message and the right next step instead of "Network request failed".
 */
export type HardwareErrorKind =
  | 'unreachable'
  | 'timeout'
  | 'unauthorized'
  | 'bad-payload'
  | 'rejected'
  | 'invalid-input'
  | 'unsupported'
  | 'cleartext-blocked'
  | 'cancelled';

export type HardwareProviderName = 'home-assistant' | 'shelly' | 'simulator';

export interface HardwareErrorOptions {
  retryable?: boolean;
  status?: number;
  url?: string;
  /** Value of the WWW-Authenticate header on a 401, used for Shelly digest authentication. */
  authChallenge?: string;
  cause?: unknown;
}

const RETRYABLE_BY_DEFAULT: Record<HardwareErrorKind, boolean> = {
  unreachable: true,
  timeout: true,
  unauthorized: false,
  'bad-payload': false,
  rejected: false,
  'invalid-input': false,
  unsupported: false,
  'cleartext-blocked': true,
  cancelled: false,
};

export class HardwareError extends Error {
  kind: HardwareErrorKind;
  retryable: boolean;
  status?: number;
  url?: string;
  authChallenge?: string;
  cause?: unknown;

  constructor(kind: HardwareErrorKind, message: string, options: HardwareErrorOptions = {}) {
    super(message);
    Object.setPrototypeOf(this, HardwareError.prototype);
    this.name = 'HardwareError';
    this.kind = kind;
    this.retryable = options.retryable ?? RETRYABLE_BY_DEFAULT[kind];
    this.status = options.status;
    this.url = options.url;
    this.authChallenge = options.authChallenge;
    this.cause = options.cause;
  }
}

export const isHardwareError = (error: unknown): error is HardwareError =>
  error instanceof HardwareError || (typeof error === 'object' && error !== null && (error as HardwareError).name === 'HardwareError');

const PROVIDER_LABEL: Record<HardwareProviderName, string> = {
  'home-assistant': 'Home Assistant',
  shelly: 'The Shelly',
  simulator: 'The simulator',
};

const hostOf = (url?: string): string | null => {
  if (!url) return null;
  const match = url.match(/^[a-z]+:\/\/([^/?#]+)/i);
  return match ? match[1] : null;
};

/** Does this host look like a device on the user's own network (private IPv4, .local or a bare name)? */
export const isLanHost = (host: string): boolean => {
  const bare = host.replace(/:\d+$/, '').toLowerCase();
  if (/^10\.\d+\.\d+\.\d+$/.test(bare) || /^192\.168\.\d+\.\d+$/.test(bare) || /^169\.254\.\d+\.\d+$/.test(bare)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(bare)) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(bare) || bare === 'localhost') return true;
  if (/\.(local|lan|home|internal|localdomain)$/.test(bare) || bare.endsWith('.home.arpa')) return true;
  return !bare.includes('.') && !bare.includes(':');
};

// Android blocks plain http:// in release builds unless the app opts in. The first LAN http response
// proves it is allowed, so later failures are ordinary "device is off" problems.
let lanHttpWorked = false;
export const noteLanHttpResponse = (url: string) => {
  if (/^http:/i.test(url)) lanHttpWorked = true;
};
export const resetCleartextEvidence = () => { lanHttpWorked = false; };

const isReleaseBuild = (): boolean => (typeof __DEV__ === 'undefined' ? false : !__DEV__);

export interface FailureContext {
  url?: string;
  provider?: HardwareProviderName;
  /** Override for tests; defaults to the real build type. */
  release?: boolean;
}

/**
 * Turns anything a request threw into a HardwareError. In a release build, a failed http:// request to a
 * LAN address is reported as a likely cleartext block (when no http:// call has worked yet).
 */
export const classifyHardwareFailure = (error: unknown, context: FailureContext = {}): HardwareError => {
  if (isHardwareError(error)) return error;
  const name = (error as { name?: string } | null)?.name;
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (name === 'AbortError') return new HardwareError('cancelled', 'The request was cancelled.', { url: context.url, cause: error });
  const host = hostOf(context.url);
  const release = context.release ?? isReleaseBuild();
  const networkFailure = error instanceof TypeError || /network request failed|failed to connect|unable to resolve|timed out|econn|enotfound/i.test(raw);
  if (networkFailure && release && context.url && /^http:/i.test(context.url) && host && isLanHost(host) && !lanHttpWorked) {
    return new HardwareError(
      'cleartext-blocked',
      `Your phone could not reach http://${host}. Check that both are on the same Wi-Fi. If the problem persists, this build may block unencrypted local connections.`,
      { url: context.url, cause: error },
    );
  }
  if (networkFailure || !raw) {
    return new HardwareError('unreachable', raw || 'Network request failed', { url: context.url, cause: error });
  }
  return new HardwareError('unreachable', raw, { url: context.url, cause: error });
};

/** One or two plain sentences: what happened and what to do next. */
export const describeHardwareError = (error: unknown, provider: HardwareProviderName = 'home-assistant', context: { host?: string } = {}): string => {
  const failure = classifyHardwareFailure(error);
  const who = PROVIDER_LABEL[provider];
  const host = context.host ?? hostOf(failure.url) ?? undefined;
  switch (failure.kind) {
    case 'unreachable': {
      const target = provider === 'shelly' && host ? `${who} at ${host}` : who;
      const mdns = host && /\.local(:\d+)?$/i.test(host) ? ' If the address ends in .local, use the IP address instead: Android often cannot resolve .local names.' : '';
      return provider === 'shelly'
        ? `Could not reach ${target}. Check it is powered on and your phone is on the same Wi-Fi network.${mdns}`
        : `Could not reach ${target}. Check the address, that Home Assistant is running and that your phone can see it (same Wi-Fi, or your remote URL).${mdns}`;
    }
    case 'timeout':
      return `${who} took too long to answer. It may be busy or on weak Wi-Fi. Try again in a moment.`;
    case 'unauthorized':
      return provider === 'shelly'
        ? 'This Shelly is password protected and refused the login. Enter its username and password, or switch authentication off in the Shelly web page.'
        : 'Home Assistant rejected the access token. Create a new long-lived access token in your profile and paste it again.';
    case 'bad-payload':
      return `${who} replied with something SaveVolt could not read. Check the address really points to ${provider === 'shelly' ? 'a Shelly device' : 'Home Assistant'} and that it is up to date.`;
    case 'rejected':
      return `${who} refused the request${failure.status ? ` (HTTP ${failure.status})` : ''}. Check the device is online and try again.`;
    case 'cleartext-blocked':
    case 'invalid-input':
    case 'unsupported':
      return failure.message;
    case 'cancelled':
      return 'Cancelled.';
    default:
      return failure.message;
  }
};

/** Logs a failure once (without secrets) and returns the human message for the screen. */
export const reportHardwareError = (error: unknown, provider: HardwareProviderName, context: { host?: string; action?: string } = {}): string => {
  const failure = classifyHardwareFailure(error);
  if (failure.kind !== 'cancelled') {
    logError(failure, { provider, action: context.action, kind: failure.kind, status: failure.status });
  }
  return describeHardwareError(failure, provider, context);
};
