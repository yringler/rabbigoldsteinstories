/**
 * localStorage that never throws (private windows, blocked storage, SSR) and namespaces keys per
 * site: createStore("kids").get("favourites", []) reads "goldstein:kids:favourites". Values are
 * JSON with a version so a site can migrate its own data.
 */
export interface Store {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

function backend(): globalThis.Storage | null {
  try {
    const s = globalThis.localStorage;
    const probe = "__goldstein_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function createStore(
  namespace: string,
  storage: globalThis.Storage | null = backend(),
): Store {
  const memory = new Map<string, string>();
  const full = (k: string) => `goldstein:${namespace}:${k}`;
  const read = (k: string) => {
    try {
      return storage ? storage.getItem(full(k)) : (memory.get(full(k)) ?? null);
    } catch {
      return memory.get(full(k)) ?? null;
    }
  };
  const write = (k: string, v: string | null) => {
    try {
      if (storage) {
        if (v === null) storage.removeItem(full(k));
        else storage.setItem(full(k), v);
        return;
      }
    } catch {
      /* quota or blocked: fall back to memory for this page */
    }
    if (v === null) memory.delete(full(k));
    else memory.set(full(k), v);
  };
  return {
    get<T>(key: string, fallback: T): T {
      const raw = read(key);
      if (raw === null) return fallback;
      try {
        return (JSON.parse(raw) as { v: T }).v;
      } catch {
        return fallback;
      }
    },
    set<T>(key: string, value: T) {
      write(key, JSON.stringify({ v: value }));
    },
    remove(key: string) {
      write(key, null);
    },
  };
}
