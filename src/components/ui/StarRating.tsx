export function StarRating({ rating, reviews }: { rating: number; reviews?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink">
      <i className="ph-fill ph-star text-warning text-[13px]" />
      {rating}
      {reviews !== undefined && <span className="text-muted-2 font-normal">({reviews})</span>}
    </span>
  )
}
