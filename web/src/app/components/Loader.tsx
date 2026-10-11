// Inline spinner with a spoken label. Holds still when the reader prefers reduced motion.
export type LoaderProps = { label: string; size?: number; className?: string };

export function Loader({ label, size = 28, className = "" }: LoaderProps) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-teal-700 ${className}`.trim()}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="motion-safe:animate-spin"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
