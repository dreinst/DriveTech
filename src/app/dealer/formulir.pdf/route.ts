import { buatPdfIsian } from "@/lib/pdf-formulir-dealer";

export const runtime = "nodejs";

/** GET /dealer/formulir.pdf: formulir kosong yang kolomnya bisa diketik di aplikasi PDF. */
export async function GET(): Promise<Response> {
  const pdf = await buatPdfIsian();
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Formulir Dealer DriveTech.pdf"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
