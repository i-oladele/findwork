import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { Toggle } from '../../components/ui/Toggle'
import { QueryState } from '../../components/system/QueryState'
import { useCourses, useSaveCourse, useStaff, type CourseDraft, type LessonDraft, type QuestionDraft } from '../../lib/api'
import { loadCourseQuiz, uploadLessonVideo } from '../../lib/api/learning'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/supabase'
import { formatNaira, parseNaira } from '../../lib/format'
import type { Course } from '../../lib/database.types'
import type { Lesson } from '../../lib/api'

const BLANK: CourseDraft = { id: null, title: '', category: '', instructor: '', description: '', price: 0, passMark: 70, status: 'draft', lessons: [], questions: [] }
const area = 'block w-full mt-1 bg-cream rounded-lg p-3 text-[14.5px] text-ink outline-none'

/** Where content staff write courses: the lessons, their videos, and the quiz that earns the certificate. */
export function CourseEditor() {
  const staff = useStaff()
  const courses = useCourses()
  const [draft, setDraft] = useState<CourseDraft | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!staff.can('content')) return <Navigate to="/home" replace />

  async function open(course: Course) {
    setError(null)
    setLoading(course.id)
    try {
      const [content, questions] = await Promise.all([supabase.rpc('course_content', { p_course_id: course.id }), loadCourseQuiz(course.id)])
      if (content.error) throw content.error
      setDraft({
        id: course.id, title: course.title, category: course.category, instructor: course.instructor, description: course.description,
        price: course.price, passMark: course.pass_mark, status: course.status,
        lessons: ((content.data as unknown as Lesson[]) ?? []).map((l) => ({ id: l.id, title: l.title, minutes: l.minutes, body: l.body ?? '', video_path: l.video_path, video_url: l.video_url ?? '' })),
        questions,
      })
    } catch (err) { setError(friendlyError(err)) } finally { setLoading(null) }
  }

  return (
    <Screen>
      <PageHeader title="Courses" back="/admin" />
      <div className="px-[22px] pb-10">
        {error && <Alert className="mt-4">{error}</Alert>}
        {draft ? <Editor key={draft.id ?? 'new'} initial={draft} onClose={() => setDraft(null)} /> : (
          <>
            <Button className="mt-4" icon="plus" onClick={() => setDraft(BLANK)}>New course</Button>
            <div className="mt-5">
              <QueryState query={courses} errorMessage="We could not load courses." empty={{ icon: 'ph-graduation-cap', title: 'No courses yet' }}>
                {(rows) => rows.filter((c) => c.kind === 'course').map((c) => (
                  <button key={c.id} disabled={loading !== null} onClick={() => void open(c)} className="block w-full text-left bg-white border border-line rounded-2xl p-4 mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-semibold text-[15.5px] text-ink truncate">{c.title}</span>
                      <Badge tone={c.status === 'live' ? 'success' : 'neutral'}>{loading === c.id ? 'Opening…' : c.status}</Badge>
                    </div>
                    <div className="text-[13px] text-muted-2 mt-1">{c.category} · {c.price === 0 ? 'Free' : formatNaira(c.price)}</div>
                  </button>
                ))}
              </QueryState>
            </div>
          </>
        )}
      </div>
    </Screen>
  )
}

function Editor({ initial, onClose }: { initial: CourseDraft; onClose: () => void }) {
  const save = useSaveCourse()
  const [d, setD] = useState(initial)
  const [price, setPrice] = useState(String(initial.price || ''))
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)
  const set = (patch: Partial<CourseDraft>) => setD((old) => ({ ...old, ...patch }))
  const setLesson = (i: number, patch: Partial<LessonDraft>) => set({ lessons: d.lessons.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const setQuestion = (i: number, patch: Partial<QuestionDraft>) => set({ questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) })
  const empty = d.lessons.filter((l) => !l.body.trim() && !l.video_path && !l.video_url.trim()).length
  const questionsValid = d.questions.every((q) => q.prompt.trim().length >= 5 && q.options.filter((o) => o.trim()).length >= 2 && q.options[q.correct_index]?.trim())
  const valid = d.title.trim().length >= 3 && d.lessons.every((l) => l.title.trim().length >= 2) && questionsValid

  return (
    <div className="mt-4 space-y-4">
      <Input label="Title" value={d.title} onChange={(title) => set({ title })} />
      <div className="flex gap-3">
        <div className="flex-1"><Input label="Category" value={d.category} onChange={(category) => set({ category })} placeholder="Tailoring" /></div>
        <div className="flex-1"><Input label="Price (₦, 0 is free)" value={price} onChange={setPrice} type="tel" /></div>
      </div>
      <Input label="Taught by" value={d.instructor} onChange={(instructor) => set({ instructor })} />
      <label className="block text-[14px] text-text-soft">What the course covers
        <textarea value={d.description} onChange={(e) => set({ description: e.target.value })} rows={3} className={area} />
      </label>

      <SectionLabel>Lessons</SectionLabel>
      {d.lessons.map((lesson, i) => (
        <div key={lesson.id ?? `new-${i}`} className="bg-white border border-line rounded-2xl p-4 space-y-3">
          <div className="flex gap-2">
            <input value={lesson.title} onChange={(e) => setLesson(i, { title: e.target.value })} placeholder={`Lesson ${i + 1} title`} aria-label={`Lesson ${i + 1} title`} className="flex-1 min-w-0 bg-cream rounded-lg h-11 px-3 text-[15px] text-ink outline-none" />
            <input value={lesson.minutes || ''} onChange={(e) => setLesson(i, { minutes: Number(e.target.value.replace(/\D/g, '')) || 0 })} inputMode="numeric" placeholder="min" aria-label={`Lesson ${i + 1} minutes`} className="w-16 bg-cream rounded-lg h-11 px-3 text-[15px] text-ink outline-none" />
            <button type="button" aria-label={`Remove lesson ${i + 1}`} className="w-10 h-11 text-muted" onClick={() => set({ lessons: d.lessons.filter((_, j) => j !== i) })}><i className="ph ph-trash" /></button>
          </div>
          <label className="block text-[13.5px] text-text-soft">What the learner reads
            <textarea value={lesson.body} onChange={(e) => setLesson(i, { body: e.target.value })} rows={5} className={area} />
          </label>
          <label className="block text-[13.5px] text-text-soft">Video (MP4 or WebM, up to 100 MB)
            <input type="file" accept="video/mp4,video/webm" disabled={uploading !== null} className="block w-full mt-1 text-[14px]" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setError(null)
              setUploading(i)
              try { setLesson(i, { video_path: await uploadLessonVideo(file) }) } catch (err) { setError(friendlyError(err)) } finally { setUploading(null); e.target.value = '' }
            }} />
          </label>
          {uploading === i && <p className="text-[13px] text-muted">Uploading…</p>}
          {lesson.video_path && <p className="text-[13px] text-success-text">Video attached. <button type="button" className="underline" onClick={() => setLesson(i, { video_path: null })}>Remove</button></p>}
          <input value={lesson.video_url} onChange={(e) => setLesson(i, { video_url: e.target.value })} placeholder="or a link to a video hosted elsewhere (https://…)" aria-label={`Lesson ${i + 1} video link`} className="w-full bg-cream rounded-lg h-11 px-3 text-[14px] text-ink outline-none" />
        </div>
      ))}
      <button type="button" className="min-h-11 text-[14px] font-semibold text-brand" onClick={() => set({ lessons: [...d.lessons, { title: '', minutes: 0, body: '', video_path: null, video_url: '' }] })}>Add a lesson</button>
      {empty > 0 && <Alert tone="info">{empty} lesson{empty === 1 ? ' has' : 's have'} nothing to read or watch. Learners cannot complete an empty lesson, so they cannot finish the course.</Alert>}

      <SectionLabel>Quiz (optional)</SectionLabel>
      <p className="text-[13.5px] leading-[1.45] text-muted-2">With a quiz, the certificate is earned by passing it. Without one, finishing every lesson earns it.</p>
      {d.questions.map((q, i) => (
        <div key={i} className="bg-white border border-line rounded-2xl p-4 space-y-2">
          <div className="flex gap-2">
            <input value={q.prompt} onChange={(e) => setQuestion(i, { prompt: e.target.value })} placeholder={`Question ${i + 1}`} aria-label={`Question ${i + 1}`} className="flex-1 min-w-0 bg-cream rounded-lg h-11 px-3 text-[15px] text-ink outline-none" />
            <button type="button" aria-label={`Remove question ${i + 1}`} className="w-10 h-11 text-muted" onClick={() => set({ questions: d.questions.filter((_, j) => j !== i) })}><i className="ph ph-trash" /></button>
          </div>
          {q.options.map((option, j) => (
            <label key={j} className="flex items-center gap-2.5">
              <input type="radio" name={`correct-${i}`} checked={q.correct_index === j} onChange={() => setQuestion(i, { correct_index: j })} aria-label={`Option ${j + 1} is correct`} className="w-5 h-5 accent-[var(--color-success)]" />
              <input value={option} onChange={(e) => setQuestion(i, { options: q.options.map((o, k) => (k === j ? e.target.value : o)) })} placeholder={`Option ${j + 1}`} aria-label={`Question ${i + 1} option ${j + 1}`} className="flex-1 min-w-0 bg-cream rounded-lg h-10 px-3 text-[14.5px] text-ink outline-none" />
            </label>
          ))}
          <p className="text-[12.5px] text-muted-2">Select the correct option. {q.options.length < 6 && <button type="button" className="font-semibold text-brand" onClick={() => setQuestion(i, { options: [...q.options, ''] })}>Add an option</button>}</p>
        </div>
      ))}
      <button type="button" className="min-h-11 text-[14px] font-semibold text-brand" onClick={() => set({ questions: [...d.questions, { prompt: '', options: ['', ''], correct_index: 0 }] })}>Add a question</button>
      {d.questions.length > 0 && <Input label="Pass mark (%)" value={String(d.passMark)} onChange={(v) => set({ passMark: Math.min(100, Number(v.replace(/\D/g, '')) || 0) })} type="tel" />}

      <div className="flex items-center justify-between gap-3 bg-white border border-line rounded-2xl p-4">
        <div>
          <div className="text-[15px] font-semibold text-ink">Open for enrolment</div>
          <div className="text-[13px] text-muted-2 mt-0.5">{d.status === 'live' ? 'Learners can find and enrol on it.' : 'A draft: only content staff can see it.'}</div>
        </div>
        <Toggle label="Open for enrolment" on={d.status === 'live'} onChange={(on) => set({ status: on ? 'live' : 'draft' })} />
      </div>

      {error && <Alert>{error}</Alert>}
      <Button disabled={!valid || uploading !== null} loading={save.isPending} onClick={async () => {
        setError(null)
        try {
          await save.mutateAsync({
            ...d, price: parseNaira(price), passMark: d.passMark || 70,
            questions: d.questions.map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) })),
          })
          onClose()
        } catch (err) { setError(friendlyError(err)) }
      }}>Save course</Button>
      <button type="button" className="block w-full min-h-11 text-[14.5px] text-muted" onClick={onClose}>Close without saving</button>
    </div>
  )
}
