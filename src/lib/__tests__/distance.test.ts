import { describe, expect, it } from 'vitest'
import { describeDistance, distanceBetween, distanceKm, formatDistance } from '../distance'

// Area centres from the service_areas seed.
const YABA = { lat: 6.5095, lng: 3.3711 }
const IKEJA = { lat: 6.6018, lng: 3.3515 }
const AJAH = { lat: 6.4698, lng: 3.5852 }

describe('distanceKm', () => {
  it('measures a known Lagos hop', () => {
    // Yaba to Ikeja is roughly 10 km as the crow flies.
    expect(distanceKm(YABA, IKEJA)).toBeGreaterThan(9)
    expect(distanceKm(YABA, IKEJA)).toBeLessThan(11)
  })

  it('is symmetric, and zero for the same point', () => {
    expect(distanceKm(YABA, AJAH)).toBeCloseTo(distanceKm(AJAH, YABA), 6)
    expect(distanceKm(YABA, YABA)).toBe(0)
  })

  it('puts Ikeja closer to Yaba than Ajah is', () => {
    expect(distanceKm(YABA, IKEJA)).toBeLessThan(distanceKm(YABA, AJAH))
  })
})

describe('distanceBetween', () => {
  it('gives up quietly when either side has no area set', () => {
    expect(distanceBetween(null, YABA)).toBeNull()
    expect(distanceBetween({ lat: null, lng: null }, YABA)).toBeNull()
    expect(distanceBetween(YABA, undefined)).toBeNull()
  })

  it('copes with numeric columns arriving as strings', () => {
    const asStrings = { lat: '6.5095' as unknown as number, lng: '3.3711' as unknown as number }
    expect(distanceBetween(asStrings, IKEJA)).toBeCloseTo(distanceKm(YABA, IKEJA), 3)
  })
})

describe('describeDistance', () => {
  it('says "in your area" rather than "about 0 m away"', () => {
    // Two people in Yaba share the area's coordinates.
    expect(describeDistance(0)).toBe('in your area')
    expect(describeDistance(0.4)).toBe('in your area')
  })

  it('describes real distances with matching precision', () => {
    expect(describeDistance(1.24)).toBe('about 1.2 km away')
    expect(describeDistance(12.4)).toBe('about 12 km away')
    expect(formatDistance(0.6)).toBe('600 m')
  })

  it('says nothing when there is nothing to say', () => {
    expect(describeDistance(null)).toBeNull()
    expect(describeDistance(undefined)).toBeNull()
  })
})
