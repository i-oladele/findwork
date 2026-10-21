import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track, VideoPresets, type LocalVideoTrack, type RemoteTrack } from 'livekit-client'
import { closeStreamRoom, joinStreamRoom } from '../../lib/api/social'

/**
 * Video carried by FindWork, through LiveKit. Loaded only on a stream's page
 * (the client library is large), from Live.tsx with React.lazy.
 */

function describe(err: unknown): string {
  const name = (err as { name?: string }).name
  if (name === 'NotAllowedError') return 'FindWork was not allowed to use the camera and microphone. Allow them in your browser settings and try again.'
  if (name === 'NotFoundError') return 'No camera was found on this device.'
  return err instanceof Error ? err.message : 'The video could not start. Try again.'
}

/** The seller's camera and microphone, broadcast to the stream's room. */
export function LiveBroadcast({ streamId, ended }: { streamId: string; ended: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const roomRef = useRef<Room | null>(null)
  const [state, setState] = useState<'off' | 'starting' | 'on'>('off')
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')

  async function start() {
    setState('starting')
    setError(null)
    try {
      const access = await joinStreamRoom(streamId)
      const room = new Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: VideoPresets.h720.resolution } })
      roomRef.current = room
      room.on(RoomEvent.Disconnected, () => setState('off'))
      await room.connect(access.url, access.token)
      await room.localParticipant.setCameraEnabled(true, { facingMode: facing })
      await room.localParticipant.setMicrophoneEnabled(true)
      const camera = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack
      if (camera && videoRef.current) camera.attach(videoRef.current)
      setState('on')
    } catch (err) {
      setError(describe(err))
      setState('off')
      await roomRef.current?.disconnect()
      roomRef.current = null
    }
  }

  async function flip() {
    const next = facing === 'user' ? 'environment' : 'user'
    const camera = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack | undefined
    try {
      await camera?.restartTrack({ facingMode: next })
      setFacing(next)
    } catch (err) {
      setError(describe(err))
    }
  }

  async function toggleMic() {
    await roomRef.current?.localParticipant.setMicrophoneEnabled(muted)
    setMuted(!muted)
  }

  // Ending the stream stops the camera and closes the room for everyone.
  useEffect(() => {
    if (!ended) return
    void roomRef.current?.disconnect()
    roomRef.current = null
    void closeStreamRoom(streamId)
  }, [ended, streamId])
  useEffect(() => () => { void roomRef.current?.disconnect() }, [])

  if (ended) return null
  return (
    <div className="bg-ink rounded-2xl overflow-hidden">
      <div className="relative">
        <video ref={videoRef} autoPlay playsInline muted aria-label="Your camera" className={`w-full max-h-[55vh] bg-ink ${facing === 'user' ? '-scale-x-100' : ''} ${state === 'on' ? '' : 'hidden'}`} />
        {state === 'on' && <span className="absolute top-3 left-3 bg-danger text-white rounded-full px-2.5 py-1 text-[11.5px] font-bold">ON AIR</span>}
      </div>
      {state !== 'on' && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 px-6 text-center text-cream">
          <i className="ph-fill ph-video-camera text-[40px] text-brand" />
          <button onClick={start} disabled={state === 'starting'} className="mt-1 px-5 h-11 bg-brand text-white rounded-lg text-[14.5px] font-semibold disabled:opacity-60">
            {state === 'starting' ? 'Starting the camera…' : 'Start my camera'}
          </button>
          <span className="text-[12.5px] text-muted-3">Viewers see you once you go live. Keep this page open while you sell.</span>
        </div>
      )}
      {state === 'on' && (
        <div className="flex gap-2 p-2.5">
          <button onClick={flip} className="flex-1 h-11 rounded-lg bg-ink-soft text-cream text-[13.5px] font-semibold"><i className="ph ph-camera-rotate" /> Switch camera</button>
          <button onClick={toggleMic} aria-pressed={muted} className="flex-1 h-11 rounded-lg bg-ink-soft text-cream text-[13.5px] font-semibold">
            <i className={`ph ${muted ? 'ph-microphone-slash' : 'ph-microphone'}`} /> {muted ? 'Unmute' : 'Mute'}
          </button>
        </div>
      )}
      {error && <p role="alert" className="px-4 pb-3 text-[13px] text-warning-bg">{error}</p>}
    </div>
  )
}

/** The seller's video, for viewers. Sound starts on a tap where the browser requires one. */
export function LiveWatch({ streamId }: { streamId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLDivElement>(null)
  const roomRef = useRef<Room | null>(null)
  const [state, setState] = useState<'connecting' | 'waiting' | 'playing' | 'off'>('connecting')
  const [needsTap, setNeedsTap] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const room = new Room({ adaptiveStream: true })
    roomRef.current = room
    const attachTrack = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video && videoRef.current) {
        track.attach(videoRef.current)
        setState('playing')
      } else if (track.kind === Track.Kind.Audio && audioRef.current) {
        audioRef.current.appendChild(track.attach())
      }
    }
    room
      .on(RoomEvent.TrackSubscribed, (track) => attachTrack(track))
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach()
        if (track.kind === Track.Kind.Video) setState('waiting')
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsTap(!room.canPlaybackAudio))
      .on(RoomEvent.Disconnected, () => { if (!cancelled) setState('off') })

    joinStreamRoom(streamId)
      .then((access) => room.connect(access.url, access.token))
      .then(() => {
        if (cancelled) return
        setNeedsTap(!room.canPlaybackAudio)
        const tracks = [...room.remoteParticipants.values()].flatMap((p) => [...p.trackPublications.values()])
        const video = tracks.find((t) => t.track && t.kind === Track.Kind.Video)
        if (video?.track) attachTrack(video.track as RemoteTrack)
        else setState('waiting')
        tracks.filter((t) => t.track && t.kind === Track.Kind.Audio).forEach((t) => attachTrack(t.track as RemoteTrack))
      })
      .catch((err) => { if (!cancelled) { setError(describe(err)); setState('off') } })

    return () => {
      cancelled = true
      void room.disconnect()
    }
  }, [streamId, attempt])

  return (
    <div className="relative bg-ink rounded-2xl overflow-hidden">
      <video ref={videoRef} autoPlay playsInline aria-label="The seller's live video" className={`w-full max-h-[55vh] bg-ink ${state === 'playing' ? '' : 'hidden'}`} />
      <div ref={audioRef} className="hidden" />
      {state !== 'playing' && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 px-6 text-center text-cream">
          {state === 'off' ? (
            <>
              <i className="ph-fill ph-wifi-slash text-[36px] text-brand" />
              <span className="text-[14px]">{error ?? 'The video stopped.'}</span>
              <button onClick={() => { setError(null); setState('connecting'); setAttempt((n) => n + 1) }} className="mt-1 px-5 h-11 bg-brand text-white rounded-lg text-[14.5px] font-semibold">Reconnect</button>
            </>
          ) : (
            <>
              <i className="ph-fill ph-broadcast text-[36px] text-brand animate-pulse" />
              <span className="text-[14px]">{state === 'connecting' ? 'Connecting to the video…' : 'Waiting for the seller’s camera…'}</span>
            </>
          )}
        </div>
      )}
      {needsTap && state === 'playing' && (
        <button onClick={() => void roomRef.current?.startAudio()} className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 h-10 bg-white text-ink rounded-full text-[13.5px] font-semibold shadow">
          <i className="ph-fill ph-speaker-high" /> Tap for sound
        </button>
      )}
    </div>
  )
}
