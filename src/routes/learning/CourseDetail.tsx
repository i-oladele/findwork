import { AskAssistant } from '../../components/ui/AskAssistant'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { StarRating } from '../../components/ui/StarRating'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import {
  useCertificates,
  useCompleteLesson,
  useCourse,
  useCourseLessons,
  useEnroll,
  useEnrollments,
  useLessonCompletions,
  useQuizQuestions,
  useSubmitQuiz,
  useWalletSummary,
  type Lesson,
  type QuizResult,
} from '../../lib/api'
import { usePrivateMedia } from '../../lib/api/storage'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'
import type { QuizQuestion } from '../../lib/database.types'

export function CourseDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: course, isLoading } = useCourse(id)
  const { data: lessons } = useCourseLessons(id)
  const { data: enrollments } = useEnrollments()
  const { data: completed } = useLessonCompletions()
  const { data: wallet } = useWalletSummary()
  const { data: certificates } = useCertificates(user?.id)
  const enroll = useEnroll()
  const complete = useCompleteLesson()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const enrollment = enrollments?.find((e) => e.course_id === id)
  const isEnrolled = Boolean(enrollment)
  const quiz = useQuizQuestions(id, isEnrolled)

  if (isLoading) return <FullScreenLoader />
  if (!course) {
    return (
      <Screen>
        <PageHeader title="Course" back="/courses" />
        <EmptyState icon="ph-graduation-cap" title="Course not found" />
      </Screen>
    )
  }

  const shortfall = Math.max(0, course.price - (wallet?.balance ?? 0))
  const certificate = certificates?.find((c) => c.course_id === course.id)
  const finished = (enrollment?.progress ?? 0) >= 100

  async function join() {
    setError(null)
    try {
      await enroll.mutateAsync(course!.id)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen>
      <PageHeader title="Course" back="/courses" />
      <div className="px-[22px] pb-6">
        <div className="flex gap-3.5 mt-3">
          <PlaceholderImage src={course.image_url ?? undefined} className="w-20 h-20 flex-none" />
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-[22px] leading-[1.15] tracking-[-0.02em] text-ink">{course.title}</h2>
            <div className="text-[13px] text-muted-2 mt-1">{course.instructor}</div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <StarRating rating={Number(course.rating)} />
          <span className="font-display font-bold text-xl text-ink">{course.price === 0 ? 'Free' : formatNaira(course.price)}</span>
        </div>

        <p className="mt-4 text-[15px] leading-[1.6] text-text-soft">{course.description}</p>

        {certificate && (
          <Link to={`/certificate/${certificate.code}`} className="flex items-center justify-between bg-ink rounded-2xl px-5 py-4 mt-4">
            <span className="font-display font-semibold text-[16px] text-cream"><i className="ph-fill ph-certificate text-brand mr-2" />Your certificate</span>
            <i className="ph-bold ph-arrow-right text-xl text-brand" />
          </Link>
        )}

        {enrollment && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[13.5px] text-muted mb-1.5">
              <span>Your progress</span>
              <span className="font-semibold text-ink">{enrollment.progress}%</span>
            </div>
            <div className="h-2 bg-line-soft rounded-full overflow-hidden">
              <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${enrollment.progress}%` }} />
            </div>
          </div>
        )}

        <SectionLabel className="mt-5 mb-2.5">Lessons</SectionLabel>
        {(lessons ?? []).length === 0 && <Alert tone="info">This course has no lessons yet.</Alert>}
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {(lessons ?? []).map((l, i, arr) => {
            const done = completed?.has(l.id) ?? false
            const expanded = open === l.id
            return (
              <div key={l.id} className={i < arr.length - 1 ? 'border-b border-line-soft' : ''}>
                <button disabled={!isEnrolled} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : l.id)}
                  className="w-full flex items-center gap-3.5 p-3.5 text-left disabled:cursor-default">
                  <i className={`text-xl ${done ? 'ph-fill ph-check-circle text-success' : isEnrolled ? 'ph-fill ph-play-circle text-brand' : 'ph ph-lock-simple text-muted-2'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold text-ink">{l.title}</div>
                    <div className="text-[12.5px] text-muted-2 mt-0.5">
                      {l.minutes > 0 ? `${l.minutes} min` : ''}{!l.has_content ? `${l.minutes > 0 ? ' · ' : ''}Not written yet` : ''}
                    </div>
                  </div>
                  {isEnrolled && <i className={`ph-bold ph-caret-${expanded ? 'up' : 'down'} text-sm text-muted-3`} />}
                </button>
                {expanded && (
                  <div className="px-3.5 pb-3.5">
                    <LessonBody lesson={l} />
                    {l.has_content && (
                      <button onClick={() => { setError(null); complete.mutate(l.id, { onError: (e) => setError(friendlyError(e)) }) }} disabled={done || complete.isPending}
                        className="mt-3 h-11 px-5 bg-ink text-cream rounded-lg text-[14.5px] font-semibold disabled:opacity-50">
                        {done ? 'Completed' : 'Mark as done'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {isEnrolled && (quiz.data?.length ?? 0) > 0 && !certificate && (
          finished
            ? <Quiz key={course.id} courseId={course.id} questions={quiz.data!} passMark={course.pass_mark} />
            : <Alert tone="info" className="mt-4">Finish every lesson to unlock the quiz. Score {course.pass_mark}% or more to earn the certificate.</Alert>
        )}

        {isEnrolled && (lessons ?? []).some((l) => l.body) && (
          <div className="mt-5">
            <AskAssistant task="lesson" input={{ course_id: course.id }} title="Ask about this course" placeholder="What does grain line mean?"
              note="Answered by an AI assistant from this course's lessons only. It will not give you the quiz answers." />
          </div>
        )}

        {error && <Alert className="mt-4">{error}</Alert>}
      </div>

      {!isEnrolled && (
        <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))] mt-5">
          {shortfall > 0 ? (
            <Button to={`/wallet/add?amount=${shortfall}&return=/courses/${course.id}`} className="w-full">
              Add {formatNaira(shortfall)} to enrol
            </Button>
          ) : (
            <Button onClick={join} loading={enroll.isPending} className="w-full">
              {course.price === 0 ? 'Enrol free' : `Enrol — ${formatNaira(course.price)}`}
            </Button>
          )}
        </div>
      )}
    </Screen>
  )
}

function LessonBody({ lesson }: { lesson: Lesson }) {
  const video = usePrivateMedia('course-media', lesson.video_path)
  if (!lesson.has_content) return <Alert tone="info">This lesson has not been written yet. It will count towards your progress once it has.</Alert>
  return (
    <>
      {lesson.video_path && (
        video.data
          ? <video controls playsInline preload="metadata" src={video.data} aria-label={lesson.title} className="w-full max-h-80 rounded-xl bg-ink" />
          : video.isError
            ? <button className="min-h-11 text-[14px] underline" onClick={() => void video.refetch()}>The video did not load. Retry</button>
            : <p className="text-[14px] text-muted">Loading video…</p>
      )}
      {lesson.video_url && (
        <a href={lesson.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 min-h-11 text-[14.5px] font-semibold text-brand-hover">
          <i className="ph-fill ph-play-circle" /> Watch the video
        </a>
      )}
      {lesson.body && <p className="mt-2 text-[14.5px] leading-[1.6] text-text-soft whitespace-pre-wrap">{lesson.body}</p>}
    </>
  )
}

function Quiz({ courseId, questions, passMark }: { courseId: string; questions: QuizQuestion[]; passMark: number }) {
  const submit = useSubmitQuiz()
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const complete = questions.every((q) => answers[q.id] !== undefined)

  return (
    <>
      <SectionLabel className="mt-6 mb-2.5">Quiz · {passMark}% to pass</SectionLabel>
      {result && (
        <Alert tone={result.passed ? 'success' : 'info'} className="mb-3">
          You got {result.correct} of {result.total} right ({result.score}%).{' '}
          {result.passed ? 'You passed: your certificate is ready above.' : 'Not a pass this time. Go back over the lessons and try again; you have three attempts a day.'}
        </Alert>
      )}
      {!result?.passed && (
        <form onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          try {
            setResult(await submit.mutateAsync({ courseId, answers: questions.map((q) => answers[q.id]) }))
            setAnswers({})
          } catch (err) { setError(friendlyError(err)) }
        }}>
          {questions.map((q, i) => (
            <fieldset key={q.id} className="bg-white border border-line rounded-2xl p-4 mb-3">
              <legend className="float-left w-full text-[15px] font-semibold text-ink mb-2">{i + 1}. {q.prompt}</legend>
              {q.options.map((option, index) => (
                <label key={index} className="flex items-center gap-3 min-h-11 text-[14.5px] text-ink clear-both">
                  <input type="radio" name={q.id} checked={answers[q.id] === index} onChange={() => setAnswers((a) => ({ ...a, [q.id]: index }))} className="w-5 h-5 accent-[var(--color-brand)]" />
                  {option}
                </label>
              ))}
            </fieldset>
          ))}
          {error && <Alert className="mb-3">{error}</Alert>}
          <Button type="submit" disabled={!complete} loading={submit.isPending}>Send my answers</Button>
        </form>
      )}
    </>
  )
}
