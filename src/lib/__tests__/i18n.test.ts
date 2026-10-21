import { describe, expect, it } from 'vitest'
import { fill } from '../i18n'
import yo from '../../locales/yo.json'
import ha from '../../locales/ha.json'

describe('translating the app', () => {
  it('fills placeholders, and leaves unknown ones visible rather than blank', () => {
    expect(fill('Photo of your {document}', { document: 'NIN slip' })).toBe('Photo of your NIN slip')
    expect(fill('{category} service', {})).toBe('{category} service')
    expect(fill('Wallet')).toBe('Wallet')
  })

  it('keeps the placeholders when a sentence is translated', () => {
    expect(fill((yo as Record<string, string>)['{category} service'], { category: 'Ìránṣọ' })).toBe('Iṣẹ́ Ìránṣọ')
    expect((ha as Record<string, string>)['We heard "{said}". Say hire, work, deliver or business, or tap a card.']).toContain('{said}')
  })
})
