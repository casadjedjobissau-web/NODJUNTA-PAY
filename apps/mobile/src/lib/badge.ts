export function badgeText(count: number): string | undefined {
  if (!Number.isFinite(count) || count <= 0) {
    return undefined;
  }
  return count > 99 ? "99+" : String(Math.floor(count));
}
