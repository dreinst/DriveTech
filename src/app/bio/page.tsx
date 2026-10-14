import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { EVENT_INFO, waHref } from "@/lib/domain/constants";
import { LogoLengkap } from "@/components/brand/LogoDriveTech";

export const metadata: Metadata = {
  title: "Tautan",
  description: `Tautan penting ${EVENT_INFO.name} — booking slot, denah, dan hotline panitia.`,
  robots: { index: false, follow: false },
};

/** Nomor hotline WhatsApp yang dipasang di bio Instagram @drivetechmalang. */
const HOTLINE = EVENT_INFO.contacts[0];

const LINKS = [
  { href: "/", label: "Pesan Slot" },
  { href: "/denah", label: "Lihat Denah" },
  { href: "/katalog", label: "Katalog Kendaraan" },
  { href: "https://instagram.com/drivetechmalang", label: "Instagram @drivetechmalang" },
] as const;

/**
 * Halaman link-in-bio untuk Instagram @drivetechmalang. CTA utama: WhatsApp
 * hotline panitia (Andrew); tautan lain mengarah ke bagian-bagian situs.
 */
export default function BioPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md flex-col items-center gap-8 px-4 py-16 text-center">
      <div>
        <h1><LogoLengkap tagline className="justify-center text-[1.6rem]" /></h1>
        <p className="mt-1 text-sm text-muted">{EVENT_INFO.location}</p>
      </div>

      <a href={waHref(HOTLINE.phone)} className={buttonClass("primary", "md") + " w-full"}>
        Chat WhatsApp Hotline
      </a>

      <div className="flex w-full flex-col gap-3">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={buttonClass("secondary", "md") + " w-full"}>
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
