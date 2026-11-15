import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Lightbulb, MessageCircle, Send, Sparkles, Trophy } from 'lucide-react';
import { SOURCE_SENTENCE, SAMPLE_MESSAGE, PIT_STOP, COACH_ANSWERS } from '../../app/lessons.js';
import { useData } from '../../context/DataContext.jsx';
import { assessParaphrase, feedbackLabels, issueList } from '../../services/assessment.js';
import { Button, Card, Chip, EmptyState, Metric } from '../../components/ui.jsx';

export function AppreciationWall({ user, wall, wallOpen, addWallPost }) {
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
      <form onSubmit={submit} className="stage-form"><label className="field">For someone <span className="field-hint">(optional)</span><input value={recipient} onChange={(event) => setRecipient(event.target.value)} maxLength={30} placeholder="Name, or leave blank" /></label><label className="field">Your message<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={240} rows={4} placeholder="I appreciate the way you…" /></label><div className="field-meta"><span>{message.length}/240</span><span>Be kind · Be sincere</span></div>
        <div className="form-actions"><Button type="submit" disabled={!wallOpen}><Send size={16} /> Post to the wall</Button>{!wallOpen && <span className="muted">Posting is paused by your teacher.</span>}</div>{error && <div className="alert-error" role="alert">{error}</div>}{saved && <div className="alert-success" role="status">Your message is on the wall.</div>}</form>
    </Card>
    <Card><div className="section-heading"><div><h3>💚 The class wall</h3><p className="muted">A few kind words can change someone’s day.</p></div><Chip>{wall.length} messages</Chip></div>{wall.length ? <div className="wall-list">{[...wall].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40).map((post) => <article className="wall-note" key={post.id}><div className="wall-byline"><strong>{post.author}</strong>{post.recipient && <span>→ {post.recipient}</span>}<time>{new Date(post.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div><p>{post.text}</p></article>)}</div> : <EmptyState title="The wall is waiting for its first message.">Start it with a sincere note for someone in your class.</EmptyState>}</Card>
  </div>;
}

export function LearningStudio() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const ask = (value = question) => {
    setQuestion(value);
    const found = COACH_ANSWERS.find(([pattern]) => pattern.test(value.toLowerCase()));
    setAnswer(found?.[1] || 'Try asking about synonyms, structure, meaning, citation or why we paraphrase.');
  };
  return <div className="stage-stack">
    <Card><Chip>STAGE 2 · LEARN</Chip><h2>The Paraphrasing Studio</h2><div className="coach-banner"><strong>What is paraphrasing?</strong><p>Expressing an existing idea in different words and sentence structure, without changing its meaning.</p></div><p><b>Why?</b> Use sources, show understanding, and avoid too many direct quotes. A paraphrase still needs a citation.</p><div className="steps-row"><div><b>1</b><strong>Understand</strong><span>Find the central idea.</span></div><div><b>2</b><strong>Reword</strong><span>Choose alternatives.</span></div><div><b>3</b><strong>Restructure</strong><span>Rebuild the sentence.</span></div></div></Card>
    <Card><h3>Watch the transformation</h3><div className="example-sentence"><small>ORIGINAL</small><p>Regular participation in university clubs can help students develop communication skills and establish social connections.</p></div><div className="example-sentence example-good"><small>PARAPHRASED</small><p>By taking part in campus clubs, students can improve their ability to communicate and build relationships with others.</p></div><p className="fine-print"><b>Notice:</b> “participation” → “taking part”; “develop” → “improve”; and the sentence now begins with “By taking part…”. The meaning is intact.</p></Card>
    <Card><div className="section-heading"><div><h3>🙋 Ask the Paraphrasing Coach</h3><p className="muted">Ask about a lesson idea.</p></div><Sparkles className="accent-icon" size={22} /></div><div className="quick-prompts"><button onClick={() => ask('Is changing synonyms enough?')}>Are synonyms enough?</button><button onClick={() => ask('Do I need to cite a paraphrase?')}>Do I cite?</button><button onClick={() => ask('How do I preserve meaning?')}>Keep the meaning?</button></div><form className="coach-input" onSubmit={(event) => { event.preventDefault(); ask(); }}><input aria-label="Ask a paraphrasing question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Or type your own question…" /><Button type="submit">Ask</Button></form>{answer && <div className="coach-answer" role="status"><MessageCircle size={17} /><p>{answer}</p></div>}<p className="fine-print">Prepared lesson-based coach, not a live AI chatbot.</p></Card>
  </div>;
}

export function PitStop({ pit = {}, onChange }) {
  const score = Object.entries(pit).filter(([index, value]) => value.choice === PIT_STOP[Number(index)]?.answer).length;
  return <div className="stage-stack"><Card><Chip>STAGE 3 · PRACTICE</Chip><h2>Paraphrase Pit Stop</h2><div className="coach-banner"><strong>Mission</strong><p>“Participation in university clubs enables first-year students to develop communication skills and establish social connections.”</p></div>
      <div className="quiz-list">{PIT_STOP.map((item, index) => { const selected = pit[index]?.choice; return <article className="quiz-item" key={item.title}><h3>{item.title}</h3><p>{item.question}</p><div className="choice-list">{item.options.map((option, choice) => <button type="button" key={option} onClick={() => onChange({ ...pit, [index]: { choice, attempts: (pit[index]?.attempts || 0) + 1 } })} className={`choice ${selected === choice ? 'selected' : ''}`}>{String.fromCharCode(65 + choice)}. {option}</button>)}</div>{selected !== undefined && <div className={`quiz-feedback ${selected === item.answer ? 'correct' : 'incorrect'}`}>{selected === item.answer && <Check size={16} />}{item.feedback[selected]}</div>}</article>; })}</div>
      <div className="pit-summary"><Metric value={`${score}/3`} label="Cleared" icon={Trophy} /><Metric value={<Lightbulb size={28} />} label="Meaning first" /></div></Card></div>;
}

export function RemixTransfer({ wall, userId, assignment, setAssignment, remix, setRemix, academic, setAcademic, submission, onSubmit, submissionsOpen }) {
  const [step, setStep] = useState(submission ? 2 : 1);
  const [error, setError] = useState('');
  const source = useMemo(() => {
    if (assignment) return assignment;
    const peerPosts = wall.filter((post) => post.authorId !== userId).sort((a, b) => a.createdAt - b.createdAt);
    const hash = [...userId].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
    const peerPost = peerPosts.length ? peerPosts[hash % peerPosts.length] : null;
    return peerPost ? { author: peerPost.author, text: peerPost.text } : { author: 'a sample', text: SAMPLE_MESSAGE };
  }, [assignment, userId, wall]);
  const continueToAcademic = () => {
    if (!remix.trim() && !submission) { setError('Write your paraphrase of the classmate’s message first.'); return; }
    setAssignment(source); setError(''); setStep(2);
  };
  const submit = () => {
    if (!submissionsOpen) { setError('Submissions are closed by the teacher.'); return; }
    if (!academic.trim()) { setError('Write your academic paraphrase first.'); return; }
    onSubmit({ remix, academic: academic.trim(), result: assessParaphrase(academic.trim()) }); setError('');
  };
  return <div className="stage-stack">
    {step === 1 ? <Card><Chip>STAGE 4 · STEP 1 OF 2</Chip><h2>Message Remix <span className="stage-emoji">💬</span></h2><p className="muted">Say the same thing in new words.</p><div className="example-sentence"><small>MESSAGE FROM {source.author.toUpperCase()}</small><p>{source.text}</p></div><div className="chips-row"><Chip>✓ Same meaning</Chip><Chip>✓ New words</Chip><Chip>✓ New pattern</Chip></div><label className="field">Your paraphrase<textarea rows={5} value={remix} onChange={(event) => setRemix(event.target.value)} placeholder="Express the same message differently…" /></label>{error && <div className="alert-error" role="alert">{error}</div>}<Button onClick={continueToAcademic}>Next: academic sentence <ArrowRight size={17} /></Button></Card> : <Card><Chip>STAGE 4 · STEP 2 OF 2</Chip><h2>Academic Transfer <span className="stage-emoji">🎓</span></h2><div className="example-sentence"><small>ORIGINAL ACADEMIC SENTENCE</small><p>{SOURCE_SENTENCE}</p></div><p className="muted">Find the key ideas → choose new words → rebuild the sentence.</p><label className="field">Your academic paraphrase<textarea rows={6} value={academic} onChange={(event) => setAcademic(event.target.value)} placeholder="Rewrite with your own vocabulary and structure…" /></label><div className="field-meta"><span>{academic.trim() ? academic.trim().split(/\s+/).length : 0} words</span><span>Meaning first · Your own voice</span></div>{!submissionsOpen && <div className="alert-note">Your teacher has closed submissions for now.</div>}{error && <div className="alert-error" role="alert">{error}</div>}<div className="form-actions"><Button variant="secondary" onClick={() => { setStep(1); setError(''); }}><ArrowLeft size={17} /> Back</Button><Button variant="lime" onClick={submit} disabled={!submissionsOpen}><Check size={17} /> Submit</Button></div></Card>}
    {submission && <Card className="saved-submission"><Chip>LAST SUBMISSION SAVED</Chip><p>Your latest academic paraphrase is saved. You can revise it from your report.</p><Button variant="secondary" onClick={() => setStep(2)}>Review submission <ArrowRight size={16} /></Button></Card>}
  </div>;
}

function awardsFor(submissions) {
  if (!submissions.length) return null;
  const eligible = submissions.filter((item) => !issueList(item.result).includes('changed') && !item.result.cp);
  const best = (sorter, used) => {
    const remaining = submissions.filter((item) => !used.has(item.userId));
    const pool = remaining.filter((item) => eligible.includes(item));
    const winner = [...(pool.length ? pool : remaining)].sort(sorter)[0];
    if (winner) used.add(winner.userId);
    return winner;
  };
  const used = new Set();
  return [
    { title: 'Meaning Keeper', note: 'Best meaning preservation', winner: best((a, b) => b.result.m - a.result.m || b.result.score - a.result.score, used) },
    { title: 'Structure Shifter', note: 'Best restructuring', winner: best((a, b) => b.result.re - a.result.re || b.result.nw - a.result.nw || b.result.score - a.result.score, used) },
    { title: 'Academic Precision', note: 'Strongest overall', winner: best((a, b) => b.result.score - a.result.score || b.result.nw - a.result.nw, used) },
  ];
}

function ReportCard({ submission }) {
  if (!submission) return <EmptyState title="Your report is ready when you are.">Submit your academic paraphrase in Stage 4 to see your feedback.</EmptyState>;
  const result = submission.result;
  const issues = issueList(result);
  return <div className="report-details"><div className="score-tile"><strong>{result.score}<small>/100</small></strong><span>Indicative score*</span></div><div className="report-row"><div><b>Meaning coverage</b><span>{result.m}/4 key ideas found (activity, social side, skills, personal development)</span><div className="progress-line"><i style={{ width: `${result.m / 4 * 100}%` }} /></div></div></div><div className="report-row"><div><b>New wording</b><span>{result.nw}% of your content words differ from the source</span><div className="progress-line"><i style={{ width: `${result.nw}%` }} /></div></div></div><div className="report-row"><b>Structure</b><span>{result.re ? 'Different opening and pattern detected ✓' : 'No clear structure change detected'}</span></div>{issues.length ? issues.map((key) => <div className="feedback-row" key={key}><b>{feedbackLabels[key]?.[0]}</b><span>{feedbackLabels[key]?.[1]} {feedbackLabels[key]?.[2]}</span></div>) : <div className="feedback-row"><b>Strong attempt 🌟</b><span>Compare both sentences once more for distortion.</span></div>}<p className="fine-print">*Rule-based check; it can misjudge a good paraphrase. Your teacher decides.</p></div>;
}

export function FeedbackReport({ submission, revision, setRevision, onSaveRevision, allSubmissions, classroom, user }) {
  const [notice, setNotice] = useState('');
  const scores = allSubmissions.map((item) => item.result.score);
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : '—';
  const issueCounts = Object.fromEntries(Object.keys(feedbackLabels).map((key) => [key, allSubmissions.filter((item) => issueList(item.result).includes(key)).length]));
  const topIssue = Object.keys(issueCounts).sort((a, b) => issueCounts[b] - issueCounts[a]).filter((key) => issueCounts[key] > 0).slice(0, 2);
  const awards = awardsFor(allSubmissions);
  const save = () => {
    if (!revision.trim()) { setNotice('Write your revised version first.'); return; }
    const nextResult = assessParaphrase(revision.trim()); onSaveRevision({ revision: revision.trim(), revisionResult: nextResult });
    setNotice(`Saved. New score ${nextResult.score}/100${submission ? ` (before: ${submission.result.score}/100)` : ''}.`);
  };
  return <div className="stage-stack"><Card><Chip>STAGE 5 · FEEDBACK</Chip><h2>Your Report</h2><div className="alert-note">Scores come from a simple rule-based checker. It is a guide for revision, not a grade. Your teacher decides.</div><ReportCard submission={submission} /></Card>
    <Card><h3>📊 Class snapshot</h3>{allSubmissions.length ? <><div className="metrics-grid"><Metric value={allSubmissions.length} label="Responses" /><Metric value={average} label="Average score" /><Metric value={topIssue.length ? feedbackLabels[topIssue[0]][0] : '—'} label="Most common focus" /></div>{Object.entries(feedbackLabels).map(([key, item]) => <div className="difficulty-line" key={key}><div><b>{item[0]}</b><span>{issueCounts[key]} of {allSubmissions.length}</span></div><div className="progress-line"><i style={{ width: `${issueCounts[key] / allSubmissions.length * 100}%` }} /></div></div>)}</> : <EmptyState title="No class responses yet." />}</Card>
    <Card><h3>Common difficulties</h3>{topIssue.length ? topIssue.map((key) => <div className="difficulty-card" key={key}><b>{feedbackLabels[key][0]} · {issueCounts[key]} of {allSubmissions.length}</b><p>{feedbackLabels[key][1]} <strong>Tip:</strong> {feedbackLabels[key][2]}</p></div>) : <EmptyState title="No common difficulty yet." />}</Card>
    <Card><h3>🏆 Top 3 of the class</h3>{!classroom.reveal ? <div className="alert-note">The teacher will reveal the top 3 soon…</div> : awards ? <div className="awards-grid">{awards.map((award, index) => <div className="award-card" key={award.title}><span>{['🔐', '🔀', '🎓'][index]}</span><b>{award.title}</b><strong>{award.winner?.studentName || '—'}</strong><small>{award.note}{award.winner && ` · ${award.winner.result.score}/100`}</small></div>)}</div> : <EmptyState title="Top 3 appear after responses are submitted." />}</Card>
    <Card><h3>One last improvement</h3><p className="muted">Read your feedback, then improve your academic paraphrase.</p><label className="field">Your revised version<textarea rows={5} value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="Write your revised version…" /></label><Button variant="lime" onClick={save}>Save revision</Button>{notice && <p className="status-message" role="status">{notice}</p>}</Card>
  </div>;
}
