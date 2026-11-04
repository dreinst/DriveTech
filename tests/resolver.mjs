// Resolver kecil untuk node --test: impor relatif tanpa ekstensi (gaya Next.js) dicoba sebagai .ts.
import { registerHooks } from "node:module";
registerHooks({
  resolve(spesifier, konteks, berikut) {
    try {
      return berikut(spesifier, konteks);
    } catch (galat) {
      if (spesifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(spesifier)) return berikut(`${spesifier}.ts`, konteks);
      throw galat;
    }
  },
});
