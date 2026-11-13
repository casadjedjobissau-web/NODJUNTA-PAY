function cleanWord(word: string): string {
  return word.replace(/^[^A-Za-zÀ-ÿ0-9]+/, "");
}

function firstChar(word: string): string {
  return (Array.from(word)[0] ?? "?").toUpperCase();
}

export function initialsFromName(name: string | null | undefined): string {
  const words = (name ?? "")
    .split(/\s+/)
    .map(cleanWord)
    .filter((word) => word.length > 0);

  const first = words[0];
  if (first === undefined) {
    return "?";
  }
  if (words.length === 1) {
    return firstChar(first);
  }
  const last = words[words.length - 1] ?? first;
  return firstChar(first) + firstChar(last);
}
