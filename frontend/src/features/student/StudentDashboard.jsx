import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { SOURCE_SENTENCE } from '../../app/lessons.js';
import { assessParaphrase } from '../../services/assessment.js';
import { AppreciationWall, FeedbackReport, LearningStudio, PitStop, RemixTransfer } from './StudentStages.jsx';
import { Button, Chip } from '../../components/ui.jsx';

const stageNames = ['Warm-up', 'Learn', 'Practice', 'Remix', 'Feedback'];

export function StudentDashboard() {
  const { user } = useAuth();
  const { data, addWallPost, updateProgress } = useData();
  const saved = data.progress[user.id] || { stage: 0, pit: {}, assignment: null, submission: null, revision: '' };
  const stage = Math.max(0, Math.min(4, saved.stage ?? 0));
  const [remix, setRemix] = useState(saved.submission?.remix || '');
  const [academic, setAcademic] = useState(saved.submission?.academic || '');
  const [revision, setRevision] = useState(saved.revision || '');
  const [dismissedStage, setDismissedStage] = useState(false);
  const currentTeacherStage = data.classroom.stage ?? 0;
  const allSubmissions = useMemo(() => Object.entries(data.progress).flatMap(([userId, progress]) => progress.submission ? [{ ...progress.submission, userId, studentName: progress.submission.studentName || data.users.find((item) => item.id === userId)?.name || 'Student' }] : []), [data.progress, data.users]);

  useEffect(() => {
    setRemix(saved.submission?.remix || '');
    setAcademic(saved.submission?.academic || '');
    setRevision(saved.revision || '');
  }, [user.id, data.activeSectionId]);

  const changeStage = (next) => {
    if (next < 0 || next > 4) return;
    updateProgress(user.id, { stage: next });
    setDismissedStage(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const setPit = (pit) => updateProgress(user.id, { pit });
  const setAssignment = (assignment) => updateProgress(user.id, { assignment });
  const submit = ({ remix: remixText, academic: academicText }) => {
    const submission = { remix: remixText, academic: academicText, result: assessParaphrase(academicText), source: SOURCE_SENTENCE, studentName: user.name, createdAt: Date.now() };
    updateProgress(user.id, { submission, stage: 4 });
    setRemix(remixText); setAcademic(academicText);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const saveRevision = ({ revision: text, revisionResult }) => {
    setRevision(text);
    const current = data.progress[user.id]?.submission;
    if (current) updateProgress(user.id, { revision: text, revisionResult, submission: { ...current, revision: text, revisionResult } });
    else updateProgress(user.id, { revision: text, revisionResult });
  };
  const pitScore = Object.entries(saved.pit || {}).filter(([index, item]) => item.choice === [1, 0, 2][Number(index)]).length;

  const views = [
    <AppreciationWall key="wall" user={user} wall={data.wall} wallOpen={data.classroom.wallOpen} addWallPost={addWallPost} />,
    <LearningStudio key="studio" />,
    <PitStop key="pit" pit={saved.pit || {}} onChange={setPit} />,
    <RemixTransfer key="remix" wall={data.wall} userId={user.id} assignment={saved.assignment} setAssignment={setAssignment} remix={remix} setRemix={setRemix} academic={academic} setAcademic={setAcademic} submission={saved.submission} onSubmit={submit} submissionsOpen={data.classroom.submissionsOpen} />,
    <FeedbackReport key="report" submission={saved.submission} revision={revision} setRevision={setRevision} onSaveRevision={saveRevision} allSubmissions={allSubmissions} classroom={data.classroom} user={user} />,
  ];

  return <div className="student-view">
    <div className="student-hero"><div><p className="hero-eyebrow">READING &amp; WRITING · PARAPHRASING</p><h1>WORDS<br /><em>CONNECT.</em></h1><p>Same idea. New expression. The meaning stays.</p></div><div className="hero-stamp"><span>FLUENT</span><strong>SPRING</strong><small>LEARNING TOGETHER</small></div></div>
    {currentTeacherStage !== stage && !dismissedStage && <div className="teacher-banner"><span>The teacher is on <b>Stage {currentTeacherStage + 1}</b>.</span><button onClick={() => changeStage(currentTeacherStage)}>Join <ArrowRight size={15} /></button><button className="banner-dismiss" aria-label="Dismiss" onClick={() => setDismissedStage(true)}>×</button></div>}
    <div className="student-overview"><div><p className="eyebrow">YOUR LEARNING JOURNEY</p><h2>Hi, {user.name.split(' ')[0]} <span>👋</span></h2><p className="muted">{data.classroom.name} · {data.sections.find((item) => item.id === data.activeSectionId)?.name || 'Current section'}</p></div><div className="student-status"><Clock3 size={16} /><span>Stage {stage + 1} of 5</span></div></div>
    <div className="stage-progress" aria-label={`Stage ${stage + 1} of 5`}>{stageNames.map((name, index) => <button key={name} onClick={() => changeStage(index)} className={index === stage ? 'active' : index < stage ? 'complete' : ''} aria-current={index === stage ? 'step' : undefined}><span>{index < stage ? <CheckCircle2 size={16} /> : index + 1}</span><small>{name}</small></button>)}</div>
    {views[stage]}
    <nav className="stage-navigation" aria-label="Student stage navigation"><Button variant="secondary" disabled={stage === 0} onClick={() => changeStage(stage - 1)}><ArrowLeft size={17} /> Back</Button><div className="stage-nav-dots">{stageNames.map((name, index) => <button key={name} aria-label={`Go to stage ${index + 1}: ${name}`} aria-current={index === stage ? 'step' : undefined} onClick={() => changeStage(index)} className={index === stage ? 'current' : index < stage ? 'done' : ''} />)}</div><Button disabled={stage === 4} onClick={() => changeStage(stage + 1)}>Next <ArrowRight size={17} /></Button></nav>
    <div className="student-submeta"><Chip>{pitScore}/3 PIT STOP</Chip><span>Progress is saved on this device in this demo.</span></div>
  </div>;
}
