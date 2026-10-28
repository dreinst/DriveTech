import type { Metadata } from "next";

import { JALAN_SEHAT } from "@/lib/domain/jalan-sehat";
import { UndiTiket } from "./UndiTiket";

export const metadata: Metadata = {
  title: `Undian Doorprize ${JALAN_SEHAT.judul}`,
  robots: { index: false, follow: false },
};

/** Halaman undian untuk MC/panitia: tanpa login, semua data hanya di perangkat ini. */
export default function UndiPage() {
  return <UndiTiket />;
}
