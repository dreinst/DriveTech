export type StepperProps = {
  steps: string[];
  /** Indeks langkah aktif, berbasis 0 (steps[current] = langkah yang sedang berjalan). */
  current: number;
};

/**
 * Tab teks horizontal bernomor — "1. Detail   2. Info Tenant   …".
 * Aktif: text-accent semibold + garis bawah 2px oranye; selesai: text-muted;
 * belum: text-subtle. Nomor otomatis dari indeks.
 */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol
      className="no-scrollbar mb-6 flex items-center gap-5 overflow-x-auto border-b border-line sm:gap-8"
      aria-label="Langkah proses"
    >
      {steps.map((step, index) => {
        const isDone = index < current;
        const isActive = index === current;
        const stateClass = isActive
          ? "border-accent font-semibold text-accent"
          : isDone
            ? "border-transparent text-muted"
            : "border-transparent text-subtle";

        return (
          <li key={step} className="shrink-0" aria-current={isActive ? "step" : undefined}>
            <span
              className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 text-sm transition-colors duration-150 ${stateClass}`}
            >
              <span className="tabular" aria-hidden="true">
                {index + 1}.
              </span>
              {step}
              {isDone ? <span className="sr-only">(selesai)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
