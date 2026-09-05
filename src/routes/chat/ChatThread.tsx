import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { contacts } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function ChatThread() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const contact = contacts.find((c) => c.id === id) ?? contacts[0]

  const thread = useAppStore((s) => s.chat[contact.id] ?? [])
  const sendMessage = useAppStore((s) => s.sendMessage)
  const markRead = useAppStore((s) => s.markRead)
  const setDraftBooking = useAppStore((s) => s.setDraftBooking)

  const [draft, setDraft] = useState('')

  useEffect(() => {
    markRead(contact.id)
  }, [contact.id, markRead])

  function send() {
    if (!draft.trim()) return
    sendMessage(contact.id, draft)
    setDraft('')
  }

  function acceptQuote() {
    setDraftBooking({
      providerId: 'ada-tailoring',
      providerName: "Ada's Tailoring",
      service: 'Three aso-ebi dresses',
      price: 54000,
      date: 'Fri 21 Mar',
      time: '18:00',
    })
    navigate('/book/ada-tailoring/pay')
  }

  return (
    <Screen>
      <div className="bg-ink px-4 pb-3.5">
        <div className="h-11 flex items-center justify-between px-1.5 font-mono text-xs text-cream">
          <span>9:41</span>
          <span className="flex items-center gap-1.5">
            <i className="ph-fill ph-cell-signal-full text-[13px]" />
            <i className="ph-fill ph-wifi-high text-[13px]" />
            <i className="ph-fill ph-battery-full text-sm" />
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Link to="/messages" className="inline-flex items-center justify-center w-10 h-11 text-cream">
            <i className="ph-bold ph-arrow-left text-xl" />
          </Link>
          {contact.isSupport ? (
            <div className="flex-none w-10 h-10 rounded-full bg-ink-soft flex items-center justify-center">
              <i className="ph-fill ph-headset text-lg text-brand" />
            </div>
          ) : (
            <PlaceholderImage shape="circle" className="w-10 h-10 flex-none" />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-semibold text-base text-cream">{contact.name}</span>
              {!contact.isSupport && <i className="ph-fill ph-shield-check text-sm text-success" />}
            </div>
            <div className="text-xs text-success mt-0.5">{contact.online ? 'Online now' : ' '}</div>
          </div>
          {contact.id === 'ada-tailoring' && (
            <Link to="/provider/ada-tailoring" className="inline-flex items-center justify-center w-11 h-11 text-cream">
              <i className="ph ph-dots-three-vertical text-xl" />
            </Link>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="text-center font-mono text-[10.5px] tracking-[0.14em] uppercase text-muted mb-4">Today</div>

        {thread.map((b) => (
          <div key={b.id} className={`flex mb-3 ${b.from === 'me' ? 'justify-end' : ''}`}>
            <div
              className={`max-w-[78%] rounded-2xl px-[15px] py-3 ${
                b.from === 'me'
                  ? 'bg-ink rounded-br-[4px]'
                  : 'bg-white border border-line rounded-bl-[4px]'
              }`}
            >
              {b.kind === 'voice' ? (
                <div className="flex items-center gap-2.5">
                  <i className="ph-fill ph-play text-lg text-brand" />
                  <span className="flex items-end gap-[2.5px] h-[22px]">
                    {[8, 15, 22, 12, 18, 9, 14, 20, 7].map((h, i) => (
                      <span
                        key={i}
                        className={`w-[2.5px] ${b.from === 'me' ? 'bg-muted-2' : 'bg-line'}`}
                        style={{ height: h }}
                      />
                    ))}
                  </span>
                  <span className="font-mono text-[11px] text-muted-2">0:14</span>
                </div>
              ) : (
                <p className={`m-0 text-[15px] leading-[1.45] ${b.from === 'me' ? 'text-cream' : 'text-ink'}`}>{b.text}</p>
              )}
              <div className={`font-mono text-[10px] mt-1.5 ${b.from === 'me' ? 'text-right text-muted-2' : 'text-muted'}`}>
                {b.time}
              </div>
            </div>
          </div>
        ))}

        {contact.id === 'ada-tailoring' && (
          <div className="mb-3">
            <div className="max-w-[88%] bg-white border-[1.5px] border-brand rounded-2xl p-4">
              <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-brand-deep">Quote</div>
              <div className="flex items-baseline justify-between mt-2.5">
                <span className="text-[15px] text-text-soft">Three aso-ebi dresses</span>
                <span className="font-display font-bold text-xl text-ink">₦54,000</span>
              </div>
              <div className="text-[13.5px] text-muted mt-1.5">Ready in 9 days · measurements Friday 6pm</div>
              <button
                onClick={acceptQuote}
                className="flex items-center justify-center w-full h-11 mt-3.5 bg-brand text-white rounded-lg text-[14.5px] font-semibold"
              >
                Accept and pay to escrow
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2.5 bg-success-bg rounded-xl px-3.5 py-[11px]">
          <i className="ph-fill ph-shield-check text-lg text-success-text" />
          <p className="m-0 text-[12.5px] leading-[1.4] text-success-text">
            Keep payments inside FindWork. Escrow cannot protect cash or direct transfers.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-4 pt-3 pb-5 flex items-center gap-2.5">
        <span className="flex-none inline-flex items-center justify-center w-11 h-11 text-muted">
          <i className="ph ph-plus-circle text-2xl" />
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Write a message"
          className="flex-1 flex items-center bg-white border-[1.5px] border-line rounded-full h-[46px] px-4 text-[15px] text-ink outline-none placeholder:text-muted"
        />
        <button
          onClick={send}
          className="flex-none inline-flex items-center justify-center w-[46px] h-[46px] bg-brand rounded-full text-white"
        >
          <i className={draft ? 'ph-bold ph-paper-plane-right text-lg' : 'ph-fill ph-microphone text-lg'} />
        </button>
      </div>
    </Screen>
  )
}
