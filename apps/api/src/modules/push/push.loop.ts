export interface PushLoop {
  start(): void;
  stop(): Promise<void>;
}

export function createPushLoop(
  run: () => Promise<unknown>,
  intervalMs: number,
  onError: (error: unknown) => void,
): PushLoop {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: Promise<void> | null = null;
  let stopped = true;

  function schedule(): void {
    if (stopped) {
      return;
    }
    timer = setTimeout(() => void tick(), intervalMs);
  }

  async function tick(): Promise<void> {
    timer = null;
    if (stopped) {
      return;
    }
    current = (async () => {
      try {
        await run();
      } catch (error) {
        onError(error);
      }
    })();
    await current;
    current = null;
    schedule();
  }

  return {
    start() {
      if (!stopped) {
        return;
      }
      stopped = false;
      schedule();
    },
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (current) {
        await current;
      }
    },
  };
}
