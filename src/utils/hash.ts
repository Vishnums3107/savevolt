/** Stable unsigned 32-bit (djb2-xor) hash of a string; the same input always gives the same number. */
export const hashString = (value: string): number => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  }
  return hash;
};
