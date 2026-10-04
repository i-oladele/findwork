import { describe, expect, it } from 'vitest'
import { validatePortfolioFile, PORTFOLIO_MAX_BYTES } from '../portfolio'

describe('provider upload validation', () => {
  it('accepts supported video and certificate files', () => {
    expect(() => validatePortfolioFile({ type: 'video/mp4', size: 4096 }, 'video')).not.toThrow()
    expect(() => validatePortfolioFile({ type: 'application/pdf', size: 4096 }, 'certificate')).not.toThrow()
  })
  it('rejects active document formats and mismatched media', () => {
    for (const type of ['image/svg+xml', 'text/html', 'application/javascript', 'video/mp4']) {
      expect(() => validatePortfolioFile({ type, size: 1024 }, 'image')).toThrow()
    }
  })
  it('rejects empty and oversized uploads', () => {
    for (const size of [0, PORTFOLIO_MAX_BYTES + 1]) {
      expect(() => validatePortfolioFile({ type: 'video/mp4', size }, 'video')).toThrow()
    }
  })
})
