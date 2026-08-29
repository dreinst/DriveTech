import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Endpoint DIAGNOSTIK sementara — dihapus setelah verifikasi. Terkunci ?key=. */
const TEST_KEY = "dt-sourcemap-check-7b2c";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("key") !== TEST_KEY) {
    return Response.json({ error: "Tidak ditemukan." }, { status: 404 });
  }

  const client = Sentry.getClient();
  const clientDsn = client?.getOptions()?.dsn ?? null;

  const eventId = Sentry.captureException(
    new Error("Drive Tech — uji sourcemap Sentry (disengaja)"),
  );
  const flushed = await Sentry.flush(4000);

  return Response.json({
    hasClient: Boolean(client),
    clientDsn,
    envSentryDsn: Boolean(process.env.SENTRY_DSN),
    envNextRuntime: process.env.NEXT_RUNTIME ?? null,
    eventId,
    flushed,
  });
}
