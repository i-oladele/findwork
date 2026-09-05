import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { openJobs } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function SendQuote() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sendQuote = useAppStore((s) => s.sendQuote)
  const job = openJobs.find((j) => j.id === id) ?? openJobs[0]

  const [price, setPrice] = useState(Math.round(job.price * 0.9))
  const [days, setDays] = useState('9 days')
  const [startDay, setStartDay] = useState('Friday')
  const [message, setMessage] = useState('I have done work like this many times. I can come for measurements on Friday evening.')
  const fee = Math.round(price * 0.94)

  function submit() {
    sendQuote({ jobId: job.id, jobTitle: job.title, price, days: Number(days) || 0, startDay, message })
    navigate('/provider/requests')
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/provider/jobs" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Your quote</span>
        </div>

        <div className="bg-ink rounded-2xl p-[18px] mt-4">
          <div className="font-display font-semibold text-[16.5px] text-cream">{job.title}</div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[13.5px] text-muted-3">Budget ₦{job.price.toLocaleString()}</span>
            <span className="w-1 h-1 rounded-full bg-ink-line" />
            <span className="text-[13.5px] text-muted-3">{job.quotes} quotes in</span>
          </div>
        </div>

        <div className="mt-5">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Your price</div>
          <div className="flex items-center bg-white border-[1.5px] border-ink rounded-lg h-[58px] px-4">
            <span className="font-display font-bold text-2xl text-ink">₦</span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              className="flex-1 bg-transparent outline-none font-display font-bold text-2xl text-ink"
            />
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <i className="ph-fill ph-sparkle text-sm text-success" />
            <span className="text-[13px] text-text-soft">Quotes near ₦{Math.round(job.price * 0.87).toLocaleString()} win most often for this kind of job.</span>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Days needed</div>
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none"
            />
          </div>
          <div className="flex-1">
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Can start</div>
            <input
              value={startDay}
              onChange={(e) => setStartDay(e.target.value)}
              className="w-full flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none"
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Your message</div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-[104px] text-[15.5px] leading-[1.55] text-ink outline-none resize-none"
          />
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Attach past work</div>
          <div className="flex gap-2.5">
            <PlaceholderImage className="w-[66px] h-[66px] rounded-lg" />
            <PlaceholderImage className="w-[66px] h-[66px] rounded-lg" />
            <div className="w-[66px] h-[66px] border-[1.5px] border-dashed border-[#C9A99E] rounded-lg flex items-center justify-center text-muted-2">
              <i className="ph ph-plus text-xl" />
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
        <div className="flex justify-between text-[13.5px] text-muted mb-2.5">
          <span>You receive after 6% fee</span>
          <span className="font-display font-bold text-ink">₦{fee.toLocaleString()}</span>
        </div>
        <button onClick={submit} className="flex items-center justify-center w-full h-14 bg-brand text-white rounded-xl font-semibold text-[17px]">
          Send quote
        </button>
      </div>
    </Screen>
  )
}
