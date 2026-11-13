const CLOCK_SKEW_MS = 60_000;

export function isRecentSignIn(
  lastSignInAt: string | null | undefined,
  now: Date,
  maxMinutes = 10,
): boolean {
  if (!lastSignInAt) {
    return false;
  }
  const signedIn = Date.parse(lastSignInAt);
  if (Number.isNaN(signedIn)) {
    return false;
  }
  const age = now.getTime() - signedIn;
  return age >= -CLOCK_SKEW_MS && age <= maxMinutes * 60_000;
}
