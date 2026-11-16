import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Clipboard, Eye, EyeOff, MessageSquare, MonitorPlay, Pause, Play, Plus, RotateCcw, ShieldCheck, UsersRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { Button, Card, Chip, EmptyState, Metric, PageTitle } from '../../components/ui.jsx';
import { createId, studentInviteUrl } from '../../services/mockApi.js';
import { studentGradeSummary, officialRankings } from '../../services/grading.js';
import { getStudentInvitationStatus } from './teacherRepository.js';
import { SectionSummary, StudentDetailModal, SubmissionCard, Modal, QuizEditor, ExerciseEditor } from './TeacherComponents.jsx';

const STAGES = ['Wall', 'Learn', 'Pit Stop', 'Remix', 'Results'];
const TABS = ['Live', 'Students', 'Results', 'Controls'];
const activityLabels = { appreciation: 'Appreciation Wall', 'message-remix': 'Message Remix', 'academic-transfer': 'Academic Transfer', revision: 'Revision' };
const expiryLabel = (expiresAt) => {
  const hours = Math.max(1, Math.ceil((expiresAt - Date.now()) / 3600000));
  return hours < 24 ? `EXPIRES IN ${hours} HOURS` : `EXPIRES IN ${Math.ceil(hours / 24)} DAYS`;
};

function csvText(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(section, users) {
  const fields = ['Student name', 'Student ID', 'Section ID', 'Section name', 'Activity type', 'Original prompt', 'Original classmate message', 'Original author', 'Recipient', 'Student response', 'Automated score', 'Official teacher mark', 'Teacher feedback', 'Submission status', 'Review status', 'Submitted at', 'Parent submission ID'];
  const rows = section.submissions.map((record) => {
    const student = users.find((item) => item.id === record.studentId);
    return [student?.name, record.studentId, section.id, section.name, activityLabels[record.type] || record.type, record.prompt, record.sourceMessage?.text, record.sourceMessage?.author, record.recipient, record.response, record.automatedResult?.score, record.grading?.officialMark, record.grading?.feedback, 'Submitted', record.grading?.status || 'pending', record.submittedAt ? new Date(record.submittedAt).toISOString() : '', record.parentSubmissionId];
  });
  const blob = new Blob(['\ufeff', [fields, ...rows].map((row) => row.map(csvText).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `words-connect-${section.name.replace(/[^a-z0-9-]/gi, '-')}-results.csv`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function sectionStudents(section, users) {
  return users.filter((user) => user.role === 'student' && section?.studentIds.includes(user.id));
}

function livePitScore(student, section) {
  const progress = section.progress[student.id] || {};
  if (progress.pitCompleted) return progress.pitCompleted.score === progress.pitCompleted.total;
  const answers = progress.pitAnswers || progress.pit || {};
  const questions = section.quiz?.questions || [];
  return questions.length > 0 && questions.every((question, index) => (answers[question.id] || answers[String(index)])?.choice === question.correctIndex);
}

function SpotlightDialog({ section, autoplay, setAutoplay, index, setIndex, onClose }) {
  const wall = section?.wall || [];
  const [timerReset, setTimerReset] = useState(0);
  useEffect(() => {
    if (!autoplay || wall.length < 2) return undefined;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % wall.length), 6000);
    return () => window.clearInterval(timer);
  }, [autoplay, wall.length, timerReset, setIndex]);
  useEffect(() => setIndex((current) => wall.length ? current % wall.length : 0), [section?.id, wall.length, setIndex]);
  const position = wall.length ? index % wall.length : 0;
  const post = wall[position];
  const navigate = (direction) => {
    if (wall.length < 2) return;
    setIndex((current) => (current + direction + wall.length) % wall.length);
    setTimerReset((current) => current + 1);
  };
  return <Modal title="Appreciation Wall Spotlight" onClose={onClose} className="spotlight-modal"><div className="spotlight-content">
    <small>{post ? `${position + 1} / ${wall.length} · ${post.author}${post.recipient ? ` → ${post.recipient}` : ''}` : 'NO CLASS MESSAGES'}</small><p>{post?.text || 'No messages yet.'}</p>
    <div className="form-actions spotlight-actions"><Button variant="secondary" disabled={wall.length < 2} onClick={() => navigate(-1)} aria-label="Previous message"><ArrowLeft size={18} /> Previous</Button><Button variant="secondary" disabled={wall.length < 2} onClick={() => navigate(1)} aria-label="Next message"><ArrowRight size={18} /> Next</Button><Button variant={autoplay ? 'secondary' : 'lime'} onClick={() => setAutoplay((value) => !value)}>{autoplay ? <><Pause size={16} /> Pause autoplay</> : <><Play size={16} /> Play autoplay</>}</Button><Button variant="lime" onClick={onClose}>Close spotlight</Button></div>
    <p className="fine-print">Autoplay advances every six seconds. Manual navigation restarts the timer.</p>
  </div></Modal>;
}

function LiveTab({ section, students, onShowSpotlight, onShowQr }) {
  const currentStageCounts = STAGES.map((_, index) => students.filter((student) => (section.progress[student.id]?.stage || 0) === index).length);
  const completedPitStop = students.filter((student) => livePitScore(student, section)).length;
  const writingSubmissions = section.submissions.filter((item) => ['message-remix', 'academic-transfer'].includes(item.type)).length;
  return <div className="tab-content"><Button variant="lime" className="wide-qr" onClick={onShowQr}>▦ Show QR code for students <ArrowRight size={17} /></Button>
    <div className="metrics-grid live-metrics"><Metric value={students.length} label="Joined section" icon={UsersRound} /><Metric value={section.wall.length} label="Wall messages" icon={MessageSquare} /><Metric value={completedPitStop} label="Pit Stop completed" /><Metric value={writingSubmissions} label="Writing submissions" /><Metric value={section.submissions.filter((item) => item.grading?.status === 'pending').length} label="Pending reviews" /></div>
    <Card><h3>Students’ current stage</h3><p className="muted">This shows the stage each student has selected. It does not indicate which earlier activities they completed.</p>{STAGES.map((stage, index) => <div className="stage-count" key={stage}><div><b>{index + 1}. {stage}</b><span>{currentStageCounts[index]}</span></div><div className="progress-line"><i style={{ width: `${students.length ? currentStageCounts[index] / students.length * 100 : 0}%` }} /></div></div>)}</Card>
    <Card><h3>Completed activities</h3><div className="metrics-grid"><Metric value={completedPitStop} label="Pit Stop fully correct" /><Metric value={section.submissions.filter((item) => item.type === 'appreciation').length} label="Appreciation messages" /><Metric value={section.submissions.filter((item) => item.type === 'academic-transfer').length} label="Academic submissions" /></div></Card>
    <Card className="classroom-note"><div><Chip>{section.name.toUpperCase()} · {section.status === 'archived' ? 'ARCHIVED' : 'OPEN'}</Chip><h3>{section.name}</h3><p>Presence tracking and cross-device updates are not available in this local demo.</p></div><ShieldCheck size={24} /></Card>
    <Card><div className="section-heading"><div><h3>Appreciation Wall Spotlight</h3><p className="muted">Project class messages with manual navigation or autoplay.</p></div><Button variant="lime" onClick={onShowSpotlight}><MonitorPlay size={17} /> Open spotlight</Button></div></Card>
  </div>;
}

function StudentsTab({ section, students, users, onOpenStudent }) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [submissionFilter, setSubmissionFilter] = useState('all');
  const [gradingFilter, setGradingFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const filtered = useMemo(() => students.filter((student) => {
    const summary = studentGradeSummary(student.id, section.submissions);
    const currentStage = section.progress[student.id]?.stage || 0;
    const matchesName = `${student.name} ${student.email} ${student.id}`.toLowerCase().includes(search.toLowerCase());
    return matchesName && (stageFilter === 'all' || currentStage === Number(stageFilter)) && (submissionFilter === 'all' || (submissionFilter === 'submitted' ? summary.submitted : !summary.submitted)) && (gradingFilter === 'all' || (gradingFilter === 'reviewed' ? summary.gradingStatus === 'Reviewed' : summary.gradingStatus !== 'Reviewed'));
  }), [students, section, search, stageFilter, submissionFilter, gradingFilter]);
  const sorted = [...filtered].sort((a, b) => {
    const left = studentGradeSummary(a.id, section.submissions); const right = studentGradeSummary(b.id, section.submissions);
    if (sort === 'stage') return (section.progress[a.id]?.stage || 0) - (section.progress[b.id]?.stage || 0) || a.name.localeCompare(b.name);
    if (sort === 'official') return (right.officialMark ?? -1) - (left.officialMark ?? -1) || a.name.localeCompare(b.name);
    if (sort === 'auto') return (maxAutoScore(section, b.id) ?? -1) - (maxAutoScore(section, a.id) ?? -1) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  return <div className="tab-content"><Card><div className="section-heading"><div><h3>Students</h3><p className="muted">Manage and review students assigned to {section.name}.</p></div><Chip>{students.length} learners</Chip></div>
    <div className="student-filters"><label className="field">Search<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or student ID" /></label><label className="field">Current stage<select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">All stages</option>{STAGES.map((stage, index) => <option key={stage} value={index}>{stage}</option>)}</select></label><label className="field">Submission<select value={submissionFilter} onChange={(event) => setSubmissionFilter(event.target.value)}><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="in-progress">In progress</option></select></label><label className="field">Grading<select value={gradingFilter} onChange={(event) => setGradingFilter(event.target.value)}><option value="all">All grading states</option><option value="pending">Pending review</option><option value="reviewed">Reviewed</option></select></label><label className="field">Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name</option><option value="stage">Current stage</option><option value="auto">Automated score</option><option value="official">Official mark</option></select></label></div>
    {sorted.length ? <div className="student-management-list">{sorted.map((student) => {
      const progress = section.progress[student.id] || {};
      const grading = studentGradeSummary(student.id, section.submissions);
      const pitScore = progress.pitCompleted?.score ?? (section.quiz.questions || []).filter((item, index) => (progress.pitAnswers?.[item.id] || progress.pit?.[String(index)])?.choice === item.correctIndex).length;
      return <button type="button" className="student-management-row" key={student.id} onClick={() => onOpenStudent(student)}><span className="student-row-main"><strong>{student.name}</strong><span>ID: {student.id} · Stage {Math.min(5, (progress.stage || 0) + 1)} · Pit Stop {pitScore}/{progress.pitCompleted?.total || section.quiz.questions.length}</span></span><span className="student-row-badges"><Chip className={grading.submitted ? 'status-reviewed' : 'status-pending'}>{grading.submitted ? 'Submitted' : 'In progress'}</Chip><Chip>{grading.officialMark == null ? 'Official mark —' : `Official ${grading.officialMark}/100`}</Chip><Chip className={grading.gradingStatus === 'Reviewed' ? 'status-reviewed' : 'status-pending'}>{grading.gradingStatus}</Chip>{maxAutoScore(section, student.id) != null && <Chip>Automated {maxAutoScore(section, student.id)}/100</Chip>}</span><ArrowRight size={17} /></button>;
    })}</div> : <EmptyState title="No students match these filters." />}</Card></div>;
}

function maxAutoScore(section, studentId) {
  const scores = section.submissions.filter((item) => item.studentId === studentId && item.automatedResult).map((item) => item.automatedResult.score);
  return scores.length ? Math.max(...scores) : null;
}

function ResultsTab({ section, students, users, onSaveGrade, onToggleReveal, onOpenStudent }) {
  const reviewable = section.submissions;
  const pending = reviewable.filter((item) => item.grading?.status !== 'reviewed').length;
  const reviewed = reviewable.length - pending;
  const officialMarks = reviewable.filter((item) => item.type !== 'revision' && item.grading?.status === 'reviewed' && item.grading.officialMark !== '' && Number.isFinite(Number(item.grading.officialMark))).map((item) => Number(item.grading.officialMark));
  const averageOfficial = officialMarks.length ? Math.round(officialMarks.reduce((sum, value) => sum + value, 0) / officialMarks.length) : '—';
  const rankings = section.officialRankings || officialRankings(reviewable, users);
  return <div className="tab-content"><Card><div className="section-heading"><div><h3>Assessment overview</h3><p className="muted">Automated scores guide learning; official marks come from teacher review.</p></div><Chip>{section.name}</Chip></div><div className="metrics-grid"><Metric value={students.length} label="Students" /><Metric value={reviewable.length} label="Activity submissions" /><Metric value={pending} label="Pending review" /><Metric value={reviewed} label="Reviewed" /><Metric value={averageOfficial} label="Average official mark" /></div></Card>
    <Card><div className="section-heading"><div><h3>Official class awards</h3><p className="muted">Rankings use reviewed teacher marks only. Automated scores are never treated as grades.</p></div><Button disabled={section.canManage === false} variant={section.settings.reveal ? 'secondary' : 'lime'} onClick={onToggleReveal}>{section.settings.reveal ? <><EyeOff size={16} /> Hide from students</> : <><Eye size={16} /> Reveal to students</>}</Button></div>{rankings.length ? <div className="awards-grid">{rankings.map((award, index) => <div className="award-card" key={award.studentId}><span>{['🥇', '🥈', '🥉'][index]}</span><b>{['First', 'Second', 'Third'][index]}</b><strong>{award.name}</strong><small>{award.mark}/100 official average · {award.reviewedCount} reviewed</small></div>)}</div> : <EmptyState title="Awards appear after reviewed official marks are saved." />}</Card>
    <Card><div className="section-heading"><div><h3>Student assessment workspace</h3><p className="muted">Choose a student to review all activities and attempts.</p></div><Chip>{students.length} students</Chip></div>{students.length ? <div className="results-student-list">{students.map((student) => {
      const records = reviewable.filter((item) => item.studentId === student.id).sort((a, b) => a.submittedAt - b.submittedAt);
      const summary = studentGradeSummary(student.id, reviewable);
      return <details className="results-student-group" key={student.id}><summary><span><b>{student.name}</b><small>{records.length} records · {summary.gradingStatus}</small></span><Chip>{summary.officialMark == null ? 'No official mark' : `${summary.officialMark}/100`}</Chip></summary><div className="form-actions"><Button variant="secondary" onClick={() => onOpenStudent(student)}>Open complete learning history</Button></div>{records.length ? records.map((record) => <SubmissionCard key={record.id} record={record} section={section} submissions={section.submissions} users={users} onSaveGrade={onSaveGrade} readOnly={!section.canGrade} />) : <EmptyState title="No submissions from this student yet." />}</details>;
    })}</div> : <EmptyState title="No students are assigned to this section." />}</Card></div>;
}

function SectionRename({ section, updateSection }) {
  const [name, setName] = useState(section.name);
  return <form className="section-rename" onSubmit={(event) => { event.preventDefault(); if (name.trim()) updateSection(section.id, { name: name.trim() }); }}><label className="field">Section name<input value={name} onChange={(event) => setName(event.target.value)} readOnly={section.canManage === false} /></label><Button variant="secondary" type="submit" disabled={section.canManage === false}>Save name</Button></form>;
}

function ControlsTab({ data, section, users, updateSection, updateClassroom, createSection, setActiveSection, archiveSection, reopenSection, deleteSection, onMembershipChange, resetSection, onShowSpotlight, onShowQr, onViewArchive, message, setMessage, remoteTeacher }) {
  const [newSectionName, setNewSectionName] = useState('');
  const [creatingSection, setCreatingSection] = useState(false);
  const openSections = data.sections.filter((item) => item.status !== 'archived');
  const archivedSections = data.sections.filter((item) => item.status === 'archived');
  const startCreate = async (event) => {
    event.preventDefault();
    const name = newSectionName.trim();
    if (!name || creatingSection) return;
    setCreatingSection(true);
    setMessage('');
    try {
      await createSection(name);
      setMessage(`${name} created${remoteTeacher ? ' and selected' : '. Activate it from Open sections when ready'}.`);
      setNewSectionName('');
    } catch (error) {
      setMessage(error.message || 'The section could not be created. Please try again.');
    } finally {
      setCreatingSection(false);
    }
  };
  const archive = (target) => { if (window.confirm(`Archive ${target.name}? Its students, submissions, grades and settings will remain available in archived reports.`)) { archiveSection(target.id); setMessage(`${target.name} archived. Its data was preserved.`); } };
  const permanentlyDelete = (target) => { if (window.confirm(`Permanently delete ${target.name} and all of its students' activity, submissions, grades and feedback? This cannot be undone.`)) { deleteSection(target.id); setMessage(`${target.name} permanently deleted.`); } };
  const clear = () => { if (section && window.confirm(`Permanently clear all activity, answers, submissions, revisions and teacher grades in ${section.name}? This cannot be undone. Section membership and assigned lesson content will remain.`)) { resetSection(section.id); setMessage(`${section.name} activity data was cleared.`); } };
  const createQr = () => onShowQr();
  return <div className="tab-content">
    <Card><div className="section-heading"><div><h3>Current section</h3><p className="muted">Creating or switching sections does not clear or move their saved records.</p></div><Chip className="status-active">{section ? `${section.name} · Current` : 'No current section'}</Chip></div>{section ? <><div className="metrics-grid"><Metric value={sectionStudents(section, users).length} label="Students" /><Metric value={section.wall.length} label="Wall messages" /><Metric value={section.submissions.length} label="Activity records" /><Metric value={section.submissions.filter((item) => item.grading?.status !== 'reviewed').length} label="Pending reviews" /></div><SectionRename section={section} updateSection={updateSection} /><div className="form-actions"><Button variant="secondary" onClick={onShowSpotlight}><MonitorPlay size={16} /> Spotlight Wall</Button><Button variant="secondary" disabled={section.canManage === false} onClick={onShowQr}><Clipboard size={16} /> Classroom QR</Button><Button variant="danger" disabled={section.canManage === false} onClick={() => archive(section)}>Archive current section</Button>{!remoteTeacher && <Button variant="danger" onClick={clear}><RotateCcw size={16} /> Reset this section’s activity</Button>}</div>{remoteTeacher && !section.canManage && <p className="muted">You have read-only access to classroom controls.</p>}</> : <EmptyState title="No open section is selected.">Create a section or reopen an archived section to continue.</EmptyState>}</Card>
    {section && <><Card><h3>Class stage and submission controls</h3><p className="muted">These settings belong to the current section.</p><div className="stage-controls">{STAGES.map((stage, index) => <Button disabled={section.canManage === false} key={stage} variant={section.settings.stage === index ? 'primary' : 'secondary'} onClick={() => updateClassroom({ stage: index }, section.id)}>{index + 1} {stage}</Button>)}</div><div className="control-row"><div><b>Appreciation Wall</b><span>{section.settings.wallOpen ? 'Students can post' : 'Posting is paused'}</span></div><Button disabled={section.canManage === false} variant="secondary" onClick={() => updateClassroom({ wallOpen: !section.settings.wallOpen }, section.id)}>{section.settings.wallOpen ? 'Close wall' : 'Open wall'}</Button></div><div className="control-row"><div><b>Writing submissions</b><span>{section.settings.submissionsOpen ? 'Students can submit' : 'Submissions are paused'}</span></div><Button disabled={section.canManage === false} variant="secondary" onClick={() => updateClassroom({ submissionsOpen: !section.settings.submissionsOpen }, section.id)}>{section.settings.submissionsOpen ? 'Close submissions' : 'Open submissions'}</Button></div></Card><QuizEditor section={section} updateSection={updateSection} /><ExerciseEditor section={section} updateSection={updateSection} />
      <Card><div className="section-heading"><div><h3>Student membership</h3><p className="muted">Membership is section-specific. Historical records stay in their original section when membership changes.</p></div><Chip>{sectionStudents(section, users).length} students</Chip></div>{users.map((student) => <label className="membership-row" key={student.id}><input type="checkbox" checked={section.canManage === undefined ? section.studentIds.includes(student.id) : student.membershipStatus === 'active'} disabled={section.canManage === false} onChange={(event) => onMembershipChange(student.id, section.id, event.target.checked)} /><span><b>{student.name}</b><small>{student.email} · {student.id} · {student.membershipStatus || 'member'}</small></span></label>)}{!users.length && <EmptyState title="No student memberships in this classroom." />}</Card></>}
    <Card><h3>Create a section</h3><p className="muted">{remoteTeacher ? 'This creates a new Supabase classroom and selects it after it is saved.' : 'This creates an empty classroom without switching away from the current one.'}</p><form className="section-rename" onSubmit={startCreate}><label className="field">New section name<input value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} placeholder="e.g. Section B" required /></label><Button variant="lime" type="submit" disabled={creatingSection}><Plus size={16} /> {creatingSection ? 'Creating…' : 'Create section'}</Button></form>{message && <p className="status-message" role="status">{message}</p>}</Card>
    <Card><div className="section-heading"><div><h3>Open sections</h3><p className="muted">Switch the teacher dashboard context without moving any student records.</p></div><Chip>{openSections.length}</Chip></div>{openSections.length ? openSections.map((item) => <div className="managed-section-row" key={item.id}><div><b>{item.name}{item.id === data.activeSectionId ? ' · Current' : ''}</b><small>{sectionStudents(item, users).length} students · {item.submissions.length} activity records</small></div><div className="form-actions">{item.id !== data.activeSectionId && <Button variant="lime" onClick={() => setActiveSection(item.id)}>Make current</Button>}<Button variant="secondary" onClick={() => archive(item)}>Archive</Button></div></div>) : <EmptyState title="No open sections." />}</Card>
    <Card><div className="section-heading"><div><h3>Archived sections</h3><p className="muted">View historical reports without activating the section. Reopening preserves its data.</p></div><Chip>{archivedSections.length}</Chip></div>{archivedSections.length ? archivedSections.map((item) => <div className="managed-section-row archived-section-row" key={item.id}><div><b>{item.name}</b><small>Archived {item.archivedAt ? new Date(item.archivedAt).toLocaleDateString() : 'date not recorded'} · {sectionStudents(item, users).length} students · {item.submissions.length} submissions</small></div><div className="form-actions"><Button variant="secondary" onClick={() => onViewArchive(item.id, 'reports')}>View reports</Button><Button variant="secondary" onClick={() => onViewArchive(item.id, 'students')}>View students</Button><Button variant="secondary" onClick={() => downloadCsv(item, users)}><ArrowDownToLine size={15} /> Export CSV</Button><Button variant="lime" disabled={item.canManage === false} onClick={() => { reopenSection(item.id); setMessage(`${item.name} reopened as the current section.`); }}>Reopen</Button>{!remoteTeacher && <Button variant="danger" onClick={() => permanentlyDelete(item)}>Delete permanently</Button>}</div></div>) : <EmptyState title="No archived sections yet." />}</Card>
    <Card><h3>Results export</h3><p className="muted">Export stored activity responses, source context, automated results, official marks, teacher feedback and review status.</p><Button variant="secondary" disabled={!section} onClick={() => section && downloadCsv(section, users)}><ArrowDownToLine size={16} /> Export current section CSV</Button></Card>
  </div>;
}

export function TeacherDashboard() {
  const { data, activeSection, updateSection, updateClassroom, createSection, setActiveSection, archiveSection, reopenSection, deleteSection, setStudentSection, resetSection, addInvite, saveGrade, createStudentInvitation, remoteTeacher, remoteStatus, remoteError, retryRemote } = useData();
  const [tab, setTab] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [spotlight, setSpotlight] = useState(false);
  const [spotIndex, setSpotIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [copyState, setCopyState] = useState('Copy student link');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [archiveView, setArchiveView] = useState(null);
  const [archiveStudent, setArchiveStudent] = useState(null);
  const [controlsMessage, setControlsMessage] = useState('');
  const section = activeSection;
  const users = data.users || [];
  const students = useMemo(() => section ? sectionStudents(section, users) : [], [section, users]);
  const activeInvite = data.invites.find((invite) => invite.type === 'student' && invite.status === 'Active' && invite.expiresAt > Date.now() && invite.sectionId === section?.id);
  const inviteUrl = activeInvite ? studentInviteUrl(activeInvite.token) : '';
  const createQr = async () => {
    if (!section) return;
    if (remoteTeacher) {
      try {
        const created = await createStudentInvitation(section.id);
        const invite = { id: created.id, token: created.token, type: 'student', classroomId: section.id, classroomName: section.name, sectionId: section.id, sectionName: section.name, status: 'Active', expiresAt: created.expiresAt };
        addInvite(invite); setShowQR(true); setCopyState('Copy student link');
      } catch { /* DataContext exposes the database error in the dashboard. */ }
      return;
    }
    const invite = { token: createId('invite'), type: 'student', classroomId: data.classroom.id, classroomName: data.classroom.name, sectionId: section.id, sectionName: section.name, status: 'Active', expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    addInvite(invite); setShowQR(true); setCopyState('Copy student link');
  };
  const openQr = async () => {
    if (remoteTeacher && activeInvite?.id) {
      try {
        const current = await getStudentInvitationStatus(activeInvite.id);
        if (current?.status === 'pending' && current.expiresAt > Date.now()) { setShowQR(true); return; }
        addInvite({ ...activeInvite, status: current?.status === 'consumed' ? 'Consumed' : 'Expired' });
      } catch (error) {
        setControlsMessage(error.message || 'Could not verify this classroom invitation. Try again.');
        return;
      }
    } else if (activeInvite && !remoteTeacher) {
      setShowQR(true);
      return;
    }
    await createQr();
  };
  const copyLink = async () => { try { await navigator.clipboard.writeText(inviteUrl); setCopyState('Copied!'); } catch { setCopyState('Select and copy the link below'); } };
  const saveGradeForSection = (sectionId) => (recordId, grade) => saveGrade(recordId, grade, sectionId);
  const onMembershipChange = (studentId, sectionId, isMember) => setStudentSection(studentId, sectionId, isMember);
  const openSpotlight = () => { setSpotIndex(0); setAutoplay(false); setSpotlight(true); };
  const tabContent = section ? [
    <LiveTab key="live" section={section} students={students} onShowQr={openQr} onShowSpotlight={openSpotlight} />,
    <StudentsTab key="students" section={section} students={students} users={users} onOpenStudent={setSelectedStudent} />,
    <ResultsTab key="results" section={section} students={students} users={users} onSaveGrade={saveGradeForSection(section.id)} onToggleReveal={() => updateClassroom({ reveal: !section.settings.reveal }, section.id)} onOpenStudent={setSelectedStudent} />,
    <ControlsTab key="controls" data={data} section={section} users={users} updateSection={updateSection} updateClassroom={updateClassroom} createSection={createSection} setActiveSection={setActiveSection} archiveSection={archiveSection} reopenSection={reopenSection} deleteSection={deleteSection} onMembershipChange={onMembershipChange} resetSection={resetSection} onShowSpotlight={openSpotlight} onShowQr={openQr} onViewArchive={(sectionId, mode) => setArchiveView({ sectionId, mode })} message={controlsMessage} setMessage={setControlsMessage} remoteTeacher={remoteTeacher} />,
  ] : [<Card key="none"><EmptyState title="No open section is selected.">Create a section in Controls, or reopen an archived section.</EmptyState></Card>, <Card key="students"><EmptyState title="No active section." /></Card>, <Card key="results"><EmptyState title="No active section." /></Card>, <ControlsTab key="controls" data={data} section={null} users={users} updateSection={updateSection} updateClassroom={updateClassroom} createSection={createSection} setActiveSection={setActiveSection} archiveSection={archiveSection} reopenSection={reopenSection} deleteSection={deleteSection} onMembershipChange={onMembershipChange} resetSection={resetSection} onShowSpotlight={openSpotlight} onShowQr={openQr} onViewArchive={(sectionId, mode) => setArchiveView({ sectionId, mode })} message={controlsMessage} setMessage={setControlsMessage} remoteTeacher={remoteTeacher} />];
  const archive = archiveView ? data.sections.find((item) => item.id === archiveView.sectionId) : null;
  const selectedStudentSection = selectedStudent ? (archiveStudent?.section || section) : null;
  const closeArchive = () => { setArchiveView(null); setArchiveStudent(null); };
  if (remoteTeacher && remoteStatus === 'loading' && !data.sections.length && !data.classroom) return <div className="teacher-view"><PageTitle eyebrow="TEACHER DASHBOARD" title="Loading your classrooms" /><div className="page-loading" role="status">Loading classroom records from Supabase…</div></div>;
  if (remoteTeacher && remoteStatus === 'error' && !data.sections.length && !data.classroom) return <div className="teacher-view"><PageTitle eyebrow="TEACHER DASHBOARD" title="Classrooms unavailable" /><Card><div className="alert-error" role="alert">{remoteError}</div><Button variant="lime" onClick={retryRemote}>Retry loading classrooms</Button></Card></div>;
  return <div className="teacher-view">{remoteTeacher && remoteError && <div className="alert-error" role="alert">{remoteError}</div>}<PageTitle eyebrow="TEACHER DASHBOARD" title={section?.name || 'Class sections'} description={<><span className="live-dot" /> {section ? (remoteTeacher ? `${section.name} · Supabase classroom` : `${data.classroom.name} · local demo data`) : 'No current classroom selected'}</>} action={section && <Chip>{section.submissions.length} activity records</Chip>} /><div className="teacher-tabs" role="tablist" aria-label="Teacher dashboard sections">{TABS.map((label, index) => <button key={label} role="tab" aria-selected={tab === index} onClick={() => setTab(index)}>{label}</button>)}</div>{tabContent[tab]}
    {showQR && <Modal title="Student classroom invitation" onClose={() => setShowQR(false)}><div className="qr-content">{activeInvite ? <><div className="qr-frame"><QRCodeSVG value={inviteUrl} size={210} includeMargin /></div><Chip>{expiryLabel(activeInvite.expiresAt)}</Chip><p>Students scan this code to join <b>{activeInvite.sectionName}</b>.</p><div className="copy-link-row"><input value={inviteUrl} readOnly aria-label="Student invitation link" onFocus={(event) => event.target.select()} /><Button onClick={copyLink}><Clipboard size={16} /> {copyState}</Button></div></> : <div className="invite-missing"><p>There isn’t an active invitation for this section.</p><Button onClick={createQr}><Plus size={16} /> Create classroom QR</Button></div>}</div></Modal>}
    {spotlight && section && <SpotlightDialog section={section} autoplay={autoplay} setAutoplay={setAutoplay} index={spotIndex} setIndex={setSpotIndex} onClose={() => setSpotlight(false)} />}
    {selectedStudent && selectedStudentSection && <StudentDetailModal student={selectedStudent} section={selectedStudentSection} users={users} onClose={() => { setSelectedStudent(null); setArchiveStudent(null); }} onSaveGrade={saveGradeForSection(selectedStudentSection.id)} readOnly={selectedStudentSection.status === 'archived' || (remoteTeacher && !selectedStudentSection.canGrade)} />}
    {archive && <Modal title={`${archive.name} · ${archiveView.mode === 'reports' ? 'Historical reports' : 'Students'}`} onClose={closeArchive}><p className="alert-note">Read-only archive view. Opening reports does not change the active section.</p>{archiveView.mode === 'students' ? <SectionSummary section={archive} users={users} onOpenStudent={(student) => { setArchiveStudent({ section: archive, student }); setSelectedStudent(student); setArchiveView(null); }} /> : <div className="archived-report-list">{archive.submissions.length ? archive.submissions.map((record) => <SubmissionCard key={record.id} record={record} section={archive} submissions={archive.submissions} users={users} onSaveGrade={() => {}} readOnly />) : <EmptyState title="No historical submissions." />}</div>}</Modal>}
    {archiveStudent && !selectedStudent && <StudentDetailModal student={archiveStudent.student} section={archiveStudent.section} users={users} onClose={() => setArchiveStudent(null)} onSaveGrade={() => {}} readOnly />}
  </div>;
}
