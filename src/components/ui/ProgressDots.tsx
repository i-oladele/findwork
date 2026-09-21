export function ProgressDots({ step, of }: { step: number; of: number }) {
  return (
    <div className="flex gap-1.5 mb-[22px]">
      {Array.from({ length: of }).map((_, i) => (
        <span
          key={i}
          className={`flex-1 h-1 rounded-full ${i < step ? 'bg-brand' : 'bg-line'}`}
        />
      ))}
    </div>
  )
}
