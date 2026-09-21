import type { ChatMessage } from './database.types'

export const MAX_CHAT_BYTES = 20 * 1024 * 1024
export const MAX_VOICE_SECONDS = 60
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/webm': 'webm', 'audio/mp4': 'm4a',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'application/pdf': 'pdf',
}
export const CHAT_ACCEPT = Object.keys(EXTENSIONS).join(',')

export function chatFileInfo(file: Pick<File, 'size' | 'type'>) {
  const mime = file.type.split(';')[0].trim().toLowerCase()
  const extension = EXTENSIONS[mime]
  if (!extension) throw new Error('Choose a photo, video, audio recording or PDF.')
  if (file.size === 0) throw new Error('This file is empty. Choose another one.')
  if (file.size > MAX_CHAT_BYTES) throw new Error('Attachments must be 20 MB or smaller.')
  return { mime, extension }
}

export function messagePreview(message: Pick<ChatMessage, 'text' | 'kind'>): string {
  if (message.text) return message.text
  return { voice: 'Voice message', image: 'Photo', video: 'Video', file: 'Document', text: '' }[message.kind]
}

export function recordingMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
    .find((mime) => MediaRecorder.isTypeSupported(mime))
}
