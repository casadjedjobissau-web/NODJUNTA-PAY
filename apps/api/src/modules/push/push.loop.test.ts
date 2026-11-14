import { afterEach, describe, expect, it, vi } from "vitest";
import { createPushLoop } from "./push.loop.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("createPushLoop", () => {
  it("só corre depois de passar o intervalo", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const loop = createPushLoop(run, 1000, () => undefined);

    loop.start();
    await vi.advanceTimersByTimeAsync(999);
    expect(run).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);

    await loop.stop();
  });

  it("repete a cada intervalo", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const loop = createPushLoop(run, 1000, () => undefined);

    loop.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(3);

    await loop.stop();
  });

  it("um erro é comunicado e o ciclo continua", async () => {
    vi.useFakeTimers();
    const failure = new Error("falha");
    const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const onError = vi.fn();
    const loop = createPushLoop(run, 1000, onError);

    loop.start();
    await vi.advanceTimersByTimeAsync(2000);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(run).toHaveBeenCalledTimes(2);

    await loop.stop();
  });

  it("nunca corre duas rondas ao mesmo tempo", async () => {
    vi.useFakeTimers();
    const resolvers: Array<() => void> = [];
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const loop = createPushLoop(run, 1000, () => undefined);

    loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);

    resolvers[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);

    resolvers[1]?.();
    await loop.stop();
  });

  it("depois de parar, não corre mais", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const loop = createPushLoop(run, 1000, () => undefined);

    loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    await loop.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("parar espera pela ronda que está a correr", async () => {
    vi.useFakeTimers();
    const resolvers: Array<() => void> = [];
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const loop = createPushLoop(run, 1000, () => undefined);

    loop.start();
    await vi.advanceTimersByTimeAsync(1000);

    let done = false;
    const stopped = loop.stop().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);

    resolvers[0]?.();
    await stopped;
    expect(done).toBe(true);
  });

  it("chamar start duas vezes não duplica as rondas", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const loop = createPushLoop(run, 1000, () => undefined);

    loop.start();
    loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    await loop.stop();
  });

  it("pode arrancar de novo depois de parar", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const loop = createPushLoop(run, 1000, () => undefined);

    loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await loop.stop();

    loop.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    await loop.stop();
  });
});
