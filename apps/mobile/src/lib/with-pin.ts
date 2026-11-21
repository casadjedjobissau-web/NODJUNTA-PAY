export type WithPinResult<T> = { cancelled: true } | { cancelled: false; value: T };

// Pede o PIN e, se o utilizador o escrever, passa-o à ação. O PIN só existe dentro desta chamada:
// não é guardado nem devolvido. Um erro da ação sobe a quem chamou.
export async function withPin<T>(
  ask: () => Promise<string | null>,
  action: (pin: string) => Promise<T>,
): Promise<WithPinResult<T>> {
  const pin = await ask();
  if (pin === null) {
    return { cancelled: true };
  }
  return { cancelled: false, value: await action(pin) };
}
