/*
 * Logo tulisan DriveTech dari aset resmi (folder "DRIVETECH - DESIGN", Logo Asset/SVG).
 * Sesuai arahan Om Don 14 Okt 2026: tulisan merek memakai logo dan font aslinya, bukan font situs.
 * Pilihan Om Don 14 Okt 21.25: ikon DT dalam lingkaran + DRIVE / EAST JAVA TECH bertumpuk
 * + "AUTO & TECHNO SHOW * 2026". Ikon DT disusun dari huruf DT logo "OPT 1" (angka 2025 dibuang)
 * karena folder aset belum punya versi lingkarannya. Warna mengikuti currentColor.
 */

type Props = { className?: string; title?: string };

/** Satu baris: DRIVETECH + EAST JAVA (logo secondary). */
export function LogoTulisan({ className, title = "DriveTech" }: Props) {
  return (
    <svg viewBox="0 0 268.97 20.52" fill="currentColor" role="img" aria-label={title} className={className}>
    <path d="M23.97,0H5.66l-1.51,5.47h2.24l-2.65,9.56H1.5l-1.5,5.43h20.23l4.56-3.3,3.23-13.21-4.05-3.96ZM14.7,15.03h-5.29l3.48-2.51,1.94-7.05h2.48l-2.62,9.56Z" />
    <path d="M54.71,3.91L50.71,0h-19.08l-1.51,5.48h15.72l-6.67,4.49.55-2h-10.3l-3.47,12.55h10.94l1.52-5.49h2.52l-1.53,5.49h10.71l2.31-8.33-4.32-1.58,5.3-1.93,1.31-4.77Z" />
    <path d="M68.09,0l-5.7,20.52h-10.23L57.83,0h10.26Z" />
    <path d="M70.32,0h10.73l-3.47,12.55h2.52l3.44-12.55h10.73l-3.47,12.55-10.85,7.97h-6.6l-6.51-7.97,3.47-12.55Z" />
    <path d="M114.76,12.54l1.24-4.57h-21.88l-3.47,12.55h21.9l1.5-5.49h-11.61l.67-2.49h11.65ZM96.33,0l-1.51,5.48h25.47L121.8,0h-25.48Z" />
    <path d="M119.78,0l-1.52,5.48h9.13l-6.17,4.15-3,10.89h12.99l4.15-15.04h4.14L140.97,0h-21.19Z" />
    <path d="M161.45,12.54l1.25-4.57h-21.73v-.53l-3.62,13.08h21.9l1.5-5.49h-11.61l.67-2.49h11.64ZM143.03,0l-1.51,5.48h21.88L164.93,0h-21.9Z" />
    <path d="M161.31,20.52l5.67-20.52h23.48l-2.45,8.88h-10.73l.95-3.4h-2.52l-2.62,9.56h2.49l1.02-3.64h10.7l-1.58,5.8-4.57,3.31h-19.85Z" />
    <path d="M192.52,0h10.73l-2.23,7.97h2.52l2.2-7.97h10.73l-5.67,20.52h-10.73l2.2-7.97h-2.49l-2.2,7.97h-10.73l5.67-20.52Z" />
    <path d="M219.19,9.33l2.54-9.17h9.79l-.68,2.45h-5.2l-.3,1.11h5.19l-.56,2.04h-5.2l-.3,1.11h5.19l-.67,2.45h-9.79Z" />
    <path d="M234.6.15l-2.77,2.16-1.94,7.01h4.8l.67-2.45h1.13l-.69,2.45h4.8l2.54-9.17h-8.54ZM237.48,3.23c-.07.24-.13.48-.19.71-.07.26-.15.53-.22.8h-1.11l.59-2.14h1.11c-.05.18-.11.39-.18.63Z" />
    <polygon points="234.6 .15 231.83 2.32 232.43 .15 234.6 .15" />
    <path d="M247.97,2.6l-.31,1.11h5.71l-1.13,4.13-2.04,1.48h-8.68l.68-2.44h5.71l.3-1.13h-5.7l1.13-4.08,2.05-1.53h8.66l-.67,2.45h-5.71Z" />
    <path d="M254.59,2.6l.68-2.45h9.47l-.67,2.45h-1.85l-1.85,6.72h-5.81l1.85-6.72h-1.83Z" />
    <path d="M229.28,10.91h4.78l-2.12,7.69-2.04,1.48h-7.85l.67-2.45h4.69l1.87-6.72Z" />
    <path d="M234.98,10.91h10.71l-2.54,9.17h-4.8l.68-2.45h-1.13l-.67,2.45h-4.8l2.54-9.17ZM239.62,15.5c.07-.27.15-.54.22-.8.06-.23.12-.46.19-.71.07-.24.13-.45.18-.63h-1.11l-.59,2.14h1.11Z" />
    <path d="M246.64,10.91h4.8l-1.55,5.61h1.13l1.54-5.61h4.8l-1.55,5.61-4.85,3.56h-2.95l-2.91-3.56,1.55-5.61Z" />
    <path d="M258.26,10.91h10.71l-2.54,9.17h-4.8l.68-2.45h-1.13l-.67,2.45h-4.8l2.54-9.17ZM262.91,15.5c.07-.27.15-.54.22-.8.06-.23.12-.46.19-.71.07-.24.13-.45.18-.63h-1.11l-.59,2.14h1.11Z" />
    </svg>
  );
}

const BENTUK_DRIVE = (
  <>
  <polygon points="76.96 41.3 79.95 30.3 84.9 30.3 81.91 41.3 102.91 41.3 107.46 24.59 98.97 21.41 109.37 17.53 114.04 .12 66.63 .12 63.66 11.12 83.87 11.12 85.58 11.12 94.53 11.12 81.44 20.12 82.52 16.12 62.31 16.12 55.5 41.3 76.96 41.3" />
  <polygon points="127.01 41.3 138.2 .12 118.06 .12 106.94 41.3 127.01 41.3" />
  <polygon points="148.53 41.3 161.47 41.3 182.76 25.3 189.57 .12 168.52 .12 161.76 25.3 156.81 25.3 163.63 .12 142.57 .12 135.76 25.3 148.53 41.3" />
  <polygon points="182.47 41.3 225.45 41.3 228.38 30.3 205.6 30.3 206.92 25.3 229.76 25.3 232.21 16.12 209.43 16.12 189.28 16.12 182.47 41.3" />
  <polygon points="210.75 11.12 233.59 11.12 236.58 .12 193.6 .12 190.63 11.12 210.75 11.12" />
  <path d="M52.48,34.54l7.58-26.58L51.9,0H15.04l-3.04,11h4.51l-5.34,19.24h-4.49l-3.02,10.94h39.65l9.17-6.64ZM33.24,30.24h-10.65l7.01-5.06,3.91-14.18h4.99l-5.27,19.24Z" />
  </>
);

const BENTUK_TECH = (
  <>
  <polygon points="101.86 46.39 60.26 46.39 57.27 57.39 64.52 57.39 65.33 57.39 75.18 57.39 63.08 65.71 57.19 87.57 82.68 87.57 90.81 57.39 98.93 57.39 101.86 46.39" />
  <polygon points="123.47 57.39 145.87 57.39 148.86 46.39 105.89 46.39 102.91 57.39 123.03 57.39 123.47 57.39" />
  <polygon points="119.2 71.57 142.04 71.57 144.49 62.4 122.15 62.4 121.71 62.4 101.86 62.4 101.86 61.29 94.76 87.57 137.73 87.57 140.67 76.57 117.88 76.57 119.2 71.57" />
  <polygon points="171.78 69.28 169.78 76.57 164.89 76.57 170.03 57.39 174.98 57.39 173.11 64.22 194.17 64.22 198.97 46.39 152.89 46.39 141.76 87.57 180.71 87.57 189.68 80.93 192.78 69.28 171.78 69.28" />
  <polygon points="228.94 46.39 224.63 62.4 219.68 62.4 224.05 46.39 203 46.39 191.87 87.57 212.93 87.57 217.24 71.57 222.13 71.57 217.82 87.57 238.87 87.57 250 46.39 228.94 46.39" />
  <polygon points="11.44 56.27 5.76 56.27 6.09 55.02 11.78 55.02 12.39 52.73 6.72 52.73 7.04 51.49 12.74 51.49 13.48 48.75 2.77 48.75 0 59.01 10.71 59.01 11.44 56.27" />
  <path d="M23.42,59.01l2.77-10.26h-9.34l-3.03,2.42-2.12,7.84h5.25l.73-2.74h1.23l-.75,2.74h5.25ZM18.34,53.88l.64-2.39h1.22c-.05.2-.12.43-.19.71s-.14.54-.21.79c-.08.3-.16.59-.24.89h-1.22Z" />
  <polygon points="37.73 51.49 38.46 48.75 28.99 48.75 26.74 50.46 25.51 55.02 31.75 55.02 31.42 56.28 25.17 56.28 24.43 59.01 33.91 59.01 36.15 57.35 37.39 52.73 31.14 52.73 31.48 51.49 37.73 51.49" />
  <polygon points="45.05 59.01 47.08 51.49 49.1 51.49 49.83 48.75 39.47 48.75 38.72 51.49 40.73 51.49 38.7 59.01 45.05 59.01" />
  <polygon points="11.03 60.78 8.99 68.3 3.86 68.3 3.13 71.04 11.72 71.04 13.95 69.39 16.27 60.78 11.03 60.78" />
  <path d="M17.27,60.78l-2.77,10.26h5.25l.73-2.74h1.23l-.75,2.74h5.25l2.77-10.26h-11.71ZM22.8,64.23c-.08.27-.14.54-.21.79-.08.29-.16.59-.24.89h-1.22l.64-2.39h1.22c-.05.2-.12.43-.19.7Z" />
  <polygon points="41.74 60.78 36.49 60.78 34.81 67.06 33.57 67.06 35.27 60.78 30.03 60.78 28.33 67.06 31.51 71.04 34.74 71.04 40.04 67.06 41.74 60.78" />
  <path d="M39.97,71.04h5.25l.73-2.74h1.23l-.75,2.74h5.25l2.77-10.26h-11.71l-2.77,10.26ZM47.24,63.52h1.22c-.05.2-.12.43-.19.7-.08.27-.15.54-.21.79-.08.29-.16.59-.24.89h-1.22l.64-2.39Z" />
  </>
);

/** Baris atas logo primary: DRIVE. Lebar kanvas sama dengan baris TECH supaya susunannya pas. */
export function LogoBarisDrive({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 250 41.42" fill="currentColor" aria-hidden="true" className={className}>
      {BENTUK_DRIVE}
    </svg>
  );
}

/** Baris bawah logo primary: EAST JAVA + TECH. */
export function LogoBarisTech({ className }: { className?: string }) {
  return (
    <svg viewBox="0 46.27 250 41.42" fill="currentColor" aria-hidden="true" className={className}>
      {BENTUK_TECH}
    </svg>
  );
}

/** Ikon DT dalam lingkaran. */
export function LogoIkon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" strokeWidth="12" />
      <g transform="translate(16 40.50) scale(1.728)">
        <path fillRule="evenodd" d="M49.75,3.97H11.74l-3.14,11.35h4.65l-5.5,19.84H3.11l-3.11,11.28h41.99l9.46-6.85,6.71-27.41-8.41-8.21ZM30.51,35.16h-10.98l7.23-5.22,4.04-14.62h5.15l-5.44,19.84Z" />
        <path d="M48.18,17.42l-3.52,12.68h21.11l-14.26,9.59-6.95,25.2h30.05l9.59-34.79h9.57l3.46-12.68h-49.04Z" />
      </g>
    </svg>
  );
}

/** Logo lengkap: ikon DT + DRIVE / EAST JAVA TECH bertumpuk, tagline opsional di bawahnya. */
export function LogoLengkap({ className, tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <span role="img" aria-label="DriveTech" className={`flex items-center gap-[0.35em] text-logo ${className ?? ""}`}>
      <LogoIkon className="h-[2.6em] w-auto shrink-0" />
      <span className="flex flex-col">
        <svg viewBox="0 0 250 87.69" fill="currentColor" aria-hidden="true" className="h-[2em] w-auto">
          {BENTUK_DRIVE}
          {BENTUK_TECH}
        </svg>
        {tagline && (
          <span className="mt-[0.3em] font-tagline text-[0.36em] text-ink leading-none font-bold tracking-[0.12em] whitespace-nowrap italic">
            AUTO &amp; TECHNO SHOW * 2026
          </span>
        )}
      </span>
    </span>
  );
}
