import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'

const periods = ['This week', 'Month', 'Year'] as const
const bars = [38, 56, 30, 72, 100, 64, 18]
const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const payouts = [
  { icon: 'bank', label: 'Paid to GTBank ···4021', detail: '9 March · 3 jobs', amount: '₦62,300' },
  { icon: 'bank', label: 'Paid to GTBank ···4021', detail: '2 March · 5 jobs', amount: '₦94,800' },
  { icon: 'receipt', label: 'Platform fees, February', detail: '6% of 21 jobs', amount: '−₦18,400', warn: true },
]

export function Earnings() {
  const [period, setPeriod] = useState<(typeof periods)[number]>('This week')

  return (
    <Screen bottomNav="provider">
      <div className="bg-ink px-[22px] pb-6">
        <StatusBar tone="light" />
        <div className="font-display font-bold text-[22px] text-cream mt-1.5">Earnings</div>
        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-4">
          Ready to withdraw
        </div>
        <div className="font-display font-bold text-[44px] tracking-[-0.03em] text-cream mt-1.5">₦34,000</div>
        <div className="flex items-center gap-2 mt-2">
          <i className="ph-fill ph-lock-simple text-sm text-brand" />
          <span className="text-[13.5px] text-muted-3">₦21,100 still in escrow on 2 jobs</span>
        </div>
        <button className="flex items-center justify-center gap-2 h-[52px] w-full mt-4 bg-brand rounded-xl text-base font-semibold text-white">
          <i className="ph-bold ph-arrow-up-right text-lg" />
          Withdraw to bank
        </button>
      </div>

      <div className="px-[22px] pt-[18px]">
        <div className="flex gap-2">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-full px-[15px] py-2 text-[13.5px] ${
                period === p ? 'bg-ink text-white font-semibold' : 'bg-white border border-line text-ink font-medium'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="bg-white border border-line rounded-2xl p-[18px] mt-3.5">
          <div className="flex items-baseline justify-between">
            <span className="font-display font-bold text-2xl text-ink">₦86,400</span>
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-success-text">
              <i className="ph-fill ph-trend-up text-sm" />
              18%
            </span>
          </div>
          <div className="flex items-end gap-2.5 h-[104px] mt-[18px]">
            {bars.map((h, i) => (
              <span
                key={i}
                className={`flex-1 rounded-[3px] ${i === 4 ? 'bg-brand' : 'bg-line-soft'}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="flex gap-2.5 mt-2 font-mono text-[10px] text-muted text-center">
            {dayLabels.map((d, i) => (
              <span key={i} className="flex-1">{d}</span>
            ))}
          </div>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Payout history</div>
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {payouts.map((p, i) => (
            <div key={i} className={`flex items-center gap-3.5 p-3.5 ${i < payouts.length - 1 ? 'border-b border-line-soft' : ''}`}>
              <span
                className={`flex-none inline-flex items-center justify-center w-10 h-10 rounded-[10px] ${
                  p.warn ? 'bg-warning-bg text-warning-text' : 'bg-success-bg text-success-text'
                }`}
              >
                <i className={`ph-fill ph-${p.icon} text-lg`} />
              </span>
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-ink">{p.label}</div>
                <div className="text-[12.5px] text-muted-2 mt-0.5">{p.detail}</div>
              </div>
              <span className="font-display font-bold text-[15px] text-ink">{p.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  )
}
