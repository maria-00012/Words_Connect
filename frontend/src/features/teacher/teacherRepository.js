import { requireSupabase } from '../../lib/supabase.js';
import { sha256Hex } from '../../lib/hash.js';

const stamp = (value) => value ? new Date(value).getTime() : null;
const checked = (result) => {
  if (result.error) throw result.error;
  return result.data;
};
const emptyQuiz = () => ({ id: null, title: 'Paraphrase Pit Stop', questions: [] });
const emptySection = (row) => ({
  id: row.id, name: row.name, status: row.status, createdAt: stamp(row.created_at),
  updatedAt: stamp(row.updated_at), archivedAt: stamp(row.archived_at),
  studentIds: [], settings: { stage: row.current_stage, wallOpen: row.wall_open,
    submissionsOpen: row.submissions_open, reveal: row.awards_revealed },
  progress: {}, submissions: [], wall: [], quiz: emptyQuiz(), pitActivityId: null,
  academicExercises: [], assignedExerciseId: null, invitations: [], canManage: false, canGrade: false,
});

export async function loadTeacherDashboard() {
  const client = requireSupabase();
  const { data: sessionResult, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionResult.session?.user?.id;
  if (!userId) throw new Error('Your teacher session expired. Log in again.');

  const classroomRows = checked(await client.from('classrooms').select('id, owner_teacher_id, name, status, current_stage, wall_open, submissions_open, awards_revealed, created_at, updated_at, archived_at').order('created_at', { ascending: true }));
  if (!classroomRows?.length) return { userId, sections: [], activeSectionId: null, users: [], invites: [], classroom: null };
  const classroomIds = classroomRows.map((row) => row.id);
  const queries = await Promise.all([
    client.from('classroom_staff').select('classroom_id, teacher_id, permission').eq('teacher_id', userId).in('classroom_id', classroomIds),
    client.from('classroom_memberships').select('classroom_id, student_id, status, joined_at, ended_at').in('classroom_id', classroomIds),
    client.from('classroom_activities').select('id, classroom_id, activity_type, title, status, position, prompt_snapshot, quiz_version_id, created_at, updated_at').in('classroom_id', classroomIds).order('position'),
    client.from('quizzes').select('id, classroom_id, title, created_at').in('classroom_id', classroomIds),
    client.from('quiz_versions').select('id, classroom_id, quiz_id, version_number, status, published_at').in('classroom_id', classroomIds),
    client.from('academic_exercises').select('id, classroom_id, exercise_family_id, version_number, title, source_sentence, status, created_at').in('classroom_id', classroomIds),
    client.from('academic_exercise_assignments').select('id, classroom_id, activity_instance_id, exercise_id, source_sentence_snapshot, exercise_title_snapshot, assigned_at').in('classroom_id', classroomIds),
    client.from('student_progress').select('classroom_id, student_id, current_stage, assigned_source_submission_id, assigned_source_snapshot, updated_at').in('classroom_id', classroomIds),
    client.from('activity_submissions').select('id, classroom_id, activity_instance_id, student_id, submission_kind, author_name_snapshot, attempt_number, version_number, revision_of_submission_id, response, recipient, prompt_snapshot, exercise_id, exercise_title_snapshot, source_submission_id, source_author_id, source_author_name_snapshot, source_text_snapshot, submitted_at').in('classroom_id', classroomIds).order('submitted_at'),
    client.from('automated_assessments').select('id, classroom_id, submission_id, engine, rubric_version, score, details, created_at').in('classroom_id', classroomIds),
    client.from('teacher_assessments').select('classroom_id, submission_id, official_mark, feedback, status, reviewed_by, reviewed_at, updated_at').in('classroom_id', classroomIds),
    client.from('quiz_attempts').select('id, classroom_id, student_id, activity_instance_id, quiz_version_id, attempt_number, status, score, total, started_at, completed_at').in('classroom_id', classroomIds),
  ]);
  const [staffRows, memberships, activities, quizzes, versions, exercises, assignments, progressRows, submissions, autoRows, grades, attempts] = queries.map(checked);
  const studentsIds = [...new Set((memberships || []).map((row) => row.student_id))];
  const submissionIds = (submissions || []).map((row) => row.id);
  const versionIds = [...new Set((versions || []).filter((row) => row.status === 'published').map((row) => row.id))];
  const attemptIds = (attempts || []).map((row) => row.id);
  const more = await Promise.all([
    studentsIds.length ? client.from('profiles').select('id, display_name, email, role, status').in('id', studentsIds) : Promise.resolve({ data: [], error: null }),
    versionIds.length ? client.from('quiz_questions').select('id, classroom_id, quiz_version_id, position, title, prompt, options, feedback').in('quiz_version_id', versionIds).order('position') : Promise.resolve({ data: [], error: null }),
    versionIds.length ? client.from('quiz_answer_keys').select('classroom_id, question_id, correct_option_index').in('classroom_id', classroomIds) : Promise.resolve({ data: [], error: null }),
    attemptIds.length ? client.from('quiz_attempt_items').select('classroom_id, attempt_id, question_id, position, question_snapshot, selected_option_index, is_correct').in('attempt_id', attemptIds).order('position') : Promise.resolve({ data: [], error: null }),
    submissionIds.length ? client.from('automated_assessments').select('id, classroom_id, submission_id, engine, rubric_version, score, details, created_at').in('submission_id', submissionIds).order('created_at') : Promise.resolve({ data: [], error: null }),
  ]);
  const [profiles, questions, keys, attemptItems, detailedAutoRows] = more.map(checked);
  const userById = new Map((profiles || []).map((row) => [row.id, {
    id: row.id, name: row.display_name || row.email, email: row.email, role: row.role,
    status: row.status, membershipStatus: null,
  }]));
  (memberships || []).forEach((row) => {
    const user = userById.get(row.student_id);
    if (user) user.membershipStatus = row.status;
  });

  const autoBySubmission = new Map();
  [...(autoRows || []), ...(detailedAutoRows || [])].forEach((row) => {
    const existing = autoBySubmission.get(row.submission_id);
    if (!existing || stamp(row.created_at) > stamp(existing.created_at)) autoBySubmission.set(row.submission_id, row);
  });
  const gradeBySubmission = new Map((grades || []).map((row) => [row.submission_id, row]));
  const submissionsById = new Map((submissions || []).map((row) => [row.id, row]));
  const mappedSubmissions = (submissions || []).map((row) => {
    const activity = (activities || []).find((item) => item.id === row.activity_instance_id);
    const source = row.source_submission_id ? submissionsById.get(row.source_submission_id) : null;
    const auto = autoBySubmission.get(row.id);
    const grade = gradeBySubmission.get(row.id);
    const type = row.submission_kind === 'revision' ? 'revision' : activity?.activity_type;
    return {
      id: row.id, sectionId: row.classroom_id, activityInstanceId: row.activity_instance_id,
      type, studentId: row.student_id, studentName: row.author_name_snapshot,
      response: row.response, recipient: row.recipient || '', submittedAt: stamp(row.submitted_at),
      attemptNumber: row.attempt_number, versionNumber: row.version_number,
      parentSubmissionId: row.revision_of_submission_id,
      prompt: row.prompt_snapshot, exerciseId: row.exercise_id, exerciseTitle: row.exercise_title_snapshot,
      sourceMessage: row.source_text_snapshot ? {
        submissionId: row.source_submission_id, authorId: row.source_author_id,
        author: row.source_author_name_snapshot || source?.author_name_snapshot,
        text: row.source_text_snapshot,
      } : null,
      automatedResult: auto ? { score: Number(auto.score), ...(auto.details || {}), engine: auto.engine, rubricVersion: auto.rubric_version } : null,
      grading: grade ? { officialMark: grade.official_mark == null ? '' : Number(grade.official_mark), feedback: grade.feedback,
        status: grade.status, reviewedAt: stamp(grade.reviewed_at), updatedAt: stamp(grade.updated_at) }
        : { officialMark: '', feedback: '', status: 'pending', reviewedAt: null, updatedAt: null },
    };
  });

  const sections = await Promise.all((classroomRows || []).map(async (row) => {
    const section = emptySection(row);
    const staff = (staffRows || []).find((item) => item.classroom_id === row.id && item.teacher_id === userId);
    section.canManage = row.owner_teacher_id === userId || staff?.permission === 'manager';
    section.canGrade = section.canManage || staff?.permission === 'grader';
    section.studentIds = (memberships || []).filter((item) => item.classroom_id === row.id).map((item) => item.student_id);
    section.users = section.studentIds.map((id) => userById.get(id)).filter(Boolean);
    section.wall = mappedSubmissions.filter((item) => item.sectionId === row.id && item.type === 'appreciation' && item.parentSubmissionId == null).map((item) => ({
      id: item.id, sectionId: row.id, authorId: item.studentId, author: item.studentName,
      recipient: item.recipient, text: item.response, createdAt: item.submittedAt,
    }));
    section.submissions = mappedSubmissions.filter((item) => item.sectionId === row.id);
    section.progress = Object.fromEntries(section.studentIds.map((studentId) => {
      const p = (progressRows || []).find((item) => item.classroom_id === row.id && item.student_id === studentId);
      const completedAttempts = (attempts || []).filter((item) => item.classroom_id === row.id && item.student_id === studentId && item.status === 'completed').sort((a, b) => stamp(b.completed_at) - stamp(a.completed_at));
      const latest = completedAttempts[0];
      const items = latest ? (attemptItems || []).filter((item) => item.attempt_id === latest.id).map((item) => {
        const question = item.question_snapshot || {};
        const key = (keys || []).find((k) => k.question_id === item.question_id);
        return { id: item.question_id, title: question.title, prompt: question.prompt, options: question.options || [], feedback: question.feedback || [], correctIndex: key?.correct_option_index, answer: item.selected_option_index, isCorrect: item.is_correct };
      }) : [];
      const wallAssignment = p?.assigned_source_snapshot;
      return [studentId, {
        stage: p?.current_stage ?? 0, assignment: wallAssignment ? {
          submissionId: wallAssignment.submissionId, authorId: wallAssignment.authorId,
          author: wallAssignment.author, text: wallAssignment.text,
        } : null,
        pitCompleted: latest ? { score: latest.score, total: latest.total, completedAt: stamp(latest.completed_at), questions: items, answers: Object.fromEntries(items.map((item) => [item.id, { choice: item.answer, correct: item.isCorrect }])) } : null,
        pitAnswers: latest ? Object.fromEntries(items.map((item) => [item.id, { choice: item.answer, correct: item.isCorrect }])) : {},
        pitAttempts: completedAttempts.length,
      }];
    }));
    const activity = (activities || []).find((item) => item.classroom_id === row.id && item.activity_type === 'pit-stop');
    section.pitActivityId = activity?.id || null;
    const version = activity?.quiz_version_id ? (versions || []).find((item) => item.id === activity.quiz_version_id) : null;
    const quiz = version ? (quizzes || []).find((item) => item.id === version.quiz_id) : null;
    section.quiz = version ? {
      id: quiz?.id, versionId: version.id, title: quiz?.title || 'Paraphrase Pit Stop',
      questions: (questions || []).filter((item) => item.quiz_version_id === version.id).map((item) => ({
        id: item.id, title: item.title, prompt: item.prompt, options: item.options,
        feedback: item.feedback, correctIndex: (keys || []).find((key) => key.question_id === item.id)?.correct_option_index,
      })),
    } : emptyQuiz();
    section.academicExercises = (exercises || []).filter((item) => item.classroom_id === row.id && item.status === 'active').map((item) => ({
      id: item.id, familyId: item.exercise_family_id, versionNumber: item.version_number,
      sectionId: row.id, title: item.title, sourceSentence: item.source_sentence, createdAt: stamp(item.created_at),
    }));
    const assignment = (assignments || []).find((item) => item.classroom_id === row.id && item.activity_instance_id === (activities || []).find((a) => a.classroom_id === row.id && a.activity_type === 'academic-transfer')?.id);
    section.assignedExerciseId = assignment?.exercise_id || null;
    section.academicAssignment = assignment || null;
    section.activities = (activities || []).filter((item) => item.classroom_id === row.id);
    const rankResult = await client.rpc('get_classroom_rankings', { p_classroom_id: row.id });
    checked(rankResult);
    section.officialRankings = (rankResult.data || []).map((award) => ({
      studentId: award.student_id, name: award.display_name, mark: Number(award.official_average),
      reviewedCount: Number(award.reviewed_activity_count), rank: Number(award.rank_position),
    }));
    return section;
  }));
  const requested = (() => { try { return localStorage.getItem('wc_teacher_active_classroom_id'); } catch { return null; } })();
  const active = sections.find((section) => section.id === requested && section.status === 'open')
    || sections.find((section) => section.status === 'open') || null;
  try { if (active) localStorage.setItem('wc_teacher_active_classroom_id', active.id); } catch { /* Section choice is optional local UI state. */ }
  return {
    userId, sections, activeSectionId: active?.id || null,
    users: [...userById.values()], invites: [],
    classroom: active ? { id: active.id, name: active.name, teacherId: userId } : null,
  };
}

export function subscribeToTeacherChanges(onChange) {
  const client = requireSupabase();
  let timer;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onChange, 180);
  };
  // Realtime channel names are identifiers, not credentials. randomUUID is
  // unavailable on mobile browsers when the app is opened over plain HTTP/LAN.
  const channelId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const channel = client.channel(`teacher-dashboard-${channelId}`);
  ['classrooms', 'classroom_memberships', 'classroom_activities', 'academic_exercises',
    'academic_exercise_assignments', 'student_progress', 'activity_submissions',
    'automated_assessments', 'teacher_assessments', 'quiz_attempts'].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
  });
  channel.subscribe();
  return () => { window.clearTimeout(timer); client.removeChannel(channel); };
}

export async function saveOfficialAssessment(submissionId, grade) {
  const result = await requireSupabase().rpc('set_teacher_assessment', {
    p_submission_id: submissionId,
    p_official_mark: grade.officialMark === '' ? null : Number(grade.officialMark),
    p_feedback: grade.feedback || '', p_status: grade.status === 'reviewed' ? 'reviewed' : 'pending',
  });
  return checked(result);
}

export async function createClassroom(name) {
  const id = checked(await requireSupabase().rpc('create_classroom', { p_name: name.trim() }));
  if (!id) throw new Error('The classroom was created without returning its identifier.');
  return { id };
}

export async function changeClassroomSettings(classroomId, changes) {
  const payload = {};
  if (changes.name !== undefined) payload.name = changes.name.trim();
  if (changes.stage !== undefined) payload.current_stage = changes.stage;
  if (changes.wallOpen !== undefined) payload.wall_open = changes.wallOpen;
  if (changes.submissionsOpen !== undefined) payload.submissions_open = changes.submissionsOpen;
  if (changes.reveal !== undefined) payload.awards_revealed = changes.reveal;
  if (Object.keys(payload).length) checked(await requireSupabase().from('classrooms').update(payload).eq('id', classroomId));
}

export async function setMembership(classroomId, studentId, active) {
  const client = requireSupabase();
  const query = client.from('classroom_memberships').update(active
    ? { status: 'active', ended_at: null } : { status: 'removed', ended_at: new Date().toISOString() })
    .eq('classroom_id', classroomId).eq('student_id', studentId);
  checked(await query);
}

export async function archiveClassroom(classroomId, archived) {
  checked(await requireSupabase().rpc(archived ? 'reopen_classroom' : 'archive_classroom', { p_classroom_id: classroomId }));
}

export async function createStudentInvitation(classroomId) {
  const client = requireSupabase();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const invitationId = checked(await client.rpc('create_invitation', {
    p_token_hash: tokenHash, p_intended_role: 'student', p_email: null,
    p_classroom_id: classroomId, p_expires_at: expiresAt,
  }));
  return { id: invitationId, token, expiresAt: new Date(expiresAt).getTime() };
}

export async function getStudentInvitationStatus(invitationId) {
  const row = checked(await requireSupabase().from('invitations')
    .select('status, expires_at').eq('id', invitationId).maybeSingle());
  return row ? { status: row.status, expiresAt: stamp(row.expires_at) } : null;
}

export async function createOrUpdateQuiz(section, changedQuiz) {
  const client = requireSupabase();
  if (!changedQuiz.questions?.length) throw new Error('A published Pit Stop quiz must contain at least one question.');
  let quizId = section.quiz?.id;
  if (!quizId) quizId = checked(await client.from('quizzes').insert({ classroom_id: section.id, title: changedQuiz.title || 'Paraphrase Pit Stop' }).select('id').single()).id;
  const { data: versions, error } = await client.from('quiz_versions').select('version_number').eq('classroom_id', section.id).eq('quiz_id', quizId).order('version_number', { ascending: false }).limit(1);
  if (error) throw error;
  const version = checked(await client.from('quiz_versions').insert({ classroom_id: section.id, quiz_id: quizId, version_number: (versions?.[0]?.version_number || 0) + 1 }).select('id').single());
  const questionRows = changedQuiz.questions.map((question, position) => ({
    classroom_id: section.id, quiz_version_id: version.id, position,
    title: question.title.trim(), prompt: question.prompt.trim(), options: question.options,
    feedback: question.feedback || [],
  }));
  const savedQuestions = checked(await client.from('quiz_questions').insert(questionRows).select('id, position'));
  const keys = savedQuestions.map((question) => ({
    classroom_id: section.id, question_id: question.id,
    correct_option_index: Number(changedQuiz.questions[question.position].correctIndex),
  }));
  checked(await client.from('quiz_answer_keys').insert(keys));
  checked(await client.rpc('publish_quiz_version', { p_quiz_version_id: version.id }));
  const pit = section.activities?.find((activity) => activity.activity_type === 'pit-stop');
  if (pit) checked(await client.from('classroom_activities').update({ quiz_version_id: version.id }).eq('id', pit.id));
  else checked(await client.from('classroom_activities').insert({ classroom_id: section.id, activity_type: 'pit-stop', title: 'Paraphrase Pit Stop', status: 'open', position: 3, quiz_version_id: version.id }));
}

export async function saveAcademicExercises(section, nextExercises, nextAssignedId) {
  const client = requireSupabase();
  let activity = section.activities?.find((item) => item.activity_type === 'academic-transfer');
  if (!activity && nextExercises.length) activity = checked(await client.from('classroom_activities').insert({
    classroom_id: section.id, activity_type: 'academic-transfer', title: 'Academic Transfer', status: 'open', position: 4,
  }).select('id').single());
  const oldById = new Map(section.academicExercises.map((item) => [item.id, item]));
  const mapped = new Map();
  for (const item of nextExercises) {
    const old = oldById.get(item.id);
    if (old && old.title === item.title && old.sourceSentence === item.sourceSentence) { mapped.set(item.id, old.id); continue; }
    if (old) {
      const { data: versions, error } = await client.from('academic_exercises').select('version_number').eq('classroom_id', section.id).eq('exercise_family_id', old.familyId).order('version_number', { ascending: false }).limit(1);
      if (error) throw error;
      const created = checked(await client.from('academic_exercises').insert({
        classroom_id: section.id, exercise_family_id: old.familyId, version_number: (versions?.[0]?.version_number || old.versionNumber) + 1,
        title: item.title.trim(), source_sentence: item.sourceSentence.trim(), status: 'active',
      }).select('id').single());
      checked(await client.from('academic_exercises').update({ status: 'retired' }).eq('id', old.id));
      mapped.set(item.id, created.id);
    } else {
      const created = checked(await client.from('academic_exercises').insert({
        classroom_id: section.id, version_number: 1, title: item.title.trim(), source_sentence: item.sourceSentence.trim(), status: 'active',
      }).select('id').single());
      mapped.set(item.id, created.id);
    }
  }
  const removed = section.academicExercises.filter((item) => !nextExercises.some((next) => next.id === item.id));
  const assignedId = nextAssignedId && (mapped.get(nextAssignedId) || nextAssignedId);
  if (assignedId && activity) {
    const exercise = checked(await client.from('academic_exercises').select('id, title, source_sentence').eq('classroom_id', section.id).eq('id', assignedId).single());
    const current = section.academicAssignment;
    if (current) checked(await client.from('academic_exercise_assignments').update({
      exercise_id: exercise.id, source_sentence_snapshot: exercise.source_sentence, exercise_title_snapshot: exercise.title,
    }).eq('id', current.id));
    else checked(await client.from('academic_exercise_assignments').insert({
      classroom_id: section.id, activity_instance_id: activity.id, exercise_id: exercise.id,
      source_sentence_snapshot: exercise.source_sentence, exercise_title_snapshot: exercise.title,
    }));
  }
  if (removed.length) {
    const stillAvailable = nextExercises.length > 0;
    if (!stillAvailable && removed.some((item) => item.id === section.assignedExerciseId)) {
      throw new Error('Add and assign a replacement exercise before retiring the current assigned exercise.');
    }
    for (const item of removed) checked(await client.from('academic_exercises').update({ status: 'retired' }).eq('id', item.id));
  }
}
