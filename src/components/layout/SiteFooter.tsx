import Link from "next/link";
import { EVENT_INFO } from "@/lib/domain/constants";

const FOOTER_LINKS = [
  { href: "/#denah", label: "Denah" },
  { href: "/#cek-status", label: "Cek Status" },
  { href: "/admin", label: "Admin" },
] as const;

/**
 * Footer ekstra gelap ala referensi Stitch: wordmark uppercase, baris
 * penyelenggara, baris link, baris hak cipta. Format identitas dari pemilik:
 * "Drive Tech — D'Pro Event Organizer — Dreinst".
 */
export function SiteFooter() {
  // Model per tanggal: event berjalan terus tiap akhir pekan, jadi tahun hak cipta = tahun berjalan.
  const tahun = new Date().getFullYear();
  const telHref = `tel:${EVENT_INFO.contact.replace(/[^0-9+]/g, "")}`;

  return (
    <footer className="border-t border-line bg-[#050505]">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink">
              {EVENT_INFO.name}
            </p>
            <p className="mt-1.5 text-sm text-subtle">
              Diselenggarakan oleh D&rsquo;Pro Event Organizer &middot; Dikelola Dreinst
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-muted transition-colors duration-150 hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={telHref}
                className="text-muted transition-colors duration-150 hover:text-ink"
              >
                Kontak
              </a>
            </li>
          </ul>
        </div>
        <div className="mt-10 border-t border-line pt-6">
          <p className="text-xs text-subtle">
            &copy; {tahun} {EVENT_INFO.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
