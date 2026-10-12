// Content-shaped placeholders while data loads. Decorative: the region that holds them carries
// aria-busy and a spoken label. The shimmer is off when the reader prefers reduced motion.
const BAR = "skeleton rounded-[8px] bg-line";

export type SkeletonCardProps = {
  /** Text bars below the headline bar. */
  lines?: number;
  className?: string;
};

export function SkeletonCard({ lines = 1, className = "" }: SkeletonCardProps) {
  return (
    <div aria-hidden="true" data-skeleton="" className={`flex flex-col gap-3 rounded-[18px] border border-line bg-paper p-4 md:p-5 ${className}`.trim()}>
      <div className={`${BAR} h-3.5 w-2/5`} />
      <div className={`${BAR} h-7 w-3/5`} />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`${BAR} h-3.5`} style={{ width: `${85 - i * 20}%` }} />
      ))}
    </div>
  );
}

/** A grid of skeleton cards laid out like the cards they stand for. */
export function SkeletonGrid({ count = 4, lines = 1, className = "" }: { count?: number; lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 ${className}`.trim()}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  );
}

/** Rows shaped like a list or table body. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" data-skeleton="" className="flex flex-col gap-2 rounded-[18px] border border-line bg-paper p-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={`${BAR} h-4 w-10`} />
          <div className={`${BAR} h-4 flex-1`} />
          <div className={`${BAR} h-4 w-20`} />
        </div>
      ))}
    </div>
  );
}
