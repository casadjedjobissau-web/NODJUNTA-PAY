export function encodePart(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

export function makeJwt(claims: Record<string, unknown>): string {
  const header = encodePart(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodePart(JSON.stringify(claims));
  return `${header}.${payload}.assinatura-de-teste`;
}
