export type PortfolioKind = 'image' | 'video' | 'certificate'
export const PORTFOLIO_LIMIT = 20
export const PORTFOLIO_MAX_BYTES = 40 * 1024 * 1024
export const PORTFOLIO_MIME: Record<PortfolioKind, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
  certificate: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
}
export function validatePortfolioFile(file: Pick<File, 'type' | 'size'>, kind: PortfolioKind) {
  if (!PORTFOLIO_MIME[kind].includes(file.type)) throw new Error('Choose a supported image, video or PDF for this item type.')
  if (file.size < 1 || file.size > PORTFOLIO_MAX_BYTES) throw new Error('Choose a non-empty file smaller than 40 MB.')
}
