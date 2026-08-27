export type StepperProps = {
  steps: string[];
  /** Indeks langkah aktif, berbasis 0 (steps[current] = langkah yang sedang berjalan). */
  current: number;
};

/** Indikator langkah alur booking / pembelian. */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className="no-scrollbar mb-5 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Langkah proses">
      {steps.map((step, index) => {
        const isDone = index < current;
        const isActive = index === current;
        const circleClass = isDone
          ? "border-slate-900 bg-slate-900 text-white"
          : isActive
            ? "border-slate-900 bg-white text-slate-900"
            : "border-slate-300 bg-white text-slate-400";
        const textClass = isDone || isActive ? "text-slate-900" : "text-slate-400";

        return (
          <li
            key={step}
            className="flex shrink-0 items-center gap-2"
            aria-current={isActive ? "step" : undefined}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${circleClass}`}
            >
              {isDone ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5.5 10.5 8.5 13.5 14.5 6.5" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className={`text-xs font-medium sm:text-sm ${textClass}`}>{step}</span>
            {index < steps.length - 1 ? (
              <span
                className={`h-px w-5 shrink-0 sm:w-8 ${isDone ? "bg-slate-900" : "bg-slate-200"}`}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
