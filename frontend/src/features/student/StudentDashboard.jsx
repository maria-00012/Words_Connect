import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { SOURCE_SENTENCE } from '../../app/lessons.js';
import { assessParaphrase } from '../../services/assessment.js';
import { createId } from '../../services/mockApi.js';
import { officialRankings } from '../../services/grading.js';
import { AppreciationWall, FeedbackReport, LearningStudio, PitStop, RemixTransfer } from './StudentStages.jsx';
import { Button, Chip } from '../../components/ui.jsx';

const stageNames = ['Warm-up', 'Learn', 'Practice', 'Remix', 'Feedback'];

export function StudentDashboard() {
  const { user } = useAuth();
  const { data, activeSection, addWallPost, updateProgress, addSubmission, answerPitStop, saveRemixAssignment, submitStage4, saveStudentRevision, remoteStudent, remoteStatus, remoteError, retryRemote } = useData();
  const section = data.sections.find((item) => item.id === user.sectionId && item.status !== 'archived')
    || (activeSection?.studentIds.includes(user.id) ? activeSection : null)
    || [...data.sections].reverse().find((item) => item.status !== 'archived' && item.studentIds.includes(user.id))
    || data.sections.find((item) => item.studentIds.includes(user.id))
    || null;
  const saved = section?.progress[user.id] || { stage: 0, pit: {}, pitAnswers: {}, assignment: null, submission: null, revisionHistory: [] };
  const sectionSettings = section?.settings || {};
  const stage = Math.max(0, Math.min(4, saved.stage ?? 0));
  const [remix, setRemix] = useState(saved.submission?.remix || '');
  const [academic, setAcademic] = useState(saved.submission?.academic || '');
  const [revision, setRevision] = useState('');
  const [dismissedStage, setDismissedStage] = useState(false);
  const [notice, setNotice] = useState('');
  const quiz = section?.quiz;
  const exercise = section?.academicExercises.find((item) => item.id === section.assignedExerciseId)
    || (remoteStudent ? null : section?.academicExercises[0] || { sourceSentence: SOURCE_SENTENCE, title: 'Academic Transfer' });
  const academicSubmissions = useMemo(() => (section?.submissions || []).filter((item) => item.studentId !== undefined && item.type === 'academic-transfer'), [section?.submissions]);
  const teacherAssessment = section?.submissions.find((item) => item.type === 'academic-transfer' && item.id === (saved.submission?.academicSubmissionId || saved.submission?.id));
  const officialTopThree = useMemo(() => officialRankings(section?.submissions || [], data.users), [section?.submissions, data.users]);

  useEffect(() => {
    setRemix(saved.submission?.remix || '');
    setAcademic(saved.submission?.academic || '');
    setRevision('');
    setNotice('');
  }, [user.id, section?.id]);

  if (remoteStudent && remoteStatus === 'loading' && !data.sections.length) return <div className="student-view"><div className="student-hero"><div><p className="hero-eyebrow">READING &amp; WRITING</p><h1>WORDS<br /><em>CONNECT.</em></h1></div></div><div className="page-loading" role="status">Loading your classroom membership?</div></div>;
  if (remoteStudent && remoteStatus === 'error' && !data.sections.length) return <div className="student-view"><div className="student-hero"><div><p className="hero-eyebrow">READING &amp; WRITING</p><h1>WORDS<br /><em>CONNECT.</em></h1></div></div><div className="alert-error" role="alert">{remoteError}</div><Button variant="secondary" onClick={retryRemote}>Retry</Button></div>;
  if (!section) return <div className="student-view"><div className="student-hero"><div><p className="hero-eyebrow">READING &amp; WRITING · PARAPHRASING</p><h1>WORDS<br /><em>CONNECT.</em></h1><p>Same idea. New expression. The meaning stays.</p></div></div><div className="alert-note">This account is not assigned to an open classroom section. Ask your teacher for a section invitation.</div></div>;

  const changeStage = (next) => {
    if (next < 0 || next > 4 || section?.status === 'archived') return;
    updateProgress(user.id, { stage: next }, section.id);
    setDismissedStage(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const setPit = (answers) => {
    if (remoteStudent) return;
    const questions = quiz?.questions || [];
    const done = questions.length > 0 && questions.every((item) => answers[item.id]?.choice !== undefined);
    const score = questions.filter((item) => answers[item.id]?.choice === item.correctIndex).length;
    const completed = done ? { quizId: quiz.id, quizTitle: quiz.title, sectionId: section.id, questions: structuredClone(questions), answers: structuredClone(answers), score, total: questions.length, completedAt: Date.now() } : null;
    updateProgress(user.id, { pit: answers, pitAnswers: answers, pitCompleted: completed }, section.id);
  };
  const setAssignment = (assignment) => remoteStudent
    ? saveRemixAssignment(section.id, assignment)
    : updateProgress(user.id, { assignment }, section.id);
  const submit = async ({ remix: remixText, sourceMessage, academic: academicText, exercise: assignedExercise, result }) => {
    if (remoteStudent) {
      const ids = await submitStage4(section.id, { remix: remixText, sourceMessage, academic: academicText });
      setRemix(remixText); setAcademic(academicText);
      await updateProgress(user.id, { stage: 4 }, section.id);
      updateProgress(user.id, { submission: {
        id: ids.academicSubmissionId, academicSubmissionId: ids.academicSubmissionId,
        remixSubmissionId: ids.remixSubmissionId, remix: remixText, academic: academicText,
        sourceMessage, source: assignedExercise?.sourceSentence, result,
        studentName: user.name, createdAt: Date.now(),
      } }, section.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const timestamp = Date.now();
    const remixRecord = { id: createId('submission'), type: 'message-remix', studentId: user.id, sectionId: section.id, sourceMessage, response: remixText, submittedAt: timestamp };
    const academicResult = assessParaphrase(academicText, assignedExercise?.sourceSentence || SOURCE_SENTENCE);
    const academicRecord = { id: createId('submission'), type: 'academic-transfer', studentId: user.id, sectionId: section.id, prompt: assignedExercise?.sourceSentence || SOURCE_SENTENCE, exerciseId: assignedExercise?.id, exerciseTitle: assignedExercise?.title, response: academicText, submittedAt: timestamp, automatedResult: academicResult };
    const submission = { id: academicRecord.id, remixSubmissionId: remixRecord.id, academicSubmissionId: academicRecord.id, remix: remixText, academic: academicText, sourceMessage, result: academicResult, source: academicRecord.prompt, studentName: user.name, createdAt: timestamp };
    addSubmission(remixRecord, section.id);
    addSubmission(academicRecord, section.id);
    updateProgress(user.id, { submission, stage: 4 }, section.id);
    setRemix(remixText); setAcademic(academicText);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const saveRevision = ({ revision: text, revisionResult }) => {
    const current = section.progress[user.id]?.submission;
    if (remoteStudent) {
      if (!current?.academicSubmissionId) {
        setNotice('Your revision was not saved because there is no original Academic Transfer submission yet.');
        return Promise.resolve(null);
      }
      return saveStudentRevision(section.id, current.academicSubmissionId, text).then((id) => {
        const record = { id, type: 'revision', studentId: user.id, sectionId: section.id, parentSubmissionId: current.academicSubmissionId, prompt: current.source, response: text, submittedAt: Date.now(), automatedResult: revisionResult };
        updateProgress(user.id, { revisionHistory: [...(saved.revisionHistory || []), record] }, section.id);
        return id;
      }).catch((error) => {
        setNotice(`Your revision was not saved: ${error.message || 'Please try again.'}`);
        return null;
      });
    }
    const record = { id: createId('revision'), type: 'revision', studentId: user.id, sectionId: section.id, parentSubmissionId: current?.academicSubmissionId || current?.id, prompt: current?.source || exercise?.sourceSentence || SOURCE_SENTENCE, response: text, submittedAt: Date.now(), automatedResult: revisionResult };
    addSubmission(record, section.id);
    updateProgress(user.id, { revision: text, revisionResult, revisionHistory: [...(saved.revisionHistory || []), record] }, section.id);
  };
  const pitScore = saved.pitCompleted?.score ?? (remoteStudent
    ? Object.values(saved.pitAnswers || saved.pit || {}).filter((answer) => answer.isCorrect ?? answer.correct).length
    : Object.entries(saved.pitAnswers || saved.pit || {}).filter(([id, answer]) => {
    const question = quiz?.questions?.find((item) => item.id === id);
    return question && answer.choice === question.correctIndex;
  }).length);
  const classroom = { ...sectionSettings, name: data.classroom.name, sectionName: section?.name };
  const views = [
    <AppreciationWall key="wall" user={user} wall={section?.wall || []} wallOpen={sectionSettings.wallOpen && section?.status !== 'archived'} addWallPost={(post) => addWallPost(post, section.id)} />,
    <LearningStudio key="studio" />,
    <PitStop key="pit" quiz={quiz} pit={saved.pitAnswers || saved.pit || {}} completed={saved.pitCompleted} attempts={saved.pitAttempts || quiz?.attempts || []} onChange={setPit} onAnswer={(questionId, selectedOptionIndex) => answerPitStop(section.id, section.pitActivityId, questionId, selectedOptionIndex)} serverManaged={remoteStudent} activityAvailable={section?.status === 'open' && (!remoteStudent || section.activities?.find((item) => item.activity_type === 'pit-stop')?.status === 'open')} readOnly={section?.status === 'archived'} />,
    <RemixTransfer key="remix" wall={section?.wall || []} userId={user.id} assignment={saved.assignment} setAssignment={setAssignment} remix={remix} setRemix={setRemix} academic={academic} setAcademic={setAcademic} submission={saved.submission} exercise={exercise} onSubmit={submit} submissionsOpen={sectionSettings.submissionsOpen && section?.status !== 'archived' && (!remoteStudent || section.activities?.filter((item) => ['message-remix', 'academic-transfer'].includes(item.activity_type)).every((item) => item.status === 'open'))} serverManaged={remoteStudent} activityReady={!remoteStudent || Boolean(section.activities?.some((item) => item.activity_type === 'message-remix') && section.activities?.some((item) => item.activity_type === 'academic-transfer') && section.academicAssignment && exercise)} />,
    <FeedbackReport key="report" submission={saved.submission} teacherAssessment={teacherAssessment} revision={revision} setRevision={setRevision} revisionHistory={saved.revisionHistory || []} onSaveRevision={saveRevision} allSubmissions={academicSubmissions} classroom={classroom} classAwards={officialTopThree} />,
  ];

  return <div className="student-view">
    <div className="student-hero"><div><p className="hero-eyebrow">READING &amp; WRITING · PARAPHRASING</p><h1>WORDS<br /><em>CONNECT.</em></h1><p>Same idea. New expression. The meaning stays.</p></div><div className="hero-stamp"><span>FLUENT</span><strong>SPRING</strong><small>LEARNING TOGETHER</small></div></div>
    {section?.status === 'archived' && <div className="alert-note">This section is archived. Your learning history is available in read-only mode.</div>}
    {sectionSettings.stage !== stage && section?.status !== 'archived' && !dismissedStage && <div className="teacher-banner"><span>The teacher is on <b>Stage {sectionSettings.stage + 1}</b>.</span><button onClick={() => changeStage(sectionSettings.stage)}>Join <ArrowRight size={15} /></button><button className="banner-dismiss" aria-label="Dismiss" onClick={() => setDismissedStage(true)}>×</button></div>}
    {notice && <div className="status-message" role="status">{notice}</div>}
    <div className="student-overview"><div><p className="eyebrow">YOUR LEARNING JOURNEY</p><h2>Hi, {user.name.split(' ')[0]} <span>👋</span></h2><p className="muted">{data.classroom.name} · {section?.name || 'No assigned section'}</p></div><div className="student-status"><Clock3 size={16} /><span>Stage {stage + 1} of 5</span></div></div>
    <div className="stage-progress" aria-label={`Stage ${stage + 1} of 5`}>{stageNames.map((name, index) => <button key={name} onClick={() => changeStage(index)} className={index === stage ? 'active' : index < stage ? 'complete' : ''} aria-current={index === stage ? 'step' : undefined} disabled={section?.status === 'archived'}><span>{index < stage ? <CheckCircle2 size={16} /> : index + 1}</span><small>{name}</small></button>)}</div>
    {views[stage]}
    <nav className="stage-navigation" aria-label="Student stage navigation"><Button variant="secondary" disabled={stage === 0 || section?.status === 'archived'} onClick={() => changeStage(stage - 1)}><ArrowLeft size={17} /> Back</Button><div className="stage-nav-dots">{stageNames.map((name, index) => <button key={name} aria-label={`Go to stage ${index + 1}: ${name}`} aria-current={index === stage ? 'step' : undefined} onClick={() => changeStage(index)} className={index === stage ? 'current' : index < stage ? 'done' : ''} disabled={section?.status === 'archived'} />)}</div><Button disabled={stage === 4 || section?.status === 'archived'} onClick={() => changeStage(stage + 1)}>Next <ArrowRight size={17} /></Button></nav>
    <div className="student-submeta"><Chip>{pitScore}/{quiz?.questions.length || (remoteStudent ? 0 : 3)} PIT STOP</Chip><span>{remoteStudent ? 'Pit Stop attempts and Stage 4 submissions sync to your classroom.' : 'Progress is saved in this browser demo.'}</span></div>
  </div>;
}
