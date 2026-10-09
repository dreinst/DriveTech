// Pemeriksaan kesehatan container (HEALTHCHECK di Dockerfile): tidak menyentuh database.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
