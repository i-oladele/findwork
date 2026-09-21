import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { usePostJob } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { parseNaira } from '../../lib/format'

export function PostJob() {
  const navigate = useNavigate()
  const post = usePostJob()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canSubmit = title.trim().length > 3 && description.trim().length > 0 && parseNaira(budget) > 0

  async function submit() {
    setError(null)
    try {
      const id = await post.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        budget: parseNaira(budget),
        needed_by: neededBy.trim() || undefined,
      })
      navigate(`/jobs/${id}`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Post a job" back="/home" icon="x" />
      <div className="px-[22px] pb-6">
        <p className="mt-3 text-[15px] leading-[1.55] text-muted">
          Describe it once. Providers on FindWork send you quotes, and you choose.
        </p>

        <SectionLabel className="mt-5 mb-2">What needs doing</SectionLabel>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sew three aso-ebi dresses"
          maxLength={120}
          className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[16px] text-ink outline-none placeholder:text-muted-2"
        />

        <SectionLabel className="mt-4 mb-2">Details</SectionLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="What you need, where, and anything a pro should know before quoting"
          className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 min-h-24 text-[15.5px] leading-[1.55] text-ink outline-none resize-none placeholder:text-muted-2"
        />

        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <SectionLabel className="mb-2">Budget</SectionLabel>
            <div className="flex items-center bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 font-display font-bold text-[16px] text-ink">
              <span>₦</span>
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="numeric"
                placeholder="60,000"
                className="flex-1 bg-transparent outline-none min-w-0 placeholder:text-muted-2 placeholder:font-normal"
              />
            </div>
          </div>
          <div className="flex-1">
            <SectionLabel className="mb-2">Needed by</SectionLabel>
            <input
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              placeholder="26 Mar"
              className="w-full bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-[15.5px] text-ink outline-none placeholder:text-muted-2"
            />
          </div>
        </div>

        <Alert tone="info" className="mt-4">
          Open jobs are visible to every provider on FindWork. Your phone number and address are never shown.
        </Alert>
        {error && <Alert className="mt-3">{error}</Alert>}
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
        <Button onClick={submit} disabled={!canSubmit} loading={post.isPending} className="w-full">
          Post job and get quotes
        </Button>
      </div>
    </Screen>
  )
}
