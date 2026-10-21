import { supabase } from '../supabase'
import type { Language } from '../database.types'

export type AssistantTask = 'command' | 'support' | 'translate' | 'lesson' | 'dispute' | 'analytics'
export type DisputeSummary = { summary: string; agreed: string[]; contested: string[]; missing: string[]; questions: string[] }

export class AssistantUnavailable extends Error {}

/**
 * Asks the assistant Edge Function. Throws AssistantUnavailable when it has
 * not been set up (no API key), so each feature can fall back or hide.
 */
export async function askAssistant<T = { text: string }>(task: AssistantTask, input: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('assistant', { body: { task, input } })
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    const message = (detail as { error?: string } | null)?.error
    if (message) throw new Error(message)
    // The function is not deployed, or cannot be reached.
    throw new AssistantUnavailable('The assistant is not available yet.')
  }
  const reply = data as { configured?: boolean; declined?: boolean; result?: T; error?: string }
  if (reply.error) throw new Error(reply.error)
  if (!reply.configured) throw new AssistantUnavailable('The assistant is not set up yet.')
  if (reply.declined || !reply.result) throw new Error('The assistant could not help with that. Try wording it differently, or write to support.')
  return reply.result
}

export const translateMessage = (text: string, language: Language) => askAssistant('translate', { text, language }).then((r) => r.text)
