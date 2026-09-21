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
    queryFn: async (): Promise<Course | null> => {
      const { data, error } = await supabase.from('courses').select('*').eq('id', id!).maybeSingle()
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
      const { data, error } = await supabase.from('enrollments').select('*').eq('profile_id', user!.id)
      if (error) throw error
      return data
    },
  })
}

/** Lesson ids the signed-in user has completed, across all courses. */
export function useLessonCompletions() {
  const { user } = useAuth()

  return useQuery({
    queryKey: keys.learning.completions(),
    enabled: Boolean(user),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('lesson_completions').select('lesson_id').eq('profile_id', user!.id)
      if (error) throw error
      return new Set(data.map((r) => r.lesson_id))
    },
  })
}

/** Paid courses are charged to the wallet; enrolling twice never charges twice. */
export function useEnroll() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (courseId: string) => {
      const { error } = await supabase.rpc('enroll_in_course', { p_course_id: courseId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.learning.enrollments() })
      qc.invalidateQueries({ queryKey: keys.wallet.all })
    },
  })
}

/** Progress is recounted server-side from completed lessons. Returns the new percentage. */
export function useCompleteLesson() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (lessonId: string): Promise<number> => {
      const { data, error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.learning.enrollments() })
      qc.invalidateQueries({ queryKey: keys.learning.completions() })
    },
  })
}
