import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Course, CourseLesson, Enrollment } from '../database.types'

export function useCourses() {
  return useQuery({
    queryKey: keys.learning.courses(),
    queryFn: async (): Promise<Course[]> => {
      const { data, error } = await supabase.from('courses').select('*').order('title')
      if (error) throw error
      return data
    },
  })
}

export function useCourse(id: string | undefined) {
  return useQuery({
    queryKey: keys.learning.course(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Course> => {
      const { data, error } = await supabase.from('courses').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
  })
}

export function useCourseLessons(courseId: string | undefined) {
  return useQuery({
    queryKey: keys.learning.lessons(courseId ?? ''),
    enabled: Boolean(courseId),
    queryFn: async (): Promise<CourseLesson[]> => {
      const { data, error } = await supabase
        .from('course_lessons')
        .select('*')
        .eq('course_id', courseId!)
        .order('position')
      if (error) throw error
      return data
    },
  })
}

export function useEnrollments() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.learning.enrollments(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Enrollment[]> => {
      const { data, error } = await supabase.from('enrollments').select('*')
      if (error) throw error
      return data
    },
  })
}

export function useEnroll() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (courseId: string) => {
      const { error } = await supabase.rpc('enroll_in_course', { p_course_id: courseId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.learning.enrollments() })
    },
  })
}

/** Progress maths lives server-side so it cannot be forged from the client. */
export function useAdvanceProgress() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ courseId, lessonCount }: { courseId: string; lessonCount: number }) => {
      const { error } = await supabase.rpc('advance_progress', {
        p_course_id: courseId,
        p_lesson_count: lessonCount,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.learning.enrollments() })
    },
  })
}
