import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { Badge } from '../../components/ui/Badge'
import { courses } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function MyLearning() {
  const enrollments = useAppStore((s) => s.enrollments)
  const entries = Object.entries(enrollments)
    .map(([courseId, e]) => ({ course: courses.find((c) => c.id === courseId), ...e }))
    .filter((e): e is typeof e & { course: NonNullable<typeof e.course> } => !!e.course)

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <div className="flex items-center gap-1.5">
          <Link to="/courses" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <span className="font-display font-semibold text-[17px] text-ink">My learning</span>
        </div>

        {entries.length === 0 ? (
          <div className="bg-white border border-line rounded-2xl p-8 mt-6 text-center">
            <p className="text-sm text-muted">You haven't enrolled in anything yet.</p>
            <Link to="/courses" className="inline-block mt-3 text-sm font-semibold text-brand-hover">
              Browse courses
            </Link>
          </div>
        ) : (
          entries.map(({ course, progress }) => (
            <Link key={course.id} to={`/courses/${course.id}`} className="flex gap-3.5 bg-white border border-line rounded-2xl p-3.5 mt-3.5">
              <PlaceholderImage className="w-16 h-16 flex-none" />
              <div className="flex-1">
                <div className="font-display font-semibold text-[16px] text-ink leading-[1.25]">{course.title}</div>
                {progress >= 100 ? (
                  <div className="mt-2">
                    <Badge tone="success" icon="certificate">Certificate earned</Badge>
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
        )}
      </div>
    </Screen>
  )
}
