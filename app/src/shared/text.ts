// Ordinal (case-fold then compare by code unit) rather than locale-aware collation, which
// orders numbers/punctuation/diacritics differently — used anywhere session/project ordering
// needs to be stable and independent of the user's locale.
export function ordinalIgnoreCaseCompare(a: string, b: string): number {
  const au = a.toUpperCase()
  const bu = b.toUpperCase()
  if (au < bu) return -1
  if (au > bu) return 1
  return 0
}
