import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Clipboard, Eye, EyeOff, MessageSquare, MonitorPlay, Plus, RotateCcw, ShieldCheck, UsersRound, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { Button, Card, Chip, EmptyState, Metric, PageTitle } from '../../components/ui.jsx';
import { createId, studentInviteUrl } from '../../services/mockApi.js';
import { feedbackLabels, issueList } from '../../services/assessment.js';

const STAGES = ['Wall', 'Learn', 'Pit Stop', 'Remix', 'Results'];
const TABS = ['Live', 'Students', 'Results', 'Controls'];
const expiryLabel = (expiresAt) => {
  const hours = Math.max(1, Math.ceil((expiresAt - Date.now()) / 3600000));
  return hours < 24 ? `EXPIRES IN ${hours} HOURS` : `EXPIRES IN ${Math.ceil(hours / 24)} DAYS`;
};

function ranking(submissions) {
  if (!submissions.length) return [];
  const used = new Set();
  const pick = (sort, eligible = submissions) => {
    const remaining = eligible.filter((item) => !used.has(item.userId));
    const candidate = [...(remaining.length ? remaining : submissions.filter((item) => !used.has(item.userId)))].sort(sort)[0];
    if (candidate) used.add(candidate.userId);
    return candidate;
  };
  const safe = submissions.filter((item) => !issueList(item.result).includes('changed') && !item.result.cp);
  return [
    { title: 'Meaning Keeper', label: 'Best meaning preservation', icon: '🔐', submission: pick((a, b) => b.result.m - a.result.m || b.result.score - a.result.score, safe) },
    { title: 'Structure Shifter', label: 'Best restructuring', icon: '🔀', submission: pick((a, b) => b.result.re - a.result.re || b.result.nw - a.result.nw || b.result.score - a.result.score, safe) },
    { title: 'Academic Precision', label: 'Strongest overall', icon: '🎓', submission: pick((a, b) => b.result.score - a.result.score || b.result.nw - a.result.nw) },
  ];
}

function LiveTab({ students, wall, submissions, classroom, onShowQr }) {
  const online = students.filter((student) => student.status === 'Active');
  const cleared = students.filter((student) => Object.entries(student.progress.pit || {}).filter(([index, choice]) => choice.choice === [1, 0, 2][Number(index)]).length === 3).length;
  return <div className="tab-content"><Button variant="lime" className="wide-qr" onClick={onShowQr}>▦ Show QR code for students <ArrowRight size={17} /></Button><div className="metrics-grid live-metrics"><Metric value={students.length} label="Joined" icon={UsersRound} /><Metric value={online.length} label="Online now" icon={Activity} /><Metric value={wall.length} label="Wall messages" icon={MessageSquare} /><Metric value={cleared} label="Pit stop cleared" /><Metric value={submissions.length} label="Submitted" /></div><Card><h3>Where is everyone?</h3><p className="muted">Student activity by learning stage</p>{STAGES.map((stage, index) => { const count = students.filter((student) => student.progress.stage === index).length; return <div className="stage-count" key={stage}><div><b>{index + 1} {stage}</b><span>{count}</span></div><div className="progress-line"><i style={{ width: `${students.length ? count / students.length * 100 : 0}%` }} /></div></div>; })}</Card><Card className="classroom-note"><div><Chip>ACTIVE CLASSROOM</Chip><h3>{classroom.name}</h3><p>Section activity updates here as learners move through the stages.</p></div><ShieldCheck size={24} /></Card></div>;
}

function StudentsTab({ students }) {
  return <Card><div className="section-heading"><div><h3>Students</h3><p className="muted">Progress in the current section.</p></div><Chip>{students.length} learners</Chip></div>{students.length ? <div className="student-list">{students.map((student) => { const pit = Object.entries(student.progress.pit || {}).filter(([index, item]) => item.choice === [1, 0, 2][Number(index)]).length; const submission = student.progress.submission; return <article className="student-row" key={student.id}><span className={`presence-dot ${student.id !== 'u-student' ? 'is-online' : ''}`} /><div className="student-row-main"><strong>{student.name}</strong><span>Stage {student.progress.stage + 1} · Pit {pit}/3{submission ? ` · Score ${submission.result.score}` : ''}</span></div><span className={`submission-state ${submission ? 'submitted' : ''}`}>{submission ? '✓ Submitted' : 'In progress'}</span></article>; })}</div> : <EmptyState title="No students have joined yet." />}</Card>;
}

function ResultsTab({ submissions, reveal, onToggleReveal }) {
  const avg = submissions.length ? Math.round(submissions.reduce((sum, item) => sum + item.result.score, 0) / submissions.length) : '—';
  const counts = Object.fromEntries(Object.keys(feedbackLabels).map((key) => [key, submissions.filter((item) => issueList(item.result).includes(key)).length]));
  const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).filter((key) => counts[key] > 0)[0];
  const awards = ranking(submissions);
  return <div className="tab-content"><Card><div className="section-heading"><div><h3>Class results</h3><p className="muted">A formative snapshot to guide the next lesson.</p></div><Chip>{submissions.length} responses</Chip></div>{submissions.length ? <><div className="metrics-grid"><Metric value={submissions.length} label="Responses" /><Metric value={avg} label="Average score" /><Metric value={top ? feedbackLabels[top][0] : '—'} label="Most common focus" /></div>{Object.entries(feedbackLabels).map(([key, item]) => <div className="difficulty-line" key={key}><div><b>{item[0]}</b><span>{counts[key]} of {submissions.length}</span></div><div className="progress-line"><i style={{ width: `${counts[key] / submissions.length * 100}%` }} /></div></div>)}</> : <EmptyState title="No responses yet." />}</Card><Card><div className="section-heading"><div><h3>🏆 Top 3</h3><p className="muted">Rubric-based suggestions. Confirm with the original writing before announcing.</p></div><Button variant={reveal ? 'secondary' : 'lime'} onClick={onToggleReveal}>{reveal ? <><EyeOff size={16} /> Hide from students</> : <><Eye size={16} /> Reveal to students</>}</Button></div>{awards.length ? <div className="awards-grid">{awards.map((award) => <div className="award-card" key={award.title}><span>{award.icon}</span><b>{award.title}</b><strong>{award.submission?.studentName || '—'}</strong><small>{award.label}{award.submission && ` · ${award.submission.result.score}/100`}</small></div>)}</div> : <EmptyState title="Awards appear after submissions." />}</Card><Card><h3>Student responses</h3>{submissions.length ? <div className="response-list">{[...submissions].sort((a, b) => b.result.score - a.result.score).map((item) => <article key={item.userId} className="response-card"><div className="section-heading"><b>{item.studentName}</b><Chip>{item.result.score}/100</Chip></div><p>{item.academic}</p>{item.revision && <p><b>Revised:</b> {item.revision} <span className="muted">· {item.revisionResult?.score}/100</span></p>}</article>)}</div> : <EmptyState title="No submissions to review." />}</Card></div>;
}

function ControlsTab({ data, updateClassroom, addSection, setData, onShowSpotlight, onShowQr, submissions }) {
  const [sectionName, setSectionName] = useState('');
  const [message, setMessage] = useState('');
  const toggle = (key) => updateClassroom({ [key]: !data.classroom[key] });
  const startSection = () => {
    if (!window.confirm('Start a new empty class section? Previous section data will stay in this demo.')) return;
    const section = { id: createId('section'), name: sectionName.trim() || `Section ${String.fromCharCode(65 + data.sections.length)}`, createdAt: Date.now() };
    addSection(section); setSectionName(''); setMessage(`${section.name} is now active.`);
  };
  const erase = () => {
    if (!window.confirm('Erase the wall and student submissions in this demo section? This cannot be undone.')) return;
    setData((current) => ({ ...current, wall: [], progress: Object.fromEntries(Object.entries(current.progress).map(([id, progress]) => [id, { ...progress, submission: null, revision: '', revisionResult: null }])) }));
    setMessage('Current section data has been cleared.');
  };
  const downloadCsv = (rowsToExport, filename) => {
    if (!rowsToExport.length) { setMessage('There are no responses to export yet.'); return; }
    const fields = ['Name', 'Message from', 'Message', 'Task 1 paraphrase', 'Academic paraphrase', 'Score', 'Difficulties', 'Revision', 'Revised score'];
    const quote = (value) => { let text = String(value ?? ''); if (/^[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
    const rows = rowsToExport.map((item) => [item.studentName, item.sourceAuthor || '', item.sourceMessage || '', item.remix, item.academic, item.result.score, issueList(item.result).map((key) => feedbackLabels[key][0]).join('; '), item.revision || '', item.revisionResult?.score || '']);
    const blob = new Blob(['\ufeff', [fields, ...rows].map((row) => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 500); setMessage('CSV downloaded.');
  };
  const exportCsv = () => downloadCsv(submissions, 'words-connect-results.csv');
  return <div className="tab-content"><Card><h3>🎓 Class stage</h3><p className="muted">Students can join the teacher’s stage from their learning page.</p><div className="stage-controls">{STAGES.map((stage, index) => <Button key={stage} variant={data.classroom.stage === index ? 'primary' : 'secondary'} onClick={() => updateClassroom({ stage: index })}>{index + 1} {stage}</Button>)}</div></Card><Card><h3>Class controls</h3><div className="control-row"><div><b>Appreciation Wall</b><span>{data.classroom.wallOpen ? 'Students can post messages' : 'Posting is paused'}</span></div><Button variant="secondary" onClick={() => toggle('wallOpen')}>{data.classroom.wallOpen ? 'Open · tap to close' : 'Closed · tap to open'}</Button></div><div className="control-row"><div><b>Writing submissions</b><span>{data.classroom.submissionsOpen ? 'Students can submit their writing' : 'Submissions are paused'}</span></div><Button variant="secondary" onClick={() => toggle('submissionsOpen')}>{data.classroom.submissionsOpen ? 'Open · tap to close' : 'Closed · tap to open'}</Button></div><Button variant="secondary" onClick={onShowSpotlight}><MonitorPlay size={17} /> Spotlight wall (projector)</Button></Card><Card><h3>🔄 Next class section</h3><p className="muted">Starts a clean, empty section. Previous sections remain available in this prototype.</p><label className="field">Name of the new section <span className="field-hint">(optional)</span><input value={sectionName} onChange={(event) => setSectionName(event.target.value)} placeholder="e.g. Section B" /></label><div className="form-actions"><Button variant="lime" onClick={startSection}><Plus size={16} /> Start new section</Button><Button variant="danger" onClick={erase}><RotateCcw size={16} /> Erase this section’s data</Button></div>{message && <p className="status-message" role="status">{message}</p>}{(data.archives || []).length > 0 && <div className="section-history"><h4>Previous sections</h4>{data.archives.map((archive) => { const archivedSubmissions = Object.entries(archive.progress || {}).flatMap(([userId, progress]) => progress.submission ? [{ ...progress.submission, userId, studentName: progress.submission.studentName || data.users.find((person) => person.id === userId)?.name || 'Student', revision: progress.revision || progress.submission.revision, revisionResult: progress.revisionResult || progress.submission.revisionResult }] : []); return <div className="history-row" key={archive.section?.id}><div><b>{archive.section?.name || 'Archived section'}</b><span>{archive.wall?.length || 0} wall messages · {archivedSubmissions.length} submissions</span></div><Button variant="secondary" disabled={!archivedSubmissions.length} onClick={() => downloadCsv(archivedSubmissions, `words-connect-${(archive.section?.name || 'archive').replace(/[^a-z0-9-]/gi, '-')}.csv`)}><ArrowDownToLine size={15} /> Export</Button></div>; })}</div>}</Card><Card><h3>📥 Save results</h3><p className="muted">Export this class snapshot as a spreadsheet-ready CSV.</p><Button variant="secondary" onClick={exportCsv}><ArrowDownToLine size={16} /> Export CSV</Button></Card><Card><h3>📲 Student registration QR</h3><p className="muted">Students scan to open a mock classroom registration invitation.</p><Button variant="secondary" onClick={onShowQr}><Clipboard size={16} /> Manage classroom QR</Button></Card></div>;
}

function Modal({ title, onClose, children, className = '' }) {
  useEffect(() => { const onKey = (event) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className={`modal-backdrop ${className}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-link" onClick={onClose} aria-label="Close"><X size={20} /></button></div>{children}</section></div>;
}

export function TeacherDashboard() {
  const { user } = useAuth();
  const { data, updateClassroom, addSection, addInvite, setData } = useData();
  const [tab, setTab] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [spotlight, setSpotlight] = useState(false);
  const [spotIndex, setSpotIndex] = useState(0);
  const [copyState, setCopyState] = useState('Copy student link');
  const students = useMemo(() => data.users.filter((person) => person.role === 'student').map((person) => ({ ...person, progress: data.progress[person.id] || { stage: 0, pit: {}, submission: null }, status: 'Active' })), [data.users, data.progress]);
  const submissions = useMemo(() => Object.entries(data.progress).flatMap(([userId, progress]) => progress.submission ? [{ ...progress.submission, userId, studentName: progress.submission.studentName || data.users.find((person) => person.id === userId)?.name || 'Student', revision: progress.revision || progress.submission.revision, revisionResult: progress.revisionResult || progress.submission.revisionResult }] : []), [data.progress, data.users]);
  const activeSection = data.sections.find((section) => section.id === data.activeSectionId);
  const activeInvite = data.invites.find((invite) => invite.type === 'student' && invite.status === 'Active' && invite.expiresAt > Date.now());
  const inviteUrl = activeInvite ? studentInviteUrl(activeInvite.token) : '';
  const createQr = () => {
    const invite = { token: createId('invite'), type: 'student', classroomId: data.classroom.id, classroomName: data.classroom.name, status: 'Active', expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    addInvite(invite); setShowQR(true); setCopyState('Copy student link');
  };
  const copyLink = async () => { try { await navigator.clipboard.writeText(inviteUrl); setCopyState('Copied!'); } catch { setCopyState('Select and copy the link below'); } };
  const wall = data.wall;
  useEffect(() => {
    if (!spotlight || wall.length < 2) return undefined;
    const timer = window.setInterval(() => setSpotIndex((index) => (index + 1) % wall.length), 6000);
    return () => window.clearInterval(timer);
  }, [spotlight, wall.length]);
  const spot = wall[spotIndex % Math.max(wall.length, 1)];
  const closeSpotlight = () => setSpotlight(false);
  const tabContent = [
    <LiveTab key="live" students={students} wall={wall} submissions={submissions} classroom={data.classroom} onShowQr={() => setShowQR(true)} />,
    <StudentsTab key="students" students={students} />,
    <ResultsTab key="results" submissions={submissions} reveal={data.classroom.reveal} onToggleReveal={() => updateClassroom({ reveal: !data.classroom.reveal })} />,
    <ControlsTab key="controls" data={data} updateClassroom={updateClassroom} addSection={addSection} setData={setData} onShowSpotlight={() => { setSpotIndex(0); setSpotlight(true); }} onShowQr={createQr} submissions={submissions} />,
  ];
  return <div className="teacher-view"><PageTitle eyebrow="TEACHER DASHBOARD" title={activeSection?.name || data.classroom.name} description={<><span className="live-dot" /> Demo classroom · {data.classroom.name}</>} action={<Chip>{submissions.length} submissions</Chip>} /><div className="teacher-tabs" role="tablist" aria-label="Teacher dashboard sections">{TABS.map((label, index) => <button key={label} role="tab" aria-selected={tab === index} onClick={() => setTab(index)}>{label}</button>)}</div>{tabContent[tab]}
    {showQR && <Modal title="📲 Invite students to your class" onClose={() => setShowQR(false)}><div className="qr-content">{activeInvite ? <><div className="qr-frame"><QRCodeSVG value={inviteUrl} size={210} includeMargin /></div><Chip>{expiryLabel(activeInvite.expiresAt)}</Chip><p>Students scan this code to join <b>{data.classroom.name}</b>.</p><div className="copy-link-row"><input value={inviteUrl} readOnly aria-label="Student invitation link" onFocus={(event) => event.target.select()} /><Button onClick={copyLink}><Clipboard size={16} /> {copyState}</Button></div></> : <><div className="invite-missing"><p>There isn’t an active registration invitation yet.</p><Button onClick={createQr}><Plus size={16} /> Create classroom QR</Button></div></>}</div></Modal>}
    {spotlight && <Modal title="Appreciation Wall" onClose={closeSpotlight} className="spotlight-modal"><div className="spotlight-content"><small>{spot ? `${spotIndex + 1} / ${wall.length} · ${spot.author}${spot.recipient ? ` → ${spot.recipient}` : ''}` : 'CLASS MESSAGES'}</small><p>{spot?.text || 'No messages yet.'}</p><div className="form-actions"><Button variant="secondary" onClick={() => setSpotIndex((index) => (index - 1 + wall.length) % Math.max(wall.length, 1))}><ArrowLeft size={18} /></Button><Button variant="secondary" onClick={() => setSpotIndex((index) => (index + 1) % Math.max(wall.length, 1))}><ArrowRight size={18} /></Button><Button variant="lime" onClick={closeSpotlight}>Close spotlight</Button></div></div></Modal>}
  </div>;
}
