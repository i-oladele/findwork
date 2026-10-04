import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Certificate, Course, Enrollment, QuizQuestion } from '../database.types'

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

/** A lesson as the caller may see it: the material is filled in only for someone enrolled. */
export type Lesson = {
  id: string; course_id: string; title: string; minutes: number; position: number
  has_content: boolean; body: string | null; video_path: string | null; video_url: string | null
}

export function useCourseLessons(courseId: string | undefined) {
  return useQuery({
    queryKey: keys.learning.lessons(courseId ?? ''),
    enabled: Boolean(courseId),
    queryFn: async (): Promise<Lesson[]> => {
      const { data, error } = await supabase.rpc('course_content', { p_course_id: courseId! })
      if (error) throw error
      return (data as unknown as Lesson[]) ?? []
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
    onSuccess: (_d, courseId) => {
      qc.invalidateQueries({ queryKey: keys.learning.enrollments() })
      // Enrolling unlocks the material and the quiz.
      qc.invalidateQueries({ queryKey: keys.learning.lessons(courseId) })
      qc.invalidateQueries({ queryKey: keys.learning.quiz(courseId) })
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
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })
}

/** The quiz, without its answers. Empty when the course has none or the caller is not enrolled. */
export function useQuizQuestions(courseId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.learning.quiz(courseId ?? ''),
    enabled: enabled && Boolean(courseId),
    queryFn: async (): Promise<QuizQuestion[]> => {
      const { data, error } = await supabase.from('quiz_questions').select('id, course_id, position, prompt, options').eq('course_id', courseId!).order('position')
      if (error) throw error
      return data
    },
  })
}

export type QuizResult = { score: number; passed: boolean; correct: number; total: number; pass_mark: number }

export function useSubmitQuiz() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { courseId: string; answers: number[] }): Promise<QuizResult> => {
      const { data, error } = await supabase.rpc('submit_quiz', { p_course_id: input.courseId, p_answers: input.answers })
      if (error) throw error
      return data as unknown as QuizResult
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['certificates'] }),
  })
}

/** The certificates someone holds: your own, or those shown on a profile. */
export function useCertificates(profileId: string | undefined) {
  return useQuery({
    queryKey: keys.learning.certificates(profileId ?? ''),
    enabled: Boolean(profileId),
    queryFn: async (): Promise<Certificate[]> => {
      const { data, error } = await supabase.from('certificates').select('*').eq('profile_id', profileId!).order('issued_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export type VerifiedCertificate = { code: string; holder_name: string; course_title: string; score: number | null; issued_at: string }

/** Checks a certificate code. Works signed out. */
export async function verifyCertificate(code: string): Promise<VerifiedCertificate | null> {
  const { data, error } = await supabase.rpc('verify_certificate', { p_code: code })
  if (error) throw error
  return (data as unknown as VerifiedCertificate | null) ?? null
}

/* ---- Authoring, for content staff ---------------------------------------- */

export type LessonDraft = { id?: string; title: string; minutes: number; body: string; video_path: string | null; video_url: string }
export type QuestionDraft = { prompt: string; options: string[]; correct_index: number }
export type CourseDraft = {
  id: string | null; title: string; category: string; instructor: string; description: string; price: number
  passMark: number; status: 'draft' | 'live'; lessons: LessonDraft[]; questions: QuestionDraft[]
}

export function useSaveCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: CourseDraft): Promise<string> => {
      const { data, error } = await supabase.rpc('admin_save_course', {
        p_id: draft.id, p_title: draft.title, p_category: draft.category, p_instructor: draft.instructor, p_description: draft.description,
        p_price: draft.price, p_pass_mark: draft.passMark, p_status: draft.status, p_lessons: draft.lessons, p_questions: draft.questions,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.learning.courses() }),
  })
}

/** The quiz with its answers, for the editor. */
export async function loadCourseQuiz(courseId: string): Promise<QuestionDraft[]> {
  const { data, error } = await supabase.rpc('admin_course_quiz', { p_course_id: courseId })
  if (error) throw error
  return (data as unknown as QuestionDraft[]) ?? []
}

/** Uploads a lesson video; returns the path to store on the lesson. */
export async function uploadLessonVideo(file: File): Promise<string> {
  if (!['video/mp4', 'video/webm'].includes(file.type)) throw new Error('Choose an MP4 or WebM video.')
  if (file.size > 100 * 1024 * 1024) throw new Error('That video is over 100 MB. Compress it, or host it elsewhere and paste the link.')
  const path = `lessons/${crypto.randomUUID()}.${file.type === 'video/webm' ? 'webm' : 'mp4'}`
  const { error } = await supabase.storage.from('course-media').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}
