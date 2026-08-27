/** Hasil operasi service: sukses dengan data, atau gagal dengan pesan Indonesia. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: string, code?: string): Result<T> {
  return { ok: false, error, code };
}
