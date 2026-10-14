/**
 * Ikon DT dalam lingkaran (logo pilihan Om Don, 14 Okt 2026), viewBox 0 0 200 200,
 * sebagai potongan SVG siap tempel di tengah kode QR bermerek (lib/qr-brand.ts).
 * Bentuknya sama dengan LogoIkon di components/brand/LogoDriveTech.tsx.
 */

/** Ikon DT tidak butuh mask; dibiarkan kosong supaya qr-brand.ts tetap sama. */
export const QR_LOGO_DEFS = "";

/** Isi emblem (lingkaran + huruf DT) dalam koordinat 0..200. */
export const QR_LOGO_PATHS = `<circle cx="100" cy="100" r="94" fill="none" stroke="#f04f23" stroke-width="12"/>
      <g transform="translate(16 40.50) scale(1.728)" fill="#f04f23">
        <path fill-rule="evenodd" d="M49.75,3.97H11.74l-3.14,11.35h4.65l-5.5,19.84H3.11l-3.11,11.28h41.99l9.46-6.85,6.71-27.41-8.41-8.21ZM30.51,35.16h-10.98l7.23-5.22,4.04-14.62h5.15l-5.44,19.84Z"/>
        <path d="M48.18,17.42l-3.52,12.68h21.11l-14.26,9.59-6.95,25.2h30.05l9.59-34.79h9.57l3.46-12.68h-49.04Z"/>
      </g>`;

/** Ukuran kanvas emblem (sisi, satuan koordinat). */
export const QR_LOGO_SIZE = 200;
