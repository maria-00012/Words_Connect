import { useEffect, useState } from 'react';
import { ArrowRight, Check, Plus, Save, Trash2, X } from 'lucide-react';
import { feedbackLabels, issueList } from '../../services/assessment.js';
import { Button, Card, Chip, EmptyState } from '../../components/ui.jsx';

export function Modal({ title, onClose, children, className = '' }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className={`modal-backdrop ${className}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card teacher-detail-modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-link" onClick={onClose} aria-label="Close"><X size={20} /></button></div>{children}</section></div>;
}

function GradeEditor({ record, onSave, readOnly }) {
  const [mark, setMark] = useState(record.grading?.officialMark ?? '');
  const [feedback, setFeedback] = useState(record.grading?.feedback || '');
  useEffect(() => { setMark(record.grading?.officialMark ?? ''); setFeedback(record.grading?.feedback || ''); }, [record.id, record.grading?.officialMark, record.grading?.feedback]);
  const save = (status) => onSave(record.id, {
    officialMark: mark === '' ? '' : Number(mark),
    feedback: feedback.trim(),
    status,
    reviewedAt: status === 'reviewed' ? Date.now() : record.grading?.reviewedAt || null,
  });
  return <div className="grading-panel"><div className="section-heading"><b>Teacher assessment</b><Chip className={record.grading?.status === 'reviewed' ? 'status-reviewed' : 'status-pending'}>{record.grading?.status === 'reviewed' ? 'Reviewed' : 'Pending'}</Chip></div>{record.automatedResult && <p className="muted">Automated indicative score: <b>{record.automatedResult.score}/100</b></p>}{record.type !== 'appreciation' && record.type !== 'revision' && !record.automatedResult && <p className="muted">No automated score is assigned to this activity.</p>}{readOnly ? <><p><b>Official mark:</b> {record.grading?.officialMark === '' || record.grading?.officialMark == null ? 'Not assigned' : `${record.grading.officialMark}/100`}</p><p><b>Teacher feedback:</b> {record.grading?.feedback || 'No written feedback yet.'}</p></> : <><label className="field">Official mark (0–100)<input type="number" min="0" max="100" step="0.5" value={mark} onChange={(event) => setMark(event.target.value)} /></label><label className="field">Written teacher feedback<textarea rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Feedback for this student..." /></label><div className="form-actions"><Button variant="secondary" onClick={() => save(record.grading?.status || 'pending')}><Save size={15} /> Save assessment</Button><Button variant="lime" onClick={() => save('reviewed')}><Check size={15} /> Save and mark reviewed</Button>{record.grading?.status === 'reviewed' && <Button variant="secondary" onClick={() => save('pending')}>Return to pending</Button>}</div></>}</div>;
}

function AutomatedFeedback({ result }) {
  const issues = issueList(result);
  if (!result) return null;
  return <div className="automated-feedback"><b>Automated assessment · indicative only</b><span>{result.score}/100</span>{issues.length ? <ul>{issues.map((key) => <li key={key}><b>{feedbackLabels[key]?.[0]}:</b> {feedbackLabels[key]?.[1]} {feedbackLabels[key]?.[2]}</li>)}</ul> : <p>No rule-based concerns were detected.</p>}</div>;
}

export function SubmissionCard({ record, section, submissions, users, onSaveGrade, readOnly = false }) {
  const student = users.find((item) => item.id === record.studentId);
  const parent = record.type === 'revision' ? submissions.find((item) => item.id === record.parentSubmissionId) : null;
  const labels = { appreciation: 'Appreciation Wall', 'message-remix': 'Message Remix', 'academic-transfer': 'Academic Transfer', revision: 'Revision' };
  return <article className="submission-detail-card">
    <div className="section-heading"><div><Chip>{labels[record.type] || record.type}</Chip><b>{student?.name || 'Student'}</b></div><time>{record.submittedAt ? new Date(record.submittedAt).toLocaleString() : 'Time not recorded'}</time></div>
    {record.type === 'appreciation' && <><p className="muted">To: {record.recipient || 'No recipient specified'}</p><p><b>Wall message</b></p></>}
    {record.type === 'message-remix' && <div className="source-context"><b>Original classmate message · {record.sourceMessage?.author || 'Sample message'}</b><p>{record.sourceMessage?.text || 'The original message was not saved for this legacy response.'}</p></div>}
    {record.type === 'academic-transfer' && <div className="source-context"><b>{record.exerciseTitle || 'Original academic prompt'}</b><p>{record.prompt || 'The original prompt was not saved for this legacy response.'}</p></div>}
    {record.type === 'revision' && <><div className="source-context"><b>Original academic prompt</b><p>{record.prompt || parent?.prompt || 'Prompt not recorded.'}</p></div><div className="source-context"><b>Original response</b><p>{parent?.response || 'The original response is unavailable.'}</p></div></>}
    <div className="complete-response"><b>{record.type === 'revision' ? 'Revised response' : 'Student response'}</b><p>{record.response || 'No response text recorded.'}</p></div>
    {record.type === 'academic-transfer' && <AutomatedFeedback result={record.automatedResult} />}
    {record.type === 'revision' && <AutomatedFeedback result={record.automatedResult} />}
    <GradeEditor record={record} onSave={onSaveGrade} readOnly={readOnly} />
  </article>;
}

export function StudentDetailModal({ student, section, users, onClose, onSaveGrade, readOnly = false }) {
  if (!student || !section) return null;
  const progress = section.progress[student.id] || {};
  const records = section.submissions.filter((item) => item.studentId === student.id && item.type !== 'appreciation').sort((a, b) => a.submittedAt - b.submittedAt);
  const wall = section.wall.filter((post) => post.authorId === student.id).sort((a, b) => a.createdAt - b.createdAt);
  const completed = progress.pitCompleted;
  const questions = completed?.questions || section.quiz.questions;
  const answers = completed?.answers || progress.pitAnswers || progress.pit || {};
  const score = completed?.score ?? questions.filter((item, index) => answers[item.id]?.choice === item.correctIndex || answers[String(index)]?.choice === item.correctIndex).length;
  const stageLabels = ['Wall', 'Learn', 'Pit Stop', 'Remix', 'Results'];
  return <Modal title={`${student.name} · learning history`} onClose={onClose}>
    <div className="student-detail-summary"><p><b>Student identifier</b><code>{student.id}</code></p><p><b>Section</b>{section.name}</p><p><b>Current stage</b>{stageLabels[progress.stage || 0]}</p></div>
    <Card className="detail-section"><h3>Stage 1 · Appreciation Wall</h3>{wall.length ? wall.map((post) => <article className="history-entry" key={post.id}><p>{post.text}</p><span>To: {post.recipient || 'No recipient'} · {post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Time not recorded'}</span></article>) : <EmptyState title="No wall message recorded." />}</Card>
    <Card className="detail-section"><h3>Stage 3 · Pit Stop · {score}/{completed?.total || questions.length}</h3>{questions.length ? questions.map((question, index) => { const answer = answers[question.id] || answers[String(index)]; const picked = answer?.choice; return <article className="history-entry" key={question.id || index}><b>{question.title || `Question ${index + 1}`}</b><p>{question.prompt || question.question}</p><span>Selected: {picked == null ? 'Not answered' : question.options[picked]}</span><span>Correct answer: {question.options[question.correctIndex]}</span></article>; }) : <EmptyState title="No quiz questions available." />}</Card>
    <Card className="detail-section"><h3>Stage 4 and 5 · Responses, assessment, revisions</h3>{records.length ? <div className="submission-list">{records.map((record) => <SubmissionCard key={record.id} record={record} section={section} submissions={section.submissions} users={users} onSaveGrade={onSaveGrade} readOnly={readOnly} />)}</div> : <EmptyState title="No submissions recorded." />}</Card>
  </Modal>;
}

const blankQuestion = () => ({ id: '', title: '', prompt: '', options: ['', '', ''], correctIndex: 0, feedback: [] });
export function QuizEditor({ section, updateSection }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(blankQuestion());
  const quiz = section.quiz;
  const edit = (question) => { setEditing(question.id); setDraft({ ...question, options: [...question.options] }); };
  const save = (event) => {
    event.preventDefault();
    const options = draft.options.map((item) => item.trim()).filter(Boolean);
    if (!draft.title.trim() || !draft.prompt.trim() || options.length < 2) return;
    const saved = { ...draft, id: editing || `question-${Date.now()}`, sectionId: section.id, title: draft.title.trim(), prompt: draft.prompt.trim(), options, correctIndex: Math.min(Number(draft.correctIndex), options.length - 1) };
    updateSection(section.id, { quiz: { ...quiz, questions: editing ? quiz.questions.map((item) => item.id === editing ? saved : item) : [...quiz.questions, saved] } });
    setEditing(null); setDraft(blankQuestion());
  };
  const remove = (id) => { if (window.confirm('Delete this quiz question? Completed student quiz snapshots will remain unchanged.')) updateSection(section.id, { quiz: { ...quiz, questions: quiz.questions.filter((item) => item.id !== id) } }); };
  return <Card><div className="section-heading"><div><h3>Stage 3 · Assigned Pit Stop quiz</h3><p className="muted">Questions and answer keys are saved to {section.name}.</p></div><Chip>{quiz.questions.length} questions</Chip></div>
    <div className="managed-question-list">{quiz.questions.map((question, index) => <article className="managed-question" key={question.id}><div><b>{index + 1}. {question.title}</b><p>{question.prompt}</p><small>Correct answer: {question.options[question.correctIndex]}</small></div><div className="form-actions"><Button variant="secondary" onClick={() => edit(question)}>Edit</Button><Button variant="danger" onClick={() => remove(question.id)} aria-label={`Delete ${question.title}`}><Trash2 size={15} /></Button></div></article>)}{!quiz.questions.length && <EmptyState title="This quiz has no questions yet." />}</div>
    <form className="manager-form" onSubmit={save}><h4>{editing ? 'Edit question' : 'Add a question'}</h4><label className="field">Question title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label><label className="field">Prompt<input value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} required /></label><div className="option-editor"><b>Answer options</b>{draft.options.map((option, index) => <div className="option-row" key={index}><label><input type="radio" name="correct-option" checked={Number(draft.correctIndex) === index} onChange={() => setDraft({ ...draft, correctIndex: index })} aria-label={`Set option ${index + 1} as correct`} /></label><input aria-label={`Option ${index + 1}`} value={option} onChange={(event) => setDraft({ ...draft, options: draft.options.map((item, position) => position === index ? event.target.value : item) })} />{draft.options.length > 2 && <button type="button" className="icon-link" aria-label={`Remove option ${index + 1}`} onClick={() => setDraft({ ...draft, options: draft.options.filter((_, position) => position !== index), correctIndex: Math.min(Number(draft.correctIndex), draft.options.length - 2) })}><X size={15} /></button>}</div>)}<Button type="button" variant="secondary" onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}><Plus size={15} /> Add option</Button></div><div className="form-actions"><Button variant="lime" type="submit">{editing ? 'Save question' : 'Add question'}</Button>{editing && <Button variant="secondary" type="button" onClick={() => { setEditing(null); setDraft(blankQuestion()); }}>Cancel edit</Button>}</div></form>
  </Card>;
}

export function ExerciseEditor({ section, updateSection }) {
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [sourceSentence, setSourceSentence] = useState('');
  const reset = () => { setEditingId(null); setTitle(''); setSourceSentence(''); };
  const save = (event) => {
    event.preventDefault();
    if (!title.trim() || !sourceSentence.trim()) return;
    const existing = section.academicExercises.find((item) => item.id === editingId);
    const exercise = { id: editingId || `exercise-${Date.now()}`, sectionId: section.id, title: title.trim(), sourceSentence: sourceSentence.trim(), createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now() };
    const academicExercises = editingId ? section.academicExercises.map((item) => item.id === editingId ? exercise : item) : [...section.academicExercises, exercise];
    updateSection(section.id, { academicExercises, assignedExerciseId: section.assignedExerciseId || exercise.id }); reset();
  };
  const remove = (id) => {
    if (!window.confirm('Delete this academic exercise? Existing student submissions keep their saved prompt.')) return;
    const academicExercises = section.academicExercises.filter((item) => item.id !== id);
    updateSection(section.id, { academicExercises, assignedExerciseId: section.assignedExerciseId === id ? academicExercises[0]?.id || null : section.assignedExerciseId });
  };
  return <Card><div className="section-heading"><div><h3>Stage 4 · Academic exercises</h3><p className="muted">Assign one source sentence to this section.</p></div><Chip>{section.academicExercises.length} exercises</Chip></div>
    <label className="field">Assigned exercise<select value={section.assignedExerciseId || ''} onChange={(event) => updateSection(section.id, { assignedExerciseId: event.target.value })}><option value="" disabled>Select an exercise</option>{section.academicExercises.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <div className="managed-question-list">{section.academicExercises.map((item) => <article className="managed-question" key={item.id}><div><b>{item.title}{item.id === section.assignedExerciseId ? ' · assigned' : ''}</b><p>{item.sourceSentence}</p></div><div className="form-actions"><Button variant="secondary" onClick={() => { setEditingId(item.id); setTitle(item.title); setSourceSentence(item.sourceSentence); }}>Edit</Button><Button variant="danger" onClick={() => remove(item.id)} aria-label={`Delete ${item.title}`}><Trash2 size={15} /></Button></div></article>)}</div>
    <form className="manager-form" onSubmit={save}><h4>{editingId ? 'Edit exercise' : 'Create exercise'}</h4><label className="field">Exercise title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label className="field">Academic source sentence<textarea rows={4} value={sourceSentence} onChange={(event) => setSourceSentence(event.target.value)} required /></label><div className="form-actions"><Button variant="lime" type="submit">{editingId ? 'Save exercise' : 'Create exercise'}</Button>{editingId && <Button variant="secondary" type="button" onClick={reset}>Cancel edit</Button>}</div></form>
  </Card>;
}

export function SectionSummary({ section, users, onOpenStudent }) {
  const students = users.filter((item) => section.studentIds.includes(item.id) && item.role === 'student');
  return <div className="section-report-summary"><p>{section.name} · {students.length} students · {section.submissions.length} activity records</p>{students.length ? <div className="student-list">{students.map((student) => <button className="student-row student-row-button" key={student.id} onClick={() => onOpenStudent(student)}><span className="student-row-main"><strong>{student.name}</strong><span>{section.submissions.filter((item) => item.studentId === student.id).length} recorded activities</span></span><ArrowRight size={15} aria-hidden="true" /></button>)}</div> : <EmptyState title="No students in this section." />}</div>;
}
