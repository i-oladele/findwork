import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { useAppStore } from '../../store/appStore'

export function PostJob() {
  const navigate = useNavigate()
  const postJob = useAppStore((s) => s.postJob)

  const [title, setTitle] = useState('Sew three aso-ebi dresses')
  const [description, setDescription] = useState(
    'Ankara fabric already bought. Need them ready before a wedding on the 28th. Measurements can be taken at my place in Yaba.',
  )
  const [budget, setBudget] = useState('60,000')
  const [neededBy, setNeededBy] = useState('26 Mar')

  const canSubmit = title.trim().length > 0 && Number(budget.replace(/,/g, '')) > 0

  function submit() {
    postJob({
      title,
      description,
      budget: Number(budget.replace(/,/g, '')) || 0,
      neededBy,
    })
    navigate('/quotes')
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/home" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-x text-xl" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">Post a job</span>
        </div>
        <p className="mt-3 text-[15px] leading-[1.55] text-muted">
          Describe it once. Verified pros nearby will send you quotes.
        </p>

        <div className="mt-5">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">What needs doing</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none"
          />
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Details</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-24 text-[15.5px] leading-[1.55] text-ink outline-none resize-none"
          />
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Add photos</div>
          <div className="flex gap-2.5">
            <PlaceholderImage className="w-[74px] h-[74px] rounded-lg" />
            <PlaceholderImage className="w-[74px] h-[74px] rounded-lg" />
            <div className="w-[74px] h-[74px] border-[1.5px] border-dashed border-muted-4 rounded-lg flex items-center justify-center text-muted-2">
              <i className="ph ph-plus text-2xl" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Budget</div>
            <div className="flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 font-display font-bold text-[16px] text-ink">
              <span>₦</span>
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="numeric"
                className="flex-1 bg-transparent outline-none min-w-0"
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Needed by</div>
            <input
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              className="w-full flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[15.5px] text-ink outline-none"
            />
          </div>
        </div>

        <div className="flex items-start gap-2.5 bg-white border border-line rounded-2xl p-4 mt-4">
          <i className="ph-fill ph-sparkle text-[19px] text-success relative top-0.5" />
          <p className="text-[13.5px] leading-[1.5] text-text-soft">
            We will send this to 14 tailors in Yaba and Surulere who match your budget and date.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
        <Button onClick={submit} disabled={!canSubmit}>Post job and get quotes</Button>
      </div>
    </Screen>
  )
}
