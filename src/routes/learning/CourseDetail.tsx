import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { StarRating } from '../../components/ui/StarRating'
import { courses, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function CourseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const course = courses.find((c) => c.id === id) ?? courses[0]
  const enrollment = useAppStore((s) => s.enrollments[course.id])
  const enrollInCourse = useAppStore((s) => s.enrollInCourse)
  const advanceProgress = useAppStore((s) => s.advanceProgress)
  const enrolled = !!enrollment

  function continueLearning() {
    advanceProgress(course.id, course.lessons.length)
    navigate('/learning')
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-[22px] pt-1.5">
        <Link to="/courses" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
          <i className="ph-bold ph-arrow-left text-[22px]" />
        </Link>

        <div className="flex gap-3.5 mt-2">
          <PlaceholderImage className="w-20 h-20 flex-none" />
          <div className="flex-1">
            <h2 className="font-display font-bold text-[22px] leading-[1.15] tracking-[-0.02em] text-ink">{course.title}</h2>
            <div className="text-[13px] text-muted-2 mt-1">{course.instructor}</div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <StarRating rating={course.rating} reviews={course.enrolled} />
          <span className="font-display font-bold text-xl text-ink">
            {course.price === 0 ? 'Free' : formatNaira(course.price)}
          </span>
        </div>

        <p className="mt-4 text-[15px] leading-[1.6] text-text-soft">{course.description}</p>

        {enrolled && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[13.5px] text-muted mb-1.5">
              <span>Your progress</span>
              <span className="font-semibold text-ink">{enrollment.progress}%</span>
            </div>
            <div className="h-2 bg-line-soft rounded-full overflow-hidden">
              <div className="h-full bg-brand rounded-full" style={{ width: `${enrollment.progress}%` }} />
            </div>
          </div>
        )}

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">
          {course.kind === 'internship' ? 'Programme' : 'Lessons'}
        </div>
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          {course.lessons.map((l, i) => (
            <div key={l.title} className={`flex items-center gap-3.5 p-3.5 ${i < course.lessons.length - 1 ? 'border-b border-line-soft' : ''}`}>
              <i className={`${enrolled ? 'ph-fill ph-play-circle text-brand' : 'ph ph-lock-simple text-muted-2'} text-xl`} />
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-ink">{l.title}</div>
                {l.minutes > 0 && <div className="text-[12.5px] text-muted-2 mt-0.5">{l.minutes} min</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
        {enrolled ? (
          <button
            onClick={continueLearning}
            className="flex items-center justify-center w-full h-14 bg-ink text-cream rounded-xl font-semibold text-[17px]"
          >
            {enrollment.progress >= 100 ? 'Review course' : 'Continue learning'}
          </button>
        ) : (
          <button
            onClick={() => enrollInCourse(course.id)}
            className="flex items-center justify-center w-full h-14 bg-brand text-white rounded-xl font-semibold text-[17px]"
          >
            {course.kind === 'internship' ? 'Apply now' : course.price === 0 ? 'Enroll free' : `Enroll — ${formatNaira(course.price)}`}
          </button>
        )}
      </div>
    </Screen>
  )
}
