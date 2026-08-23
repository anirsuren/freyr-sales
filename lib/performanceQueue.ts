/**
 * ONE DOOR FOR EVERY PERFORMANCE WRITE.
 *
 * The performance API serializes its writes through a promise queue because
 * the store is read-modify-write on one row: two writers in the same moment
 * both read the same "before" and the second erases the first, with a 200 and
 * a success toast on both screens.
 *
 * The queue used to live inside app/api/performance/route.ts — which meant it
 * only guarded writes that entered through that file. The opportunities route
 * ALSO writes performance state (marking a deal's goal Met logs the actual;
 * un-marking removes it), and it walked straight past the queue (found by the
 * Aug 23 audit). A rep saving a deal while anyone logged a result could erase
 * either write. Same queue, hung on globalThis so a dev hot reload cannot hand
 * two requests two separate "empty" queues, now importable by every route that
 * touches the row.
 */
declare global {
  // eslint-disable-next-line no-var
  var __FREYR_PERFORMANCE_WRITE_QUEUE__: Promise<void> | undefined;
}

export async function withPerformanceWrite<T>(fn: () => Promise<T>): Promise<T> {
  const previous =
    globalThis.__FREYR_PERFORMANCE_WRITE_QUEUE__ ?? Promise.resolve();
  let release: () => void = () => undefined;
  globalThis.__FREYR_PERFORMANCE_WRITE_QUEUE__ = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}
