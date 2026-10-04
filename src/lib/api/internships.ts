import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../authContext'
import { keys } from './keys'
import type { Internship, InternshipApplication, InternshipApplicationStatus } from '../database.types'

export type InternshipMatch = Internship & { match: { score: number; matched: string[]; same_area: boolean }; applied: boolean }
export type ApplicationWithApplicant = InternshipApplication & { applicant: { full_name: string; verification_tier: number; trust_score: number } | null }

function useInvalidateInternships() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: keys.learning.internships() })
}

/** Open internships with how well each fits you, best first. */
export function useInternshipMatches() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...keys.learning.internships(), 'matches'],
    enabled: Boolean(user),
    queryFn: async (): Promise<InternshipMatch[]> => {
      const { data, error } = await supabase.rpc('internship_matches')
      if (error) throw error
      return (data as unknown as InternshipMatch[]) ?? []
    },
  })
}

export function useMyInternships() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...keys.learning.internships(), 'posted'],
    enabled: Boolean(user),
    queryFn: async (): Promise<Internship[]> => {
      const { data, error } = await supabase.from('internships').select('*').eq('employer_id', user!.id).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useInternship(id: string | undefined) {
  return useQuery({
    queryKey: keys.learning.internship(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Internship | null> => {
      const { data, error } = await supabase.from('internships').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** The employer sees every application; an applicant sees only their own. */
export function useInternshipApplications(internshipId: string | undefined) {
  return useQuery({
    queryKey: keys.learning.applications(internshipId ?? ''),
    enabled: Boolean(internshipId),
    queryFn: async (): Promise<ApplicationWithApplicant[]> => {
      const { data, error } = await supabase.from('internship_applications')
        .select('*, applicant:profiles!internship_applications_applicant_id_fkey(full_name, verification_tier, trust_score)')
        .eq('internship_id', internshipId!).order('match_score', { ascending: false })
      if (error) throw error
      return data as unknown as ApplicationWithApplicant[]
    },
  })
}

export function usePostInternship() {
  const invalidate = useInvalidateInternships()
  return useMutation({
    mutationFn: async (input: {
      company: string; title: string; description: string; skills: string[]; area: string | null; location: string
      duration: string; stipend: number | null; closesOn: string | null
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('post_internship', {
        p_company: input.company, p_title: input.title, p_description: input.description, p_skills: input.skills, p_area: input.area,
        p_location: input.location || null, p_duration: input.duration || null, p_stipend: input.stipend, p_closes_on: input.closesOn,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useCloseInternship() {
  const invalidate = useInvalidateInternships()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('close_internship', { p_internship_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useApplyToInternship() {
  const invalidate = useInvalidateInternships()
  return useMutation({
    mutationFn: async (input: { internshipId: string; coverNote: string }) => {
      const { error } = await supabase.rpc('apply_to_internship', { p_internship_id: input.internshipId, p_cover_note: input.coverNote })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useUpdateInternshipApplication() {
  const invalidate = useInvalidateInternships()
  return useMutation({
    mutationFn: async (input: { id: string; status: InternshipApplicationStatus }) => {
      const { error } = await supabase.rpc('update_internship_application', { p_application_id: input.id, p_status: input.status })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSaveSkills() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (skills: string[]) => {
      const { error } = await supabase.rpc('save_skills', { p_skills: skills })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.preferences.mine() })
      qc.invalidateQueries({ queryKey: keys.learning.internships() })
    },
  })
}
