import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { AreaPicker } from '../../components/ui/AreaPicker'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { Input } from '../../components/ui/Input'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { TrustBadge } from '../../components/ui/TrustBadge'
import { QueryState } from '../../components/system/QueryState'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import {
  useApplyToInternship,
  useCloseInternship,
  useInternship,
  useInternshipApplications,
  useInternshipMatches,
  useMyInternships,
  usePostInternship,
  useUpdateInternshipApplication,
} from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { formatDate, formatNaira, parseNaira } from '../../lib/format'
import type { Internship, InternshipApplicationStatus } from '../../lib/database.types'

const STATUS: Record<InternshipApplicationStatus, { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  submitted: { label: 'Sent', tone: 'neutral' },
  shortlisted: { label: 'Shortlisted', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Not successful', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}

const pay = (i: Internship) => (i.stipend ? `${formatNaira(i.stipend)} a month` : 'Unpaid')

/** Internships that fit you first, and the ones you have posted. */
export function Internships() {
  const [tab, setTab] = useState<'find' | 'posted'>('find')
  const matches = useInternshipMatches()
  const posted = useMyInternships()
  return (
    <Screen>
      <PageHeader title="Internships" back="/courses" right={<Link to="/internships/new" className="text-[14.5px] font-semibold text-brand-hover">Post one</Link>} />
      <div className="px-[22px] pb-10">
        <div className="flex gap-2 mt-4">
          <Chip active={tab === 'find'} onClick={() => setTab('find')}>For you</Chip>
          <Chip active={tab === 'posted'} onClick={() => setTab('posted')}>Posted by me</Chip>
        </div>
        {tab === 'find' ? (
          <>
            <p className="mt-3 text-[13.5px] leading-[1.45] text-muted-2">
              Ordered by how much of what each asks for you have: the skills in your <Link to="/preferences" className="font-semibold text-brand-hover">preferences</Link>, your certificates and your trade.
            </p>
            <QueryState query={matches} errorMessage="We could not load internships." empty={{ icon: 'ph-briefcase', title: 'No internships open right now' }}>
              {(rows) => rows.map((i) => (
                <Link key={i.id} to={`/internships/${i.id}`} className="block bg-white border border-line rounded-2xl p-4 mt-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display font-semibold text-[16px] text-ink">{i.title}</span>
                    <Badge tone={i.match.score >= 60 ? 'success' : 'neutral'}>{i.match.score}% match</Badge>
                  </div>
                  <div className="text-[13.5px] text-text-soft mt-1">{i.company} · {i.location ?? i.area ?? 'Location not given'}</div>
                  <div className="text-[12.5px] text-muted-2 mt-1">{pay(i)}{i.duration ? ` · ${i.duration}` : ''}{i.applied ? ' · you applied' : ''}</div>
                </Link>
              ))}
            </QueryState>
          </>
        ) : (
          <QueryState query={posted} errorMessage="We could not load your internships." empty={{ icon: 'ph-briefcase', title: 'You have not posted an internship' }}>
            {(rows) => rows.map((i) => (
              <Link key={i.id} to={`/internships/${i.id}`} className="block bg-white border border-line rounded-2xl p-4 mt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold text-[16px] text-ink truncate">{i.title}</span>
                  <Badge tone={i.status === 'open' ? 'success' : 'neutral'}>{i.status}</Badge>
                </div>
                <div className="text-[12.5px] text-muted-2 mt-1">Posted {formatDate(i.created_at)}</div>
              </Link>
            ))}
          </QueryState>
        )}
      </div>
    </Screen>
  )
}

export function NewInternship() {
  const navigate = useNavigate()
  const post = usePostInternship()
  const [company, setCompany] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState('')
  const [area, setArea] = useState<string | null>(null)
  const [location, setLocation] = useState('')
  const [duration, setDuration] = useState('')
  const [stipend, setStipend] = useState('')
  const [closesOn, setClosesOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const valid = company.trim().length >= 2 && title.trim().length >= 3 && description.trim().length >= 20

  return (
    <Screen>
      <PageHeader title="Post an internship" back="/internships" icon="x" />
      <div className="px-[22px] pb-8 space-y-4">
        <p className="mt-3 text-[14.5px] leading-[1.5] text-muted">Applicants send a short note; you shortlist, accept or decline each one. You need a verified ID to post.</p>
        <Input label="Company or workshop" value={company} onChange={setCompany} autoCapitalize="words" />
        <Input label="Role" value={title} onChange={setTitle} placeholder="Tailoring intern" />
        <label className="block text-[14px] text-text-soft">What the intern will do and learn
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={4000} className="block w-full mt-1.5 bg-white border-[1.5px] border-line rounded-lg p-3.5 text-[15px] text-ink outline-none" />
        </label>
        <Input label="Skills you are looking for" value={skills} onChange={setSkills} placeholder="sewing, pattern cutting" autoCapitalize="none" hint="Separate with commas. Applicants are matched against these." />
        <AreaPicker value={area} onChange={setArea} label="Area" />
        <Input label="Address or landmark (optional)" value={location} onChange={setLocation} />
        <div className="flex gap-3">
          <div className="flex-1"><Input label="Length" value={duration} onChange={setDuration} placeholder="3 months" /></div>
          <div className="flex-1"><Input label="Monthly stipend (₦)" value={stipend} onChange={setStipend} type="tel" placeholder="Unpaid" /></div>
        </div>
        <label className="block text-[14px] text-text-soft">Applications close (optional)
          <input type="date" value={closesOn} onChange={(e) => setClosesOn(e.target.value)} className="block w-full mt-1.5 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5 text-ink" />
        </label>
        {error && <Alert>{error}</Alert>}
        <Button disabled={!valid} loading={post.isPending} onClick={async () => {
          setError(null)
          try {
            const id = await post.mutateAsync({
              company: company.trim(), title: title.trim(), description: description.trim(),
              skills: skills.split(',').map((s) => s.trim()).filter(Boolean), area, location: location.trim(), duration: duration.trim(),
              stipend: parseNaira(stipend) || null, closesOn: closesOn || null,
            })
            navigate(`/internships/${id}`, { replace: true })
          } catch (err) { setError(friendlyError(err)) }
        }}>Post internship</Button>
      </div>
    </Screen>
  )
}

export function InternshipDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: internship, isLoading } = useInternship(id)
  const applications = useInternshipApplications(id)
  const matches = useInternshipMatches()
  const apply = useApplyToInternship()
  const update = useUpdateInternshipApplication()
  const close = useCloseInternship()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <FullScreenLoader />
  if (!internship) return <Screen><PageHeader title="Internship" back="/internships" /><EmptyState icon="ph-briefcase" title="Internship not found" body="It may have closed." /></Screen>

  const mine = internship.employer_id === user?.id
  const myApplication = applications.data?.find((a) => a.applicant_id === user?.id)
  const match = matches.data?.find((m) => m.id === internship.id)?.match
  const run = (action: Promise<unknown>) => { setError(null); action.catch((err) => setError(friendlyError(err))) }

  return (
    <Screen>
      <PageHeader title="Internship" back="/internships" />
      <div className="px-[22px] pb-10">
        <h2 className="mt-3 font-display font-bold text-[22px] leading-[1.15] text-ink">{internship.title}</h2>
        <div className="text-[14.5px] text-text-soft mt-1">{internship.company} · {internship.location ?? internship.area ?? 'Location not given'}</div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Badge tone={internship.stipend ? 'success' : 'neutral'}>{pay(internship)}</Badge>
          {internship.duration && <Badge tone="neutral">{internship.duration}</Badge>}
          {internship.closes_on && <Badge tone="neutral">Closes {formatDate(internship.closes_on)}</Badge>}
          {internship.status === 'closed' && <Badge tone="neutral">Closed</Badge>}
        </div>
        <p className="mt-4 text-[15px] leading-[1.6] text-text-soft whitespace-pre-wrap">{internship.description}</p>

        {internship.skills.length > 0 && (
          <>
            <SectionLabel className="mt-5 mb-2.5">Skills asked for</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {internship.skills.map((s) => {
                const have = match?.matched.some((m) => m.toLowerCase() === s.toLowerCase())
                return <Badge key={s} tone={have ? 'success' : 'neutral'} icon={have ? 'check' : undefined}>{s}</Badge>
              })}
            </div>
            {match && !mine && <p className="mt-2 text-[13px] text-muted-2">{match.score}% match: {match.matched.length} of {internship.skills.length} skills{match.same_area ? ', and in your area' : ''}.</p>}
          </>
        )}

        {error && <Alert className="mt-4">{error}</Alert>}

        {mine ? (
          <>
            <SectionLabel className="mt-6 mb-2.5">Applications, best match first</SectionLabel>
            <QueryState query={applications} errorMessage="We could not load applications." empty={{ icon: 'ph-tray', title: 'No applications yet' }}>
              {(rows) => rows.map((a) => (
                <div key={a.id} className="bg-white border border-line rounded-2xl p-4 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-semibold text-[15.5px] text-ink truncate">{a.applicant?.full_name || 'Applicant'}</span>
                    <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Badge tone={a.match_score >= 60 ? 'success' : 'neutral'}>{a.match_score}% match</Badge>
                    <TrustBadge tier={a.applicant?.verification_tier} score={a.applicant?.trust_score} />
                  </div>
                  {a.matched_skills.length > 0 && <div className="text-[12.5px] text-muted-2 mt-1.5">Has: {a.matched_skills.join(', ')}</div>}
                  <p className="mt-2 text-[14px] leading-[1.5] text-text-soft whitespace-pre-wrap">{a.cover_note}</p>
                  {(a.status === 'submitted' || a.status === 'shortlisted') && (
                    <div className="flex flex-wrap gap-x-5 mt-1 text-[14px] font-semibold">
                      {a.status === 'submitted' && <button disabled={update.isPending} className="min-h-11 text-brand" onClick={() => run(update.mutateAsync({ id: a.id, status: 'shortlisted' }))}>Shortlist</button>}
                      <button disabled={update.isPending} className="min-h-11 text-success-text" onClick={() => { if (window.confirm(`Accept ${a.applicant?.full_name ?? 'this applicant'}?`)) run(update.mutateAsync({ id: a.id, status: 'accepted' })) }}>Accept</button>
                      <button disabled={update.isPending} className="min-h-11 text-muted" onClick={() => run(update.mutateAsync({ id: a.id, status: 'rejected' }))}>Decline</button>
                      <Link to={`/chat/with/${a.applicant_id}`} className="min-h-11 inline-flex items-center text-brand-hover">Message</Link>
                    </div>
                  )}
                </div>
              ))}
            </QueryState>
            {internship.status === 'open' && (
              <button disabled={close.isPending} className="w-full min-h-11 mt-2 text-[14.5px] font-semibold text-muted" onClick={() => { if (window.confirm('Close this internship to new applications?')) run(close.mutateAsync(internship.id)) }}>Close to new applications</button>
            )}
          </>
        ) : myApplication ? (
          <div className="bg-white border border-line rounded-2xl p-4 mt-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold text-ink">Your application</span>
              <Badge tone={STATUS[myApplication.status].tone}>{STATUS[myApplication.status].label}</Badge>
            </div>
            <p className="mt-2 text-[14px] leading-[1.5] text-text-soft whitespace-pre-wrap">{myApplication.cover_note}</p>
            {(myApplication.status === 'submitted' || myApplication.status === 'shortlisted') && (
              <button disabled={update.isPending} className="min-h-11 mt-1 text-[14px] font-semibold text-muted" onClick={() => { if (window.confirm('Withdraw your application?')) run(update.mutateAsync({ id: myApplication.id, status: 'withdrawn' })) }}>Withdraw</button>
            )}
          </div>
        ) : internship.status === 'open' ? (
          <>
            <SectionLabel className="mt-6 mb-2.5">Apply</SectionLabel>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} maxLength={2000} aria-label="Why you are applying"
              placeholder="Why you want this, and what you can already do. A couple of sentences is enough."
              className="w-full bg-white border-[1.5px] border-line rounded-lg p-3.5 text-[15px] leading-[1.5] text-ink outline-none" />
            <Button className="mt-3" disabled={note.trim().length < 20} loading={apply.isPending} onClick={() => run(apply.mutateAsync({ internshipId: internship.id, coverNote: note }))}>Send application</Button>
          </>
        ) : (
          <Alert tone="info" className="mt-5">This internship is no longer taking applications.</Alert>
        )}
      </div>
    </Screen>
  )
}
