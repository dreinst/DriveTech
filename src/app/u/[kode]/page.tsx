import { notFound, redirect } from "next/navigation";

import { cariIdListingDariKode } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ kode: string }> };

/** Link khusus pembeli yang dibagikan penjual lewat WA, menuju halaman unitnya. */
export default async function LinkPembeliPage({ params }: PageProps) {
  const { kode } = await params;
  const id = await cariIdListingDariKode(kode.toLowerCase());
  if (!id) notFound();
  redirect(`/katalog/${id}`);
}
