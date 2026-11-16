import { requireSupabase } from '../../lib/supabase.js';

const checked = (result) => {
  if (result.error) throw result.error;
  return result.data;
};
const stamp = (value) => value ? new Date(value).getTime() : null;

const emptyQuiz = () => ({ id: null, title: 'Paraphrase Pit Stop', questions: [] });

export async function loadStudentDashboard() {
  const client = requireSupabase();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user?.id) throw new Error('Your student session expired. Log in again.');

  const memberships = checked(await client.from('classroom_memberships')
    .select('classroom_id, status, joined_at, ended_at')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: false }));
  const classroomIds = [...new Set((memberships || []).map((item) => item.classroom_id))];
  if (!classroomIds.length) return emptyStudentData(user.id);

  const classrooms = checked(await client.from('classrooms')
    .select('id, owner_teacher_id, name, status, current_stage, wall_open, submissions_open, awards_revealed, created_at, updated_at, archived_at')
    .in('id', classroomIds));
  const visibleRows = (classrooms || []).filter((row) => row.status === 'open'
    ? memberships.some((item) => item.classroom_id === row.id && item.status === 'active')
    : row.status === 'archived');
  if (!visibleRows.length) return emptyStudentData(user.id);

  const ids = visibleRows.map((row) => row.id);
  const [progressResult, activitiesResult, submissionsResult, exercisesResult, assignmentsResult, attemptsResult] = await Promise.all([
    client.from('student_progress').select('classroom_id, student_id, current_stage, assigned_source_submission_id, assigned_source_snapshot, updated_at').eq('student_id', user.id).in('classroom_id', ids),
    client.from('classroom_activities').select('id, classroom_id, activity_type, title, status, position, prompt_snapshot, quiz_version_id, created_at, updated_at').in('classroom_id', ids).order('position'),
    client.from('activity_submissions').select('id, classroom_id, activity_instance_id, student_id, submission_kind, author_name_snapshot, attempt_number, version_number, response, recipient, prompt_snapshot, exercise_id, exercise_title_snapshot, source_submission_id, source_author_id, source_author_name_snapshot, source_text_snapshot, submitted_at, revision_of_submission_id').in('classroom_id', ids).order('submitted_at'),
    client.from('academic_exercises').select('id, classroom_id, exercise_family_id, version_number, title, source_sentence, status, created_at').in('classroom_id', ids),
    client.from('academic_exercise_assignments').select('id, classroom_id, activity_instance_id, exercise_id, source_sentence_snapshot, exercise_title_snapshot, assigned_at').in('classroom_id', ids),
    client.from('quiz_attempts').select('id, classroom_id, student_id, activity_instance_id, quiz_version_id, attempt_number, status, score, total, started_at, completed_at').eq('student_id', user.id).in('classroom_id', ids).order('attempt_number'),
  ]);
  const progressRows = checked(progressResult) || [];
  const activities = checked(activitiesResult) || [];
  const submissionRows = checked(submissionsResult) || [];
  const exercises = checked(exercisesResult) || [];
  const assignments = checked(assignmentsResult) || [];
  const attempts = checked(attemptsResult) || [];
  const attemptIds = attempts.map((item) => item.id);
  const [attemptItemsResult, teacherAssessmentResult, automatedAssessmentResult] = await Promise.all([
    attemptIds.length
      ? client.from('quiz_attempt_items').select('classroom_id, attempt_id, question_id, position, question_snapshot, selected_option_index, is_correct').in('attempt_id', attemptIds).order('position')
      : Promise.resolve({ data: [], error: null }),
    client.from('teacher_assessments').select('classroom_id, submission_id, official_mark, feedback, status, reviewed_at, updated_at').in('classroom_id', ids),
    client.from('automated_assessments').select('id, classroom_id, submission_id, engine, rubric_version, score, details, created_at').in('classroom_id', ids).order('created_at'),
  ]);
  // Load only published question content. Answer keys are intentionally never
  // queried by the student client; answer correctness is returned by the
  // authenticated quiz-attempt RPC and persisted on each attempt item.
  const pitActivities = activities.filter((item) => item.activity_type === 'pit-stop' && item.quiz_version_id);
  const versionIds = [...new Set(pitActivities.map((item) => item.quiz_version_id))];
  const [versionRows, questionRows] = versionIds.length ? await Promise.all([
    client.from('quiz_versions').select('id, classroom_id, quiz_id, version_number, status, published_at').in('id', versionIds),
    client.from('quiz_questions').select('id, classroom_id, quiz_version_id, position, title, prompt, options, feedback').in('quiz_version_id', versionIds).order('position'),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const versions = checked(versionRows) || [];
  const questions = checked(questionRows) || [];
  const quizDatabaseIds = [...new Set(versions.filter((item) => item.status === 'published').map((item) => item.quiz_id))];
  const quizRowsResult = quizDatabaseIds.length
    ? await client.from('quizzes').select('id, classroom_id, title').in('id', quizDatabaseIds)
    : { data: [], error: null };
  const quizRows = checked(quizRowsResult) || [];
  const attemptItems = checked(attemptItemsResult) || [];
  const teacherAssessments = checked(teacherAssessmentResult) || [];
  const automatedAssessments = checked(automatedAssessmentResult) || [];

  const requestedId = (() => { try { return localStorage.getItem('wc_student_active_classroom_id'); } catch { return null; } })();
  const active = visibleRows.find((row) => row.id === requestedId && row.status === 'open')
    || visibleRows.find((row) => row.status === 'open')
    || visibleRows[0];
  const selectedMembership = memberships.find((item) => item.classroom_id === active.id);

  const sections = visibleRows.map((row) => {
    const wallActivityIds = new Set(activities.filter((item) => item.classroom_id === row.id && item.activity_type === 'appreciation').map((item) => item.id));
    const rows = submissionRows.filter((item) => item.classroom_id === row.id);
    const ownRows = rows.filter((item) => item.student_id === user.id);
    const autoBySubmission = new Map();
    automatedAssessments.filter((item) => item.classroom_id === row.id).forEach((item) => autoBySubmission.set(item.submission_id, item));
    const gradeBySubmission = new Map(teacherAssessments.filter((item) => item.classroom_id === row.id).map((item) => [item.submission_id, item]));
    const studentSubmissions = ownRows.map((item) => {
      const activityType = activities.find((activity) => activity.id === item.activity_instance_id)?.activity_type;
      const type = item.submission_kind === 'revision' ? 'revision' : activityType;
      const automated = autoBySubmission.get(item.id);
      const grade = gradeBySubmission.get(item.id);
      return {
        id: item.id, sectionId: row.id, studentId: user.id, studentName: item.author_name_snapshot,
        type: type === 'academic-transfer' ? 'academic-transfer' : type === 'message-remix' ? 'message-remix' : type || 'activity',
        activityInstanceId: item.activity_instance_id, submissionKind: item.submission_kind,
        attemptNumber: item.attempt_number, versionNumber: item.version_number,
        response: item.response, recipient: item.recipient, prompt: item.prompt_snapshot,
        exerciseId: item.exercise_id, exerciseTitle: item.exercise_title_snapshot,
        sourceMessage: item.source_text_snapshot ? { id: item.source_submission_id, authorId: item.source_author_id, author: item.source_author_name_snapshot, text: item.source_text_snapshot } : null,
        submittedAt: stamp(item.submitted_at), parentSubmissionId: item.revision_of_submission_id,
        ...(automated ? { automatedResult: { score: Number(automated.score), ...(automated.details || {}), engine: automated.engine, rubricVersion: automated.rubric_version } } : {}),
        grading: grade ? { officialMark: grade.official_mark == null ? '' : Number(grade.official_mark), feedback: grade.feedback, status: grade.status, reviewedAt: stamp(grade.reviewed_at), updatedAt: stamp(grade.updated_at) } : { officialMark: '', feedback: '', status: 'pending', reviewedAt: null, updatedAt: null },
      };
    });
    const wall = rows.filter((item) => wallActivityIds.has(item.activity_instance_id) && item.submission_kind === 'original').map((item) => ({
      id: item.id, sectionId: row.id, authorId: item.student_id,
      author: item.author_name_snapshot || 'Classmate', recipient: item.recipient || '',
      text: item.response, createdAt: stamp(item.submitted_at),
    }));
    const progress = progressRows.find((item) => item.classroom_id === row.id);
    const assignment = assignments.find((item) => item.classroom_id === row.id);
    const assignedExercise = assignment ? {
      id: assignment.exercise_id, familyId: exercises.find((item) => item.id === assignment.exercise_id)?.exercise_family_id,
      sectionId: row.id, title: assignment.exercise_title_snapshot,
      sourceSentence: assignment.source_sentence_snapshot,
      versionNumber: exercises.find((item) => item.id === assignment.exercise_id)?.version_number,
    } : null;
    const pitActivity = activities.find((item) => item.classroom_id === row.id && item.activity_type === 'pit-stop');
    const quizVersion = versions.find((item) => item.id === pitActivity?.quiz_version_id && item.status === 'published');
    const quizRecord = quizRows.find((item) => item.id === quizVersion?.quiz_id);
    const sectionAttempts = attempts.filter((item) => item.classroom_id === row.id && item.activity_instance_id === pitActivity?.id).map((attempt) => ({
      ...attempt,
      items: attemptItems.filter((item) => item.attempt_id === attempt.id).map((item) => ({
        id: item.question_id, position: item.position, ...(item.question_snapshot || {}),
        choice: item.selected_option_index, isCorrect: item.is_correct,
      })),
    })).sort((a, b) => a.attempt_number - b.attempt_number);
    const currentAttempt = [...sectionAttempts].reverse().find((item) => item.status === 'in_progress' && item.quiz_version_id === quizVersion?.id)
      || [...sectionAttempts].reverse().find((item) => item.status === 'completed' && item.quiz_version_id === quizVersion?.id)
      || null;
    const answerMap = Object.fromEntries((currentAttempt?.items || []).filter((item) => item.choice !== null && item.choice !== undefined).map((item) => [item.id, { choice: item.choice, correct: item.isCorrect, isCorrect: item.isCorrect }]));
    const revisionsByParent = new Map();
    studentSubmissions.filter((item) => item.type === 'revision').forEach((item) => {
      const revisions = revisionsByParent.get(item.parentSubmissionId) || [];
      revisions.push(item);
      revisionsByParent.set(item.parentSubmissionId, revisions);
    });
    const originals = studentSubmissions.filter((item) => item.submissionKind === 'original');
    const latestOriginal = (type) => originals.filter((item) => item.type === type).sort((a, b) => a.submittedAt - b.submittedAt || (a.attemptNumber || 0) - (b.attemptNumber || 0)).at(-1);
    const remixSubmission = latestOriginal('message-remix');
    const academicSubmission = latestOriginal('academic-transfer');
    const revisionHistory = academicSubmission ? (revisionsByParent.get(academicSubmission.id) || []).sort((a, b) => a.versionNumber - b.versionNumber) : [];
    const savedSubmission = academicSubmission ? {
      id: academicSubmission.id, academicSubmissionId: academicSubmission.id,
      remixSubmissionId: remixSubmission?.id || null, remix: remixSubmission?.response || '',
      academic: academicSubmission.response, sourceMessage: remixSubmission?.sourceMessage || null,
      source: academicSubmission.prompt, exerciseId: academicSubmission.exerciseId,
      exerciseTitle: academicSubmission.exerciseTitle, result: academicSubmission.automatedResult,
      studentName: academicSubmission.studentName, createdAt: academicSubmission.submittedAt,
    } : null;
    const academicExercises = exercises.filter((item) => item.classroom_id === row.id && item.status === 'active').map((item) => ({
      id: item.id, familyId: item.exercise_family_id, versionNumber: item.version_number,
      sectionId: row.id, title: item.title, sourceSentence: item.source_sentence, createdAt: stamp(item.created_at),
    }));
    return {
      id: row.id, name: row.name, status: row.status,
      createdAt: stamp(row.created_at), updatedAt: stamp(row.updated_at), archivedAt: stamp(row.archived_at),
      studentIds: [user.id], settings: { stage: row.current_stage, wallOpen: row.wall_open, submissionsOpen: row.submissions_open, reveal: row.awards_revealed },
      progress: { [user.id]: {
        stage: progress?.current_stage ?? row.current_stage ?? 0,
        pit: answerMap, pitAnswers: answerMap,
        pitCompleted: currentAttempt?.status === 'completed' ? {
          attemptId: currentAttempt.id, attemptNumber: currentAttempt.attempt_number,
          score: currentAttempt.score, total: currentAttempt.total,
          completedAt: stamp(currentAttempt.completed_at),
        } : null,
        pitAttempts: sectionAttempts.map((item) => ({ id: item.id, attemptNumber: item.attempt_number, status: item.status, score: item.score, total: item.total, completedAt: stamp(item.completed_at) })),
        assignment: progress?.assigned_source_snapshot ? {
          id: progress.assigned_source_snapshot.submissionId,
          submissionId: progress.assigned_source_snapshot.submissionId,
          authorId: progress.assigned_source_snapshot.authorId,
          author: progress.assigned_source_snapshot.author,
          text: progress.assigned_source_snapshot.text,
        } : null,
        submission: savedSubmission, revisionHistory,
      } },
      wall, submissions: studentSubmissions,
      quiz: quizVersion ? {
        id: quizRecord?.id || null, versionId: quizVersion.id, title: quizRecord?.title || 'Paraphrase Pit Stop',
        currentAttempt: currentAttempt ? { id: currentAttempt.id, status: currentAttempt.status, attemptNumber: currentAttempt.attempt_number } : null,
        attempts: sectionAttempts.map((item) => ({ id: item.id, attemptNumber: item.attempt_number, status: item.status, score: item.score, total: item.total, completedAt: stamp(item.completed_at) })),
        questions: questions.filter((item) => item.classroom_id === row.id && item.quiz_version_id === quizVersion.id).map((item) => ({
          id: item.id, title: item.title, prompt: item.prompt, options: item.options, feedback: item.feedback,
        })),
      } : emptyQuiz(), pitActivityId: pitActivity?.id || null,
      academicExercises, assignedExerciseId: assignedExercise?.id || assignment?.exercise_id || null,
      academicAssignment: assignment || null, activities: activities.filter((item) => item.classroom_id === row.id),
      canManage: false, canGrade: false, membershipStatus: selectedMembership?.status || 'active',
    };
  });
  try { if (active.status === 'open') localStorage.setItem('wc_student_active_classroom_id', active.id); } catch { /* Optional active classroom preference. */ }
  const current = sections.find((item) => item.id === active.id);
  return { userId: user.id, sections, activeSectionId: current?.id || null, users: [], invites: [], classroom: { id: active.id, name: active.name, teacherId: active.owner_teacher_id } };
}

export async function answerStudentPitStop({ activityInstanceId, questionId, selectedOptionIndex }) {
  const client = requireSupabase();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!user?.id) throw new Error('Your student session expired. Log in again.');

  const { data: attemptRows, error: attemptsError } = await client.from('quiz_attempts')
    .select('id, status, quiz_version_id').eq('activity_instance_id', activityInstanceId)
    .eq('student_id', user.id).order('attempt_number', { ascending: false }).limit(1);
  if (attemptsError) throw attemptsError;
  const activityResult = await client.from('classroom_activities').select('quiz_version_id').eq('id', activityInstanceId).single();
  if (activityResult.error) throw activityResult.error;
  let attemptId = attemptRows?.[0]?.status === 'in_progress'
    && attemptRows[0].quiz_version_id === activityResult.data.quiz_version_id
    ? attemptRows[0].id : null;
  if (!attemptId) {
    const started = await client.rpc('start_quiz_attempt', { p_activity_instance_id: activityInstanceId });
    if (started.error) throw started.error;
    attemptId = started.data;
  }

  const saved = await client.rpc('save_quiz_attempt_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_selected_option_index: selectedOptionIndex,
  });
  if (saved.error) throw saved.error;

  const { data: items, error: itemError } = await client.from('quiz_attempt_items')
    .select('selected_option_index').eq('attempt_id', attemptId);
  if (itemError) throw itemError;
  if (items?.length && items.every((item) => item.selected_option_index !== null)) {
    const completed = await client.rpc('complete_quiz_attempt', { p_attempt_id: attemptId });
    if (completed.error) throw completed.error;
  }
  return { attemptId, ...(saved.data || {}) };
}

export async function saveStudentRemixAssignment(classroomId, sourceMessage) {
  const client = requireSupabase();
  if (!sourceMessage?.id) throw new Error('Choose a classmate’s Appreciation Wall message first.');
  const { error } = await client.rpc('set_remix_assignment', {
    p_classroom_id: classroomId,
    p_source_submission_id: sourceMessage.id,
    p_sample_author: null,
    p_sample_text: null,
  });
  if (error) throw error;
}

export async function saveStudentStage(classroomId, stage) {
  const client = requireSupabase();
  const { error } = await client.rpc('set_student_stage', { p_classroom_id: classroomId, p_stage: stage });
  if (error) throw error;
}

export async function submitStudentStage4({ remixActivityId, academicActivityId, remix, academic, sourceMessage }) {
  const client = requireSupabase();
  if (!remixActivityId || !academicActivityId) throw new Error('The teacher has not assigned both Stage 4 activities yet.');
  if (!sourceMessage?.id) throw new Error('A classmate’s Appreciation Wall message is required.');
  const remixResult = await client.rpc('submit_classroom_activity', {
    p_activity_instance_id: remixActivityId,
    p_response: remix,
    p_recipient: null,
    p_source_submission_id: sourceMessage.id,
    p_sample_author: null,
    p_sample_text: null,
  });
  if (remixResult.error) throw remixResult.error;
  const academicResult = await client.rpc('submit_classroom_activity', {
    p_activity_instance_id: academicActivityId,
    p_response: academic,
    p_recipient: null,
    p_source_submission_id: null,
    p_sample_author: null,
    p_sample_text: null,
  });
  if (academicResult.error) throw academicResult.error;
  return { remixSubmissionId: remixResult.data, academicSubmissionId: academicResult.data };
}

export async function saveStudentAcademicRevision(originalSubmissionId, response) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('submit_academic_revision', {
    p_original_submission_id: originalSubmissionId,
    p_response: response,
  });
  if (error) throw error;
  return data;
}

function emptyStudentData(userId) {
  return { userId, sections: [], activeSectionId: null, users: [], invites: [], classroom: null };
}
