import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { useAppStore } from '../../store/appStore'

const presets = [5000, 10000, 25000, 50000]
const fundOptions = [
  { id: 'bank', icon: 'bank', label: 'Bank transfer', detail: 'Free · lands in about a minute' },
  { id: 'card', icon: 'credit-card', label: 'Debit card', detail: '1.5% fee · instant' },
  { id: 'agent', icon: 'storefront', label: 'Cash at an agent', detail: '14 agents within 3 km of Yaba' },
]

export function AddMoney() {
  const balance = useAppStore((s) => s.wallet.balance)
  const addMoney = useAppStore((s) => s.addMoney)
  const [amount, setAmount] = useState(25000)
  const [fund, setFund] = useState('bank')

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/wallet" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-x text-xl" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Add money</span>
        </div>

        <div className="text-center mt-[30px]">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">Amount</div>
          <div className="font-display font-bold text-[54px] tracking-[-0.03em] text-ink mt-2.5">
            ₦{amount.toLocaleString()}
          </div>
          <div className="text-sm text-muted mt-1.5">New balance ₦{(balance + amount).toLocaleString()}</div>
        </div>

        <div className="flex gap-2.5 mt-6">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={`flex-1 h-11 flex items-center justify-center rounded-full text-sm font-semibold ${
                amount === p ? 'bg-ink text-white' : 'bg-white border border-line text-ink'
              }`}
            >
              ₦{p.toLocaleString()}
            </button>
          ))}
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-6 mb-2.5">Fund from</div>
        {fundOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setFund(opt.id)}
            className={`w-full flex items-center gap-3.5 bg-white rounded-2xl p-4 text-left mb-2.5 ${
              fund === opt.id ? 'border-[1.5px] border-brand' : 'border border-line'
            }`}
          >
            <i className={`ph-fill ph-${opt.icon} text-xl text-ink`} />
            <div className="flex-1">
              <div className="text-[15.5px] font-semibold text-ink">{opt.label}</div>
              <div className="text-[13px] text-muted-2 mt-0.5">{opt.detail}</div>
            </div>
            {fund === opt.id && <i className="ph-fill ph-check-circle text-[22px] text-brand" />}
          </button>
        ))}

        {fund === 'bank' && (
          <div className="bg-ink rounded-2xl p-[18px] mt-1">
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-brand mb-2.5">Transfer to</div>
            <div className="flex justify-between text-[15px] text-muted-3">
              <span>Bank</span><span className="text-cream">Providus</span>
            </div>
            <div className="flex justify-between text-[15px] text-muted-3 mt-2">
              <span>Account</span><span className="font-mono text-cream">9902 441 087</span>
            </div>
            <div className="flex justify-between text-[15px] text-muted-3 mt-2">
              <span>Name</span><span className="text-cream">FindWork / A Okoro</span>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
        <Button to="/wallet" onClick={() => addMoney(amount)}>I have sent ₦{amount.toLocaleString()}</Button>
      </div>
    </Screen>
  )
}
