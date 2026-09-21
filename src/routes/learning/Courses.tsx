import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Chip } from '../../components/ui/Chip'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { StarRating } from '../../components/ui/StarRating'
import { QueryState } from '../../components/system/QueryState'
import { useCourses, useEnrollments } from '../../lib/api'
import { formatNaira } from '../../lib/format'

const TABS = ['Courses', 'Internships'] as const

export function Courses() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Courses')
  const courses = useCourses()
  const { data: enrollments } = useEnrollments()
  const enrolled = new Set((enrollments ?? []).map((e) => e.course_id))
  const filtered = courses.data?.filter((c) => (tab === 'Courses' ? c.kind === 'course' : c.kind === 'internship'))

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-1.5 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-[28px] tracking-[-0.03em] text-ink">Learn & certify</h2>
          <Link to="/learning" aria-label="My learning" className="inline-flex items-center justify-center w-11 h-11 text-ink">
            <i className="ph ph-graduation-cap text-xl" />
          </Link>
        </div>
        <p className="mt-1.5 text-[14px] text-muted">Build a skill, then show it on your provider profile.</p>

        <div className="flex gap-1.5 bg-line-soft rounded-lg p-1 mt-3.5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 h-10 rounded-md text-[14.5px] ${tab === t ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <QueryState
          query={{ ...courses, data: filtered }}
          errorMessage="We could not load courses."
          empty={{ icon: 'ph-graduation-cap', title: tab === 'Courses' ? 'No courses yet' : 'No internships yet' }}
        >
          {(list) =>
            list.map((c) => (
              <Link key={c.id} to={`/courses/${c.id}`} className="flex gap-3.5 bg-white border border-line rounded-2xl p-3.5 mt-3.5">
                <PlaceholderImage src={c.image_url ?? undefined} className="w-16 h-16 flex-none" />
                <div className="flex-1 min-w-0">
                  <Chip>{c.category}</Chip>
                  <div className="font-display font-semibold text-[16px] text-ink mt-2 leading-[1.25]">{c.title}</div>
                  <div className="flex items-center justify-between mt-1.5">
                    <StarRating rating={Number(c.rating)} />
                    <span className="font-display font-bold text-[15px] text-ink">
                      {enrolled.has(c.id) ? 'Enrolled' : c.price === 0 ? 'Free' : formatNaira(c.price)}
                    </span>
                  </div>
                </div>
              </Link>
            ))
          }
        </QueryState>
      </div>
    </Screen>
  )
}
