import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Alert } from '../../components/ui/Alert'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { StarRating } from '../../components/ui/StarRating'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import {
  useCompleteLesson,
  useCourse,
  useCourseLessons,
  useEnroll,
  useEnrollments,
  useLessonCompletions,
  useWalletSummary,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatNaira } from '../../lib/format'

export function CourseDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: course, isLoading } = useCourse(id)
  const { data: lessons } = useCourseLessons(id)
  const { data: enrollments } = useEnrollments()
  const { data: completed } = useLessonCompletions()
  const { data: wallet } = useWalletSummary()
  const enroll = useEnroll()
  const complete = useCompleteLesson()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  if (isLoading) return <FullScreenLoader />
  if (!course) {
    return (
      <Screen>
        <PageHeader title="Course" back="/courses" />
        <EmptyState icon="ph-graduation-cap" title="Course not found" />
      </Screen>
    )
  }

  const enrollment = enrollments?.find((e) => e.course_id === course.id)
  const isEnrolled = Boolean(enrollment)
  const shortfall = Math.max(0, course.price - (wallet?.balance ?? 0))

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
      <PageHeader title={course.kind === 'internship' ? 'Internship' : 'Course'} back="/courses" />
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

        <SectionLabel className="mt-5 mb-2.5">{course.kind === 'internship' ? 'Programme' : 'Lessons'}</SectionLabel>
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {(lessons ?? []).map((l, i, arr) => {
            const done = completed?.has(l.id) ?? false
            const expanded = open === l.id
            return (
              <div key={l.id} className={i < arr.length - 1 ? 'border-b border-line-soft' : ''}>
                <button
                  disabled={!isEnrolled}
                  onClick={() => setOpen(expanded ? null : l.id)}
                  className="w-full flex items-center gap-3.5 p-3.5 text-left disabled:cursor-default"
                >
                  <i
                    className={`text-xl ${
                      done ? 'ph-fill ph-check-circle text-success' : isEnrolled ? 'ph-fill ph-play-circle text-brand' : 'ph ph-lock-simple text-muted-2'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold text-ink">{l.title}</div>
                    {l.minutes > 0 && <div className="text-[12.5px] text-muted-2 mt-0.5">{l.minutes} min</div>}
                  </div>
                  {isEnrolled && <i className={`ph-bold ph-caret-${expanded ? 'up' : 'down'} text-sm text-muted-3`} />}
                </button>
                {expanded && (
                  <div className="px-3.5 pb-3.5">
                    {l.body ? (
                      <p className="text-[14.5px] leading-[1.6] text-text-soft whitespace-pre-wrap">{l.body}</p>
                    ) : (
                      <Alert tone="info">This lesson's material is still being written. You can still mark it done.</Alert>
                    )}
                    <button
                      onClick={() => complete.mutate(l.id, { onError: (e) => setError(friendlyError(e)) })}
                      disabled={done || complete.isPending}
                      className="mt-3 h-11 px-5 bg-ink text-cream rounded-lg text-[14.5px] font-semibold disabled:opacity-50"
                    >
                      {done ? 'Completed' : 'Mark as done'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

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
              {course.kind === 'internship' ? 'Apply now' : course.price === 0 ? 'Enrol free' : `Enrol — ${formatNaira(course.price)}`}
            </Button>
          )}
        </div>
      )}
    </Screen>
  )
}
