import { afterEach, describe, expect, it, vi } from 'vitest'
import { placeAt, searchPlaces, toPlace } from '../geocoding'
import { nearestArea } from '../distance'

/**
 * "Add your area" turns what someone types, or where their phone is, into a
 * pin and a readable address, and files them under the nearest listed area.
 */

const yabatech = {
  geometry: { coordinates: [3.3741408, 6.5187275] as [number, number] },
  properties: { name: 'Yaba College of Technology', street: 'Herbert Macaulay Way', district: 'Yaba', state: 'Lagos', countrycode: 'NG' },
}

describe('toPlace', () => {
  it('reads as a landmark, its street and its area', () => {
    expect(toPlace(yabatech)).toEqual({
      label: 'Yaba College of Technology, Herbert Macaulay Way, Yaba',
      detail: 'Yaba, Lagos',
      lat: 6.5187275,
      lng: 3.3741408,
    })
  })

  it('puts a house number before its street, and does not repeat a name', () => {
    const house = { geometry: { coordinates: [3.37, 6.5] as [number, number] }, properties: { name: 'Herbert Macaulay Way', housenumber: '14', street: 'Herbert Macaulay Way', district: 'Yaba', state: 'Lagos' } }
    expect(toPlace(house).label).toBe('14 Herbert Macaulay Way, Yaba')
    const road = { geometry: { coordinates: [3.37, 6.5] as [number, number] }, properties: { name: 'Yaba', district: 'Yaba', state: 'Lagos' } }
    expect(toPlace(road).label).toBe('Yaba')
  })
})

describe('searchPlaces', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('searches Nigeria, nearest Lagos first', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ features: [yabatech] })))
    vi.stubGlobal('fetch', fetchMock)
    const places = await searchPlaces('herbert macaulay')
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/')
    expect(url.searchParams.get('q')).toBe('herbert macaulay')
    expect(url.searchParams.get('bbox')).toBe('2.67,4.27,14.68,13.89')
    expect(url.searchParams.get('lat')).toBe('6.5244')
    expect(places[0].label).toBe('Yaba College of Technology, Herbert Macaulay Way, Yaba')
  })

  it('waits for at least three letters', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await searchPlaces('ya')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('placeAt', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps the pin where it was put, named after what is nearest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ features: [yabatech] }))))
    const place = await placeAt(6.51, 3.37)
    expect(place).toMatchObject({ lat: 6.51, lng: 3.37, label: 'Yaba College of Technology, Herbert Macaulay Way, Yaba' })
  })

  it('still gives a usable pin when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    expect(await placeAt(6.51, 3.37)).toEqual({ label: 'Pinned location', detail: '6.5100, 3.3700', lat: 6.51, lng: 3.37 })
  })
})

describe('nearestArea', () => {
  const areas = [
    { name: 'Yaba', lat: 6.5095, lng: 3.3711 },
    { name: 'Surulere', lat: 6.5, lng: 3.35 },
    { name: 'Ikeja', lat: 6.6018, lng: 3.3515 },
  ]

  it('files a pin under the closest listed area', () => {
    expect(nearestArea(areas, { lat: 6.5187, lng: 3.3741 })?.name).toBe('Yaba')
  })

  it('files a pin far from every area under none, like the database does', () => {
    expect(nearestArea(areas, { lat: 9.0765, lng: 7.3986 })).toBeNull()
  })
})
