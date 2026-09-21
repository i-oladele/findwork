type PlaceholderImageProps = {
  shape?: 'rect' | 'circle'
  className?: string
  src?: string
}

/** Matches the striped fallback the source design uses for un-filled photo slots. */
export function PlaceholderImage({ shape = 'rect', className = '', src }: PlaceholderImageProps) {
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-xl'
  if (src) {
    return <img src={src} alt="" className={`object-cover ${radius} ${className}`} />
  }
  return (
    <div
      className={`${radius} ${className}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg,#E7E2D8,#E7E2D8 8px,#DED8CB 8px,#DED8CB 16px)',
      }}
    />
  )
}
