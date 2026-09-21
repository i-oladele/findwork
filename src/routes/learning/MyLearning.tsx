import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { QueryState } from '../../components/system/QueryState'
import { useCourses, useEnrollments } from '../../lib/api'

export function MyLearning() {
  const enrollments = useEnrollments()
  const { data: courses } = useCourses()

  const rows = enrollments.data?.flatMap((e) => {
    const course = courses?.find((c) => c.id === e.course_id)
    return course ? [{ ...e, course }] : []
  })

  return (
    <Screen bottomNav="customer">
      <PageHeader title="My learning" back="/courses" />
      <div className="px-[22px] pb-6">
        <QueryState
          query={{ ...enrollments, data: rows }}
          errorMessage="We could not load your courses."
          empty={{
            icon: 'ph-graduation-cap',
            title: 'Nothing enrolled yet',
            action: (
              <Link to="/courses" className="text-[15px] font-semibold text-brand-hover">
                Browse courses
              </Link>
            ),
          }}
        >
          {(list) =>
            list.map(({ course, progress }) => (
              <Link key={course.id} to={`/courses/${course.id}`} className="flex gap-3.5 bg-white border border-line rounded-2xl p-3.5 mt-3.5">
                <PlaceholderImage src={course.image_url ?? undefined} className="w-16 h-16 flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-[16px] text-ink leading-[1.25]">{course.title}</div>
                  {progress >= 100 ? (
                    <div className="mt-2">
                      <Badge tone="success" icon="certificate">Completed</Badge>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-[12.5px] text-muted mt-2 mb-1">
                        <span>Progress</span>
                        <span className="font-semibold text-ink">{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-line-soft rounded-full overflow-hidden">
                        <div className="h-full bg-brand rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                    </>
                  )}
                </div>
              </Link>
            ))
          }
        </QueryState>
      </div>
    </Screen>
  )
}
