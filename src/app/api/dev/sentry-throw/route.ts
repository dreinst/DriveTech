import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint DIAGNOSTIK sementara: melempar error sungguhan lalu mengirimnya ke
 * Sentry (dengan flush) untuk memverifikasi sourcemap — stack trace di Sentry
 * harus menunjuk ke berkas .ts asli. Terkunci lewat ?key=. Dihapus setelah uji.
 */
const TEST_KEY = "dt-sourcemap-check-7b2c";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("key") !== TEST_KEY) {
    return Response.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  const err = new Error("Drive Tech — uji sourcemap Sentry (disengaja)");
  const eventId = Sentry.captureException(err);
  await Sentry.flush(3000);

  return Response.json({ ok: true, eventId });
}
