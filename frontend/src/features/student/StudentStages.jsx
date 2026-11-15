import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Lightbulb, Send, Trophy } from 'lucide-react';
import { SAMPLE_MESSAGE, PIT_STOP, SOURCE_SENTENCE } from '../../app/lessons.js';
import { assessParaphrase, feedbackLabels, issueList } from '../../services/assessment.js';
import { Button, Card, Chip, EmptyState, Metric } from '../../components/ui.jsx';

export function AppreciationWall({ user, wall = [], wallOpen, addWallPost }) {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const submit = (event) => {
    event.preventDefault(); setError(''); setSaved(false);
    if (!wallOpen) { setError('The teacher has closed the wall for now.'); return; }
    const sentences = message.trim().split(/[.!?]+/).filter((part) => part.trim());
    if (!message.trim()) { setError('Write a short message before posting.'); return; }
    if (sentences.length > 2) { setError('Keep your message to a maximum of two sentences.'); return; }
    addWallPost({ authorId: user.id, author: user.name, recipient: recipient.trim(), text: message.trim() });
    setRecipient(''); setMessage(''); setSaved(true);
  };
  return <div className="stage-stack">
    <Card><Chip>STAGE 1 · WARM-UP</Chip><h2>The Appreciation Wall</h2><p className="muted">Write a short, sincere message for someone in the class. Maximum 2 sentences.</p>
      <form onSubmit={submit} className="stage-form"><label className="field">For someone <span className="field-hint">(optional)</span><input value={recipient} onChange={(event) => setRecipient(event.target.value)} maxLength={30} placeholder="Name, or leave blank" /></label><label className="field">Your message<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={240} rows={4} placeholder="I appreciate the way you..." /></label><div className="field-meta"><span>{message.length}/240</span><span>Be kind · Be sincere</span></div>
        <div className="form-actions"><Button type="submit" disabled={!wallOpen}><Send size={16} /> Post to the wall</Button>{!wallOpen && <span className="muted">Posting is paused by your teacher.</span>}</div>{error && <div className="alert-error" role="alert">{error}</div>}{saved && <div className="alert-success" role="status">Your message is on the wall.</div>}</form>
    </Card>
    <Card><div className="section-heading"><div><h3>💚 The class wall</h3><p className="muted">A few kind words can change someone’s day.</p></div><Chip>{wall.length} messages</Chip></div>{wall.length ? <div className="wall-list">{[...wall].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40).map((post) => <article className="wall-note" key={post.id}><div className="wall-byline"><strong>{post.author}</strong>{post.recipient && <span>→ {post.recipient}</span>}<time>{new Date(post.createdAt).toLocaleString()}</time></div><p>{post.text}</p></article>)}</div> : <EmptyState title="The wall is waiting for its first message.">Start it with a sincere note for someone in your class.</EmptyState>}</Card>
  </div>;
}

const COMMON_QUESTIONS = [
  ['What is paraphrasing?', 'Paraphrasing means expressing a source idea in your own words and sentence structure while keeping its meaning.'],
  ['Do I need to change every word?', 'No. Choose accurate words that fit the context. The sentence structure should also be your own.'],
  ['Can I change the original meaning?', 'No. Keep the essential idea. Do not remove important details or add claims the source does not make.'],
  ['Do I need to cite the source?', 'Yes. A paraphrase still uses someone else’s idea, so give credit to the original source.'],
  ['How can I avoid copying?', 'Understand the idea first, look away from the source, then write it with new wording and a new sentence pattern.'],
  ['What makes a good paraphrase?', 'It keeps the key meaning, uses your own wording and structure, and includes a citation.'],
];

export function LearningStudio() {
  return <div className="stage-stack">
    <Card><Chip>STAGE 2 · LEARN</Chip><h2>The Paraphrasing Studio</h2><div className="coach-banner"><strong>What is paraphrasing?</strong><p>Expressing an existing idea in different words and sentence structure, without changing its meaning.</p></div><p><b>Why?</b> Use sources, show understanding, and avoid too many direct quotes. A paraphrase still needs a citation.</p><div className="steps-row"><div><b>1</b><strong>Understand</strong><span>Find the central idea.</span></div><div><b>2</b><strong>Reword</strong><span>Choose alternatives.</span></div><div><b>3</b><strong>Restructure</strong><span>Rebuild the sentence.</span></div></div></Card>
    <Card><h3>Watch the transformation</h3><div className="example-sentence"><small>ORIGINAL</small><p>Regular participation in university clubs can help students develop communication skills and establish social connections.</p></div><div className="example-sentence example-good"><small>PARAPHRASED</small><p>By taking part in campus clubs, students can improve their ability to communicate and build relationships with others.</p></div><p className="fine-print"><b>Notice:</b> “participation” → “taking part”; “develop” → “improve”; and the sentence now begins with “By taking part...”. The meaning is intact.</p></Card>
    <Card><h3>Common questions</h3><p className="muted">Select a question to see a short answer.</p><div className="common-questions">{COMMON_QUESTIONS.map(([question, answer]) => <details className="common-question" key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div><p className="teacher-help">Still have questions? If you have any other questions about paraphrasing, please ask your teacher.</p></Card>
  </div>;
}

export function PitStop({ quiz, pit = {}, completed, onChange }) {
  const questions = completed?.questions?.length ? completed.questions : quiz?.questions?.length ? quiz.questions : PIT_STOP.map((item, index) => ({ id: `pit-${index + 1}`, title: item.title, prompt: item.question, options: item.options, correctIndex: item.answer, feedback: item.feedback }));
  const score = completed?.score ?? questions.filter((item) => pit[item.id]?.choice === item.correctIndex).length;
  return <div className="stage-stack"><Card><Chip>STAGE 3 · PRACTICE</Chip><h2>Paraphrase Pit Stop</h2><div className="coach-banner"><strong>Mission</strong><p>Participation in university clubs enables first-year students to develop communication skills and establish social connections.</p></div>
    {quiz?.title && quiz.title !== 'Paraphrase Pit Stop' && <p className="muted">{quiz.title}</p>}<div className="quiz-list">{questions.map((item, index) => { const selected = pit[item.id]?.choice; const correct = selected === item.correctIndex; return <article className="quiz-item" key={item.id || index}><h3>{item.title || `Question ${index + 1}`}</h3><p>{item.prompt || item.question}</p><div className="choice-list">{item.options.map((option, choice) => <button type="button" key={`${item.id}-${choice}`} onClick={() => onChange({ ...pit, [item.id]: { choice, attempts: (pit[item.id]?.attempts || 0) + 1 } })} className={`choice ${selected === choice ? 'selected' : ''}`}>{String.fromCharCode(65 + choice)}. {option}</button>)}</div>{selected !== undefined && <div className={`quiz-feedback ${correct ? 'correct' : 'incorrect'}`}>{correct && <Check size={16} />}{item.feedback?.[selected] || (correct ? 'Correct answer.' : `Review the key idea. Correct answer: ${item.options[item.correctIndex]}`)}</div>}</article>; })}</div>
    <div className="pit-summary"><Metric value={`${score}/${questions.length}`} label={completed ? 'Saved score' : 'Correct so far'} icon={Trophy} /><Metric value={<Lightbulb size={28} />} label="Meaning first" /></div>{completed && <p className="fine-print">Completed answers and this quiz version are saved for your teacher to review.</p>}</Card></div>;
}

export function RemixTransfer({ wall = [], userId, assignment, setAssignment, remix, setRemix, academic, setAcademic, submission, exercise, onSubmit, submissionsOpen }) {
  const [step, setStep] = useState(submission ? 2 : 1);
  const [error, setError] = useState('');
  const source = useMemo(() => {
    if (assignment) return assignment;
    const peerPosts = wall.filter((post) => post.authorId !== userId).sort((a, b) => a.createdAt - b.createdAt);
    const hash = [...userId].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
    const peerPost = peerPosts.length ? peerPosts[hash % peerPosts.length] : null;
    return peerPost ? { id: peerPost.id, authorId: peerPost.authorId, author: peerPost.author, text: peerPost.text } : { author: 'a sample', text: SAMPLE_MESSAGE };
  }, [assignment, userId, wall]);
  const continueToAcademic = () => {
    if (!remix.trim() && !submission) { setError('Write your paraphrase of the classmate’s message first.'); return; }
    setAssignment(source); setError(''); setStep(2);
  };
  const submit = () => {
    if (!submissionsOpen) { setError('Submissions are closed by the teacher.'); return; }
    if (!academic.trim()) { setError('Write your academic paraphrase first.'); return; }
    onSubmit({ remix: remix.trim(), sourceMessage: source, academic: academic.trim(), exercise, result: assessParaphrase(academic.trim(), exercise?.sourceSentence || SOURCE_SENTENCE) }); setError('');
  };
  return <div className="stage-stack">
    {step === 1 ? <Card><Chip>STAGE 4 · STEP 1 OF 2</Chip><h2>Message Remix <span className="stage-emoji">💬</span></h2><p className="muted">Say the same thing in new words.</p><div className="example-sentence"><small>MESSAGE FROM {source.author.toUpperCase()}</small><p>{source.text}</p></div><div className="chips-row"><Chip>✓ Same meaning</Chip><Chip>✓ New words</Chip><Chip>✓ New pattern</Chip></div><label className="field">Your paraphrase<textarea rows={5} value={remix} onChange={(event) => setRemix(event.target.value)} placeholder="Express the same message differently..." /></label>{error && <div className="alert-error" role="alert">{error}</div>}<Button onClick={continueToAcademic}>Next: academic sentence <ArrowRight size={17} /></Button></Card> : <Card><Chip>STAGE 4 · STEP 2 OF 2</Chip><h2>Academic Transfer <span className="stage-emoji">🎓</span></h2><p className="muted">{exercise?.title || 'Academic Transfer'}</p><div className="example-sentence"><small>ORIGINAL ACADEMIC SENTENCE</small><p>{exercise?.sourceSentence || SOURCE_SENTENCE}</p></div><p className="muted">Find the key ideas → choose new words → rebuild the sentence.</p><label className="field">Your academic paraphrase<textarea rows={6} value={academic} onChange={(event) => setAcademic(event.target.value)} placeholder="Rewrite with your own vocabulary and structure..." /></label><div className="field-meta"><span>{academic.trim() ? academic.trim().split(/\s+/).length : 0} words</span><span>Meaning first · Your own voice</span></div>{!submissionsOpen && <div className="alert-note">Your teacher has closed submissions for now.</div>}{error && <div className="alert-error" role="alert">{error}</div>}<div className="form-actions"><Button variant="secondary" onClick={() => { setStep(1); setError(''); }}><ArrowLeft size={17} /> Back</Button><Button variant="lime" onClick={submit} disabled={!submissionsOpen}><Check size={17} /> Submit</Button></div></Card>}
    {submission && <Card className="saved-submission"><Chip>LAST SUBMISSION SAVED</Chip><p>Your latest academic paraphrase is saved. You can revise it from your report.</p><Button variant="secondary" onClick={() => setStep(2)}>Review submission <ArrowRight size={16} /></Button></Card>}
  </div>;
}

function ReportCard({ submission }) {
  if (!submission) return <EmptyState title="Your report is ready when you are.">Submit your academic paraphrase in Stage 4 to see your feedback.</EmptyState>;
  const result = submission.result || submission.automatedResult;
  if (!result) return <div className="report-details"><p>{submission.academic || submission.response}</p><p className="fine-print">No automated result was saved for this older response.</p></div>;
  const issues = issueList(result);
  return <div className="report-details"><div className="score-tile"><strong>{result.score}<small>/100</small></strong><span>Indicative automated feedback · not an official grade</span></div><div className="report-row"><div><b>Meaning coverage</b><span>{result.m}/4 key ideas found</span><div className="progress-line"><i style={{ width: `${result.m / 4 * 100}%` }} /></div></div></div><div className="report-row"><div><b>New wording</b><span>{result.nw}% of your content words differ from the source</span><div className="progress-line"><i style={{ width: `${result.nw}%` }} /></div></div></div><div className="report-row"><b>Structure</b><span>{result.re ? 'Different opening and pattern detected' : 'No clear structure change detected'}</span></div>{issues.length ? issues.map((key) => <div className="feedback-row" key={key}><b>{feedbackLabels[key]?.[0]}</b><span>{feedbackLabels[key]?.[1]} {feedbackLabels[key]?.[2]}</span></div>) : <div className="feedback-row"><b>Strong attempt</b><span>Compare both sentences once more for distortion.</span></div>}<p className="fine-print">Rule-based feedback can misjudge a good paraphrase. Your teacher makes the official assessment.</p></div>;
}

export function FeedbackReport({ submission, teacherAssessment, revision, setRevision, revisionHistory = [], onSaveRevision, allSubmissions = [], classroom, classAwards = [] }) {
  const [notice, setNotice] = useState('');
  const scores = allSubmissions.map((item) => (item.result || item.automatedResult)?.score).filter(Number.isFinite);
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : '—';
  const issueCounts = Object.fromEntries(Object.keys(feedbackLabels).map((key) => [key, allSubmissions.filter((item) => issueList(item.result || item.automatedResult).includes(key)).length]));
  const topIssues = Object.keys(issueCounts).sort((a, b) => issueCounts[b] - issueCounts[a]).filter((key) => issueCounts[key] > 0).slice(0, 2);
  const result = submission?.result || submission?.automatedResult;
  const latestRevision = revisionHistory.at(-1);
  const revisedResult = latestRevision?.automatedResult || submission?.revisionResult;
  const save = () => {
    if (!revision.trim()) { setNotice('Write your revised version first.'); return; }
    const nextResult = assessParaphrase(revision.trim(), submission?.source || SOURCE_SENTENCE);
    onSaveRevision({ revision: revision.trim(), revisionResult: nextResult });
    setNotice(`Revision saved. Indicative score: ${nextResult.score}/100.`);
    setRevision('');
  };
  return <div className="stage-stack"><Card><Chip>STAGE 5 · FEEDBACK</Chip><h2>Your Report</h2><div className="alert-note">Automated scores are indicative learning feedback, not official grades. Your teacher’s mark and feedback are the final assessment.</div><ReportCard submission={submission} />{submission && <div className="teacher-assessment-panel"><div className="section-heading"><b>Teacher assessment</b><Chip className={teacherAssessment?.grading?.status === 'reviewed' ? 'status-reviewed' : 'status-pending'}>{teacherAssessment?.grading?.status === 'reviewed' ? 'Reviewed' : 'Pending review'}</Chip></div>{teacherAssessment?.grading?.status === 'reviewed' ? <><p><b>Official mark:</b> {teacherAssessment.grading.officialMark === '' ? 'Not assigned' : `${teacherAssessment.grading.officialMark}/100`}</p><p><b>Feedback:</b> {teacherAssessment.grading.feedback || 'No written feedback.'}</p></> : <p className="muted">Your teacher has not completed the official assessment yet.</p>}</div>}
    {submission && <div className="attempt-comparison"><div><b>Original submission</b><p>{submission.academic || submission.response}</p><strong>{result?.score ?? '—'}/100 <small>automated</small></strong></div><div><b>Latest revision</b><p>{latestRevision?.response || submission.revision || 'No revision saved yet.'}</p><strong>{revisedResult?.score ?? '—'}/100 <small>automated</small></strong></div>{result && revisedResult && <p className="status-message">Change from original: {revisedResult.score - result.score > 0 ? '+' : ''}{revisedResult.score - result.score} points. This is not an official grade change.</p>}</div>}
    {revisionHistory.length > 0 && <div className="revision-history"><h3>Revision history</h3>{revisionHistory.map((item, index) => <article className="revision-entry" key={item.id}><b>Revision {index + 1} · {new Date(item.submittedAt).toLocaleString()}</b><p>{item.response}</p><span>Indicative score: {item.automatedResult?.score ?? '—'}/100</span></article>)}</div>}</Card>
    <Card><h3>Class snapshot</h3>{allSubmissions.length ? <><div className="metrics-grid"><Metric value={allSubmissions.length} label="Academic responses" /><Metric value={average} label="Average indicative score" /><Metric value={topIssues.length ? feedbackLabels[topIssues[0]][0] : '—'} label="Most common focus" /></div>{Object.entries(feedbackLabels).map(([key, item]) => <div className="difficulty-line" key={key}><div><b>{item[0]}</b><span>{issueCounts[key]} of {allSubmissions.length}</span></div><div className="progress-line"><i style={{ width: `${issueCounts[key] / allSubmissions.length * 100}%` }} /></div></div>)}</> : <EmptyState title="No class responses yet." />}</Card>
    <Card><h3>Common difficulties</h3>{topIssues.length ? topIssues.map((key) => <div className="difficulty-card" key={key}><b>{feedbackLabels[key][0]} · {issueCounts[key]} of {allSubmissions.length}</b><p>{feedbackLabels[key][1]} <strong>Tip:</strong> {feedbackLabels[key][2]}</p></div>) : <EmptyState title="No common difficulty yet." />}</Card>
    <Card><h3>Top 3 of the class</h3>{!classroom?.reveal ? <div className="alert-note">Your teacher has not revealed official class awards yet.</div> : classAwards.length ? <div className="awards-grid">{classAwards.slice(0, 3).map((award, index) => <div className="award-card" key={award.studentId}><span>{['🥇', '🥈', '🥉'][index]}</span><b>{['First', 'Second', 'Third'][index]}</b><strong>{award.name}</strong><small>{award.mark}/100 official average</small></div>)}</div> : <EmptyState title="Official awards appear after teacher reviews." />}</Card>
    <Card><h3>One last improvement</h3><p className="muted">Read your indicative feedback, then improve your academic paraphrase.</p><label className="field">Your revised version<textarea rows={5} value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="Write your revised version..." /></label><Button variant="lime" onClick={save}>Save revision</Button>{notice && <p className="status-message" role="status">{notice}</p>}</Card>
  </div>;
}
