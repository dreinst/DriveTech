import { EVENT_INFO } from "@/lib/domain/constants";
import { formatTanggal } from "@/lib/utils";

/** Footer informasi event: lokasi, tanggal, dan kontak panitia. */
export function SiteFooter() {
  const tanggal = `${formatTanggal(EVENT_INFO.startDate)} – ${formatTanggal(EVENT_INFO.endDate)}`;
  const tahun = new Date().getFullYear();

  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-slate-900">{EVENT_INFO.name}</p>
          <p className="text-sm leading-relaxed text-slate-500">{EVENT_INFO.description}</p>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lokasi & Tanggal</p>
          <p className="text-sm text-slate-600">{EVENT_INFO.location}</p>
          <p className="text-sm text-slate-600">{tanggal}</p>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kontak Panitia</p>
          <p className="text-sm text-slate-600">{EVENT_INFO.organizer}</p>
          <p className="text-sm text-slate-600">
            WhatsApp / Telepon:{" "}
            <a
              href={`tel:${EVENT_INFO.contact.replace(/[^0-9+]/g, "")}`}
              className="font-medium text-slate-900 underline underline-offset-2"
            >
              {EVENT_INFO.contact}
            </a>
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-slate-400">
          &copy; {tahun} {EVENT_INFO.organizer}. Sistem booking slot pameran.
        </p>
      </div>
    </footer>
  );
}
