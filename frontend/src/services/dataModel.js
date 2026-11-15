import { PIT_STOP, SOURCE_SENTENCE } from '../app/lessons.js';
import { createId } from './mockApi.js';

export const DATA_KEY = 'wc_frontend_mock_data_v2';
export const LEGACY_DATA_KEY = 'wc_frontend_mock_data_v1';
export const LEGACY_BACKUP_KEY = 'wc_frontend_mock_data_v1_backup';

export const defaultQuiz = () => ({
  id: 'quiz-default',
  title: 'Paraphrase Pit Stop',
  questions: PIT_STOP.map((item, index) => ({
    id: `pit-${index + 1}`,
    title: item.title.replace(/^\d+\s+\S+\s+/, ''),
    prompt: item.question,
    options: [...item.options],
    correctIndex: item.answer,
    feedback: [...item.feedback],
  })),
});

export const defaultExercise = () => ({ id: 'exercise-default', title: 'Academic Transfer', sourceSentence: SOURCE_SENTENCE, createdAt: Date.now() });

export function createSectionRecord(section = {}, options = {}) {
  const now = Date.now();
  const id = section.id || createId('section');
  const baseQuiz = section.quiz || defaultQuiz();
  const academicExercises = section.academicExercises?.length ? section.academicExercises : [defaultExercise()];
  return {
    id,
    name: section.name || 'New section',
    createdAt: section.createdAt || now,
    updatedAt: now,
    archivedAt: section.archivedAt || null,
    status: options.status || section.status || 'open',
    studentIds: [...new Set(section.studentIds || [])],
    settings: { stage: 0, wallOpen: true, submissionsOpen: true, reveal: false, ...(section.settings || {}) },
    wall: [...(section.wall || [])],
    progress: { ...(section.progress || {}) },
    submissions: [...(section.submissions || [])],
    quiz: { ...baseQuiz, sectionId: id, questions: (baseQuiz.questions || []).map((question) => ({ ...question, sectionId: id })) },
    academicExercises: academicExercises.map((exercise) => ({ ...exercise, sectionId: id })),
    assignedExerciseId: section.assignedExerciseId || academicExercises[0]?.id || null,
  };
}

function normalizeProgress(progress = {}, studentId, sectionId, quiz) {
  const submission = progress.submission;
  const normalized = {
    ...progress,
    stage: Number.isInteger(progress.stage) ? Math.min(4, Math.max(0, progress.stage)) : 0,
    pit: progress.pit || {},
    pitAnswers: progress.pitAnswers || Object.fromEntries(Object.entries(progress.pit || {}).map(([key, value]) => [Number.isInteger(Number(key)) ? `pit-${Number(key) + 1}` : key, value])),
    revisionHistory: Array.isArray(progress.revisionHistory) ? progress.revisionHistory : [],
  };
  if (!normalized.pitCompleted && quiz?.questions?.length && quiz.questions.every((item) => normalized.pitAnswers[item.id]?.choice !== undefined)) {
    normalized.pitCompleted = {
      quizId: quiz.id, quizTitle: quiz.title, questions: structuredClone(quiz.questions), answers: structuredClone(normalized.pitAnswers),
      score: quiz.questions.filter((item) => normalized.pitAnswers[item.id]?.choice === item.correctIndex).length,
      total: quiz.questions.length, completedAt: progress.pitCompletedAt || Date.now(),
    };
  }
  const records = [];
  if (submission) {
    const timestamp = submission.createdAt || Date.now();
    const sourceMessage = progress.assignment || submission.sourceMessage || null;
    if (submission.remix) records.push({
      id: submission.remixSubmissionId || `legacy-remix-${studentId}-${timestamp}`,
      type: 'message-remix', studentId, sectionId, response: submission.remix,
      sourceMessage, submittedAt: timestamp, grading: submission.remixGrading || emptyGrading(),
    });
    if (submission.academic) records.push({
      id: submission.id || `legacy-academic-${studentId}-${timestamp}`,
      type: 'academic-transfer', studentId, sectionId, prompt: submission.source || SOURCE_SENTENCE,
      response: submission.academic, submittedAt: timestamp,
      automatedResult: submission.result || null, grading: submission.grading || emptyGrading(),
    });
    const oldRevision = progress.revision || submission.revision;
    if (!normalized.revisionHistory.length && oldRevision) normalized.revisionHistory = [{
      id: submission.revisionId || `legacy-revision-${studentId}-${timestamp}`,
      studentId, sectionId, parentSubmissionId: submission.id || `legacy-academic-${studentId}-${timestamp}`,
      response: oldRevision, submittedAt: submission.revisedAt || timestamp,
      automatedResult: progress.revisionResult || submission.revisionResult || null,
    }];
  }
  normalized._migratedSubmissions = records;
  return normalized;
}

export function emptyGrading() {
  return { officialMark: '', feedback: '', status: 'pending', reviewedAt: null, updatedAt: null };
}

function finalizeSection(section, users, sectionId) {
  const progress = {};
  const submissions = (section.submissions || []).map((record) => ({
    ...record,
    id: record.id || createId('submission'),
    sectionId: record.sectionId || sectionId,
    grading: { ...emptyGrading(), ...(record.grading || {}) },
  }));
  const studentIds = [...(section.studentIds || [])];
  const quiz = section.quiz || defaultQuiz();
  Object.entries(section.progress || {}).forEach(([studentId, item]) => {
    const value = normalizeProgress(item, studentId, sectionId, quiz);
    progress[studentId] = value;
    if (!studentIds.includes(studentId)) studentIds.push(studentId);
    value._migratedSubmissions.forEach((record) => {
      if (!submissions.some((existing) => existing.id === record.id)) submissions.push(record);
    });
    value.revisionHistory.forEach((revision) => {
      const record = { ...revision, type: 'revision', studentId, sectionId, grading: revision.grading || emptyGrading() };
      if (!submissions.some((existing) => existing.id === record.id)) submissions.push(record);
    });
    delete value._migratedSubmissions;
  });
  const wall = (section.wall || []).map((post) => ({ ...post, sectionId: post.sectionId || sectionId }));
  wall.forEach((post) => {
    if (!submissions.some((record) => record.id === post.id)) submissions.push({
      id: post.id || createId('appreciation'), type: 'appreciation', studentId: post.authorId,
      sectionId, response: post.text, recipient: post.recipient || '', submittedAt: post.createdAt || Date.now(),
      grading: emptyGrading(),
    });
  });
  return {
    ...createSectionRecord(section, { status: section.status === 'archived' ? 'archived' : 'open' }),
    progress,
    quiz,
    wall,
    submissions,
    studentIds: [...new Set([...studentIds, ...wall.map((post) => post.authorId).filter(Boolean)])],
    academicExercises: (section.academicExercises || [defaultExercise()]).map((exercise) => ({
      ...exercise,
      sectionId,
      sourceSentence: exercise.sourceSentence || exercise.prompt || SOURCE_SENTENCE,
      title: exercise.title || 'Academic Transfer',
    })),
  };
}

export function normalizeState(rawState = {}) {
  const state = structuredClone(rawState);
  const users = state.users || [];
  const sectionId = state.activeSectionId || state.sections?.[0]?.id || 'section-1';
  if (state.schemaVersion >= 2 && Array.isArray(state.sections)) {
    const sections = state.sections.map((section) => finalizeSection(section, users, section.id));
    if (!sections.length) sections.push(finalizeSection(createSectionRecord({ id: sectionId, name: 'Section A' }), users, sectionId));
    let active = sections.find((section) => section.id === state.activeSectionId && section.status !== 'archived');
    if (!active) active = sections.find((section) => section.status !== 'archived');
    return { ...state, schemaVersion: 2, sections, activeSectionId: active?.id || null };
  }

  const usersWithSection = users.map((user) => ({ ...user }));
  const activeMeta = state.sections?.find((section) => section.id === sectionId) || { id: sectionId, name: 'Section A' };
  const archived = (state.archives || []).map((archive) => finalizeSection({
    ...(archive.section || {}), wall: archive.wall || [], progress: archive.progress || {},
    quiz: archive.quiz, academicExercises: archive.academicExercises, submissions: archive.submissions,
    studentIds: Object.keys(archive.progress || {}), status: 'archived', archivedAt: archive.archivedAt || archive.section?.archivedAt || null,
    }, usersWithSection, archive.section?.id || createId('section')));
  const archivedIds = new Set(archived.map((section) => section.id));
  (state.sections || []).filter((section) => section.id !== sectionId && !archivedIds.has(section.id)).forEach((section) => {
    archived.push(finalizeSection({ ...section, status: 'archived', studentIds: [] }, usersWithSection, section.id));
  });
  const current = finalizeSection({
    ...activeMeta, wall: state.wall || [], progress: state.progress || {},
    quiz: state.quiz, academicExercises: state.academicExercises, submissions: state.submissions,
    studentIds: Object.keys(state.progress || {}), settings: {
      stage: state.classroom?.stage || 0,
      wallOpen: state.classroom?.wallOpen ?? true,
      submissionsOpen: state.classroom?.submissionsOpen ?? true,
      reveal: state.classroom?.reveal ?? false,
    }, status: 'active',
    }, usersWithSection, sectionId);
  const allSections = [...archived, current];
  usersWithSection.forEach((user) => {
    if (user.role !== 'student') return;
    const currentMembership = current.studentIds.includes(user.id);
    const existing = currentMembership ? current : allSections.find((section) => section.studentIds.includes(user.id));
    user.sectionId = user.sectionId && allSections.some((section) => section.id === user.sectionId && section.status !== 'archived')
      ? user.sectionId : (existing?.id || current.id);
    const target = allSections.find((section) => section.id === user.sectionId);
    if (target && !target.studentIds.includes(user.id)) target.studentIds.push(user.id);
  });
  return {
    schemaVersion: 2,
    users: usersWithSection,
    invites: state.invites || [],
    classroom: state.classroom || { id: 'class-1', name: 'Fluent Spring', teacherId: 'u-teacher' },
    activeSectionId: current.id,
    sections: allSections,
  };
}

export function loadInitialState(storage = globalThis.localStorage, seedState) {
  const read = (key) => { try { return storage?.getItem(key) || null; } catch { return null; } };
  const current = read(DATA_KEY);
  if (current) {
    try { return normalizeState(JSON.parse(current)); }
    catch {
      try { if (!read(`${DATA_KEY}_backup_corrupt`)) storage?.setItem(`${DATA_KEY}_backup_corrupt`, current); } catch { /* Keep the malformed source untouched if backup storage is unavailable. */ }
    }
  }
  const legacy = read(LEGACY_DATA_KEY);
  if (legacy) {
    try {
      if (!read(LEGACY_BACKUP_KEY)) storage?.setItem(LEGACY_BACKUP_KEY, legacy);
      return normalizeState(JSON.parse(legacy));
    } catch { /* Legacy source remains untouched and can be recovered from its original key. */ }
  }
  return normalizeState(seedState);
}
