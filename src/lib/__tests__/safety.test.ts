import { describe, expect, it } from 'vitest'
import { mapLink, safetyMessage, smsLink } from '../safety'

describe('messages to a trusted contact', () => {
  it('says who, where they are meeting and where they are', () => {
    const text = safetyMessage({ name: 'Ada', place: 'Ikeja City Mall', lat: 6.6, lng: 3.34, urgent: false })
    expect(text).toContain('This is Ada.')
    expect(text).toContain('Ikeja City Mall')
    expect(text).toContain(mapLink(6.6, 3.34))
  })

  it('asks for help plainly when it is urgent, even with no location', () => {
    const text = safetyMessage({ name: 'Ada', urgent: true })
    expect(text).toBe('This is Ada. I need help now. Please call me.')
  })

  it('opens the phone\'s own messaging app with the text filled in', () => {
    expect(smsLink('+2348051112222', 'I need help & fast')).toBe('sms:+2348051112222?&body=I%20need%20help%20%26%20fast')
  })
})
