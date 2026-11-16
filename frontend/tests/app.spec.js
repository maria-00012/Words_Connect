import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';

const demoPassword = 'connect123';
const mockProfiles = {
  // These mock auth ids intentionally align with the separate seeded local classroom fixture.
  'student@wordsconnect.demo': { id: 'u-student', display_name: 'Maya Ahmed', role: 'student' },
  'teacher@wordsconnect.demo': { id: 'u-teacher', display_name: 'Samira Rahman', role: 'teacher' },
  'admin@wordsconnect.demo': { id: 'u-admin', display_name: 'Avery Morgan', role: 'admin' },
  'jamie@example.com': { id: 'u-student-new', display_name: 'Jamie Student', role: 'student' },
  'new.teacher@example.com': { id: 'u-teacher-new', display_name: 'Taylor Teacher', role: 'teacher' },
  'profile-error@example.com': { id: 'u-profile-error', display_name: 'Profile Error', role: 'teacher', status: 'active' },
  'slow-teacher@example.com': { id: 'u-slow-teacher', display_name: 'Slow Teacher', role: 'teacher', status: 'active' },
  'newer-teacher@example.com': { id: 'u-newer-teacher', display_name: 'Newer Teacher', role: 'teacher', status: 'active' },
  'cross-tab-teacher@example.com': { id: 'u-cross-tab-teacher', display_name: 'Cross Tab Teacher', role: 'teacher', status: 'active' },
  'pending-login@example.com': { id: 'u-pending-login', display_name: 'Pending Account', role: 'student', status: 'pending' },
  'suspended-login@example.com': { id: 'u-suspended-login', display_name: 'Suspended Account', role: 'student', status: 'suspended' },
  'invalid-role@example.com': { id: 'u-invalid-role', display_name: 'Invalid Role', role: 'visitor', status: 'active' },
  'missing-profile@example.com': { id: 'u-missing-profile', display_name: 'Missing Profile', role: 'student', status: 'active' },
  'bootstrap-owner@example.com': { id: 'u-bootstrap-owner', display_name: 'Bootstrap Owner', role: 'student', status: 'pending' },
  'bootstrap-other@example.com': { id: 'u-bootstrap-other', display_name: 'Other User', role: 'student', status: 'active' },
  'bootstrap-existing-admin@example.com': { id: 'u-bootstrap-existing', display_name: 'Existing Admin Scenario', role: 'student', status: 'pending' },
};

test.beforeEach(async ({ page }) => {
  let activeEmail = '';
  let bootstrapClaimedBy = null;
  let transientProfileFailures = 3;
  let crossTabTransientFailures = 1;
  const profileRecords = [
    { id: 'u-admin', display_name: 'Avery Morgan', email: 'admin@wordsconnect.demo', role: 'admin', status: 'active', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'u-teacher', display_name: 'Samira Rahman', email: 'teacher@wordsconnect.demo', role: 'teacher', status: 'active', created_at: '2026-01-02T00:00:00.000Z' },
    { id: 'u-student', display_name: 'Maya Ahmed', email: 'student@wordsconnect.demo', role: 'student', status: 'active', created_at: '2026-01-03T00:00:00.000Z' },
    { id: 'u-student-2', display_name: 'Rafi Hasan', email: 'rafi@wordsconnect.demo', role: 'student', status: 'active', created_at: '2026-01-04T00:00:00.000Z' },
    { id: 'u-student-3', display_name: 'Nadia Islam', email: 'nadia@wordsconnect.demo', role: 'student', status: 'active', created_at: '2026-01-05T00:00:00.000Z' },
  ];
  const ensureProfile = (email) => {
    if (email === 'missing-profile@example.com') return;
    const seed = mockProfiles[email];
    if (seed && !profileRecords.some((profile) => profile.id === seed.id)) {
      profileRecords.push({ id: seed.id, display_name: seed.display_name, email, role: seed.role, status: seed.status || 'active', created_at: new Date().toISOString() });
    }
  };
  const invitationRecords = [];
  const classroomId = '10000000-0000-4000-8000-000000000001';
  const classroomDatabaseRows = [{ id: classroomId, owner_teacher_id: 'u-teacher', name: 'Section A', status: 'open', current_stage: 0, wall_open: true, submissions_open: true, awards_revealed: false, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', archived_at: null }];
  const classroomStaffRows = [];
  const membershipDatabaseRows = ['u-student', 'u-student-2', 'u-student-3'].map((student_id, index) => ({ classroom_id: classroomId, student_id, status: 'active', joined_at: `2026-01-0${index + 1}T00:00:00.000Z`, ended_at: null }));
  const activityDatabaseRows = [
    { id: 'activity-wall-1', classroom_id: classroomId, activity_type: 'appreciation', title: 'Appreciation Wall', status: 'open', position: 1, prompt_snapshot: null, quiz_version_id: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
    { id: 'activity-remix-1', classroom_id: classroomId, activity_type: 'message-remix', title: 'Message Remix', status: 'open', position: 2, prompt_snapshot: null, quiz_version_id: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
    { id: 'activity-pit-1', classroom_id: classroomId, activity_type: 'pit-stop', title: 'Paraphrase Pit Stop', status: 'open', position: 3, prompt_snapshot: null, quiz_version_id: 'version-1', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
    { id: 'activity-academic-1', classroom_id: classroomId, activity_type: 'academic-transfer', title: 'Academic Transfer', status: 'open', position: 4, prompt_snapshot: null, quiz_version_id: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
  ];
  const quizDatabaseRows = [{ id: 'quiz-1', classroom_id: classroomId, title: 'Paraphrase Pit Stop', created_at: '2026-01-01T00:00:00.000Z' }];
  const quizVersionDatabaseRows = [{ id: 'version-1', classroom_id: classroomId, quiz_id: 'quiz-1', version_number: 1, status: 'published', published_at: '2026-01-01T00:00:00.000Z' }];
  const questionDatabaseRows = [
    { id: 'question-1', classroom_id: classroomId, quiz_version_id: 'version-1', position: 0, title: 'Meaning', prompt: 'Which answer keeps the central idea?', options: ['Keep the idea', 'Change the meaning', 'Add a new claim'], feedback: [] },
  ];
  const keyDatabaseRows = [{ classroom_id: classroomId, question_id: 'question-1', correct_option_index: 0 }];
  const exerciseDatabaseRows = [{ id: 'exercise-1', classroom_id: classroomId, exercise_family_id: 'exercise-family-1', version_number: 1, title: 'Academic Transfer', source_sentence: 'Taking part in campus activities can help students develop social skills.', status: 'active', created_at: '2026-01-01T00:00:00.000Z' }];
  const assignmentDatabaseRows = [{ id: 'assignment-1', classroom_id: classroomId, activity_instance_id: 'activity-academic-1', exercise_id: 'exercise-1', source_sentence_snapshot: exerciseDatabaseRows[0].source_sentence, exercise_title_snapshot: exerciseDatabaseRows[0].title, assigned_at: '2026-01-01T00:00:00.000Z' }];
  const progressDatabaseRows = [
    { classroom_id: classroomId, student_id: 'u-student', current_stage: 0, assigned_source_submission_id: null, assigned_source_snapshot: null },
    { classroom_id: classroomId, student_id: 'u-student-2', current_stage: 3, assigned_source_submission_id: null, assigned_source_snapshot: null },
    { classroom_id: classroomId, student_id: 'u-student-3', current_stage: 4, assigned_source_submission_id: null, assigned_source_snapshot: null },
  ];
  const submissionDatabaseRows = [
    { id: 'wall-1', classroom_id: classroomId, activity_instance_id: 'activity-wall-1', student_id: 'u-student-2', submission_kind: 'original', author_name_snapshot: 'Rafi Hasan', attempt_number: 1, version_number: 1, revision_of_submission_id: null, response: 'I appreciate the way you always welcome new ideas. It makes our group feel comfortable.', recipient: 'Maya', prompt_snapshot: null, exercise_id: null, exercise_title_snapshot: null, source_submission_id: null, source_author_id: null, source_author_name_snapshot: null, source_text_snapshot: null, submitted_at: '2026-01-02T00:00:00.000Z' },
    { id: 'wall-2', classroom_id: classroomId, activity_instance_id: 'activity-wall-1', student_id: 'u-student-3', submission_kind: 'original', author_name_snapshot: 'Nadia Islam', attempt_number: 1, version_number: 1, revision_of_submission_id: null, response: 'Your positive attitude encourages everyone to keep trying.', recipient: null, prompt_snapshot: null, exercise_id: null, exercise_title_snapshot: null, source_submission_id: null, source_author_id: null, source_author_name_snapshot: null, source_text_snapshot: null, submitted_at: '2026-01-03T00:00:00.000Z' },
    { id: 'submission-academic-1', classroom_id: classroomId, activity_instance_id: 'activity-academic-1', student_id: 'u-student-3', submission_kind: 'original', author_name_snapshot: 'Nadia Islam', attempt_number: 1, version_number: 1, revision_of_submission_id: null, response: 'By joining campus activities, students can strengthen their social abilities and grow as individuals.', recipient: null, prompt_snapshot: exerciseDatabaseRows[0].source_sentence, exercise_id: 'exercise-1', exercise_title_snapshot: exerciseDatabaseRows[0].title, source_submission_id: null, source_author_id: null, source_author_name_snapshot: null, source_text_snapshot: null, submitted_at: '2026-01-04T00:00:00.000Z' },
  ];
  const automatedDatabaseRows = [{ id: 'auto-1', classroom_id: classroomId, submission_id: 'submission-academic-1', engine: 'rule-based', rubric_version: '1', score: 87, details: { m: 4, nw: 82, re: 1, cp: 0, iss: 'structure' }, created_at: '2026-01-04T00:00:00.000Z' }];
  const gradeDatabaseRows = submissionDatabaseRows.map((row) => ({ classroom_id: classroomId, submission_id: row.id, official_mark: null, feedback: '', status: 'pending', reviewed_by: null, reviewed_at: null, updated_at: row.submitted_at }));
  const attemptDatabaseRows = [];
  const attemptItemDatabaseRows = [];
  const fixtureInviteHashes = new Map([
    ['teacher-demo-invite', { id: 'fixture-teacher-invite', intended_role: 'teacher', email: 'new.teacher@example.com', status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString() }],
    ['student-demo-invite', { id: 'fixture-student-invite', classroom_id: classroomId, intended_role: 'student', email: 'jamie@example.com', status: 'pending', expires_at: new Date(Date.now() + 86400000).toISOString() }],
    ['expired-teacher-invite', { id: 'fixture-expired-invite', intended_role: 'teacher', email: 'expired.teacher@example.com', status: 'pending', expires_at: new Date(Date.now() - 86400000).toISOString() }],
    ['used-teacher-invite', { id: 'fixture-used-invite', intended_role: 'teacher', email: 'used.teacher@example.com', status: 'consumed', expires_at: new Date(Date.now() + 86400000).toISOString() }],
  ]);
  await page.context().route('https://supabase.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' }, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' } });
    if (url.pathname === '/auth/v1/token') {
      const body = request.postDataJSON();
      activeEmail = body.email.toLowerCase();
      ensureProfile(activeEmail);
      return json(makeAuthSession(activeEmail));
    }
    if (url.pathname === '/auth/v1/signup') {
      const body = request.postDataJSON();
      activeEmail = body.email.toLowerCase();
      if (activeEmail === 'no-session@example.com') {
        const seed = { id: 'u-no-session', display_name: body.data?.display_name || 'No Session', role: 'student' };
        mockProfiles[activeEmail] = { ...seed, status: 'pending' };
        profileRecords.push({ id: seed.id, display_name: seed.display_name, email: activeEmail, role: 'student', status: 'pending', created_at: new Date().toISOString() });
        return json({ user: { id: seed.id, email: activeEmail, user_metadata: { display_name: seed.display_name } }, session: null });
      }
      const seed = mockProfiles[activeEmail] || { id: `u-${profileRecords.length + 1}`, display_name: body.data?.display_name || 'New account', role: 'student' };
      mockProfiles[activeEmail] = { ...seed, display_name: body.data?.display_name || seed.display_name, role: 'student', status: 'pending' };
      const existing = profileRecords.find((profile) => profile.email === activeEmail);
      const profile = { id: seed.id, display_name: body.data?.display_name || seed.display_name, email: activeEmail, role: 'student', status: 'pending', created_at: new Date().toISOString() };
      if (existing) Object.assign(existing, profile);
      else profileRecords.push(profile);
      return json(makeAuthSession(activeEmail));
    }
    if (url.pathname === '/auth/v1/logout') { activeEmail = ''; return route.fulfill({ status: 204 }); }
    if (url.pathname === '/auth/v1/user') {
      return json({ id: mockProfiles[activeEmail]?.id, email: activeEmail, user_metadata: { display_name: mockProfiles[activeEmail]?.display_name } });
    }
      if (url.pathname === '/rest/v1/rpc/set_student_stage' && method === 'POST') {
        const body = request.postDataJSON();
        const progress = progressDatabaseRows.find((item) => item.classroom_id === body.p_classroom_id && item.student_id === mockProfiles[activeEmail]?.id);
        if (!progress) return json({ message: 'Active student progress row required' }, 403);
        progress.current_stage = body.p_stage;
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (url.pathname === '/rest/v1/rpc/start_quiz_attempt' && method === 'POST') {
        const { p_activity_instance_id } = request.postDataJSON();
        const activity = activityDatabaseRows.find((item) => item.id === p_activity_instance_id && item.activity_type === 'pit-stop' && item.status === 'open');
        if (!activity || !membershipDatabaseRows.some((item) => item.classroom_id === activity.classroom_id && item.student_id === mockProfiles[activeEmail]?.id && item.status === 'active')) return json({ message: 'Active membership and open Pit Stop required' }, 403);
        const studentId = mockProfiles[activeEmail].id;
        const attemptNumber = Math.max(0, ...attemptDatabaseRows.filter((item) => item.activity_instance_id === activity.id && item.student_id === studentId).map((item) => item.attempt_number)) + 1;
        const attempt = { id: `attempt-${attemptNumber}`, classroom_id: activity.classroom_id, student_id: studentId, activity_instance_id: activity.id, quiz_version_id: activity.quiz_version_id, attempt_number: attemptNumber, status: 'in_progress', score: null, total: questionDatabaseRows.filter((item) => item.quiz_version_id === activity.quiz_version_id).length, started_at: new Date().toISOString(), completed_at: null };
        attemptDatabaseRows.push(attempt);
        questionDatabaseRows.filter((item) => item.quiz_version_id === activity.quiz_version_id).forEach((question) => attemptItemDatabaseRows.push({ classroom_id: activity.classroom_id, attempt_id: attempt.id, question_id: question.id, position: question.position, question_snapshot: { title: question.title, prompt: question.prompt, options: question.options, feedback: question.feedback }, selected_option_index: null, is_correct: null }));
        return json(attempt.id);
      }
      if (url.pathname === '/rest/v1/rpc/save_quiz_attempt_answer' && method === 'POST') {
        const body = request.postDataJSON();
        const attempt = attemptDatabaseRows.find((item) => item.id === body.p_attempt_id && item.student_id === mockProfiles[activeEmail]?.id && item.status === 'in_progress');
        const item = attemptItemDatabaseRows.find((row) => row.attempt_id === body.p_attempt_id && row.question_id === body.p_question_id);
        const key = keyDatabaseRows.find((row) => row.question_id === body.p_question_id);
        if (!attempt || !item || !key) return json({ message: 'Attempt is not writable' }, 403);
        item.selected_option_index = body.p_selected_option_index;
        item.is_correct = item.selected_option_index === key.correct_option_index;
        return json({ is_correct: item.is_correct, correct_option_index: key.correct_option_index, correct_option: item.question_snapshot.options[key.correct_option_index], feedback: item.question_snapshot.feedback?.[item.selected_option_index] || '' });
      }
      if (url.pathname === '/rest/v1/rpc/complete_quiz_attempt' && method === 'POST') {
        const attempt = attemptDatabaseRows.find((item) => item.id === request.postDataJSON().p_attempt_id && item.student_id === mockProfiles[activeEmail]?.id && item.status === 'in_progress');
        const items = attemptItemDatabaseRows.filter((item) => item.attempt_id === attempt?.id);
        if (!attempt || items.some((item) => item.selected_option_index === null)) return json({ message: 'Answer every question first' }, 400);
        attempt.score = items.filter((item) => item.is_correct).length;
        attempt.status = 'completed';
        attempt.completed_at = new Date().toISOString();
        return json([{ score: attempt.score, total: attempt.total }]);
      }
      if (url.pathname === '/rest/v1/rpc/set_remix_assignment' && method === 'POST') {
        const body = request.postDataJSON();
        const source = submissionDatabaseRows.find((item) => item.id === body.p_source_submission_id && item.classroom_id === body.p_classroom_id && item.student_id !== mockProfiles[activeEmail]?.id && item.activity_instance_id === 'activity-wall-1');
        if (!source) return json({ message: 'Invalid Appreciation Wall source' }, 400);
        const progress = progressDatabaseRows.find((item) => item.classroom_id === body.p_classroom_id && item.student_id === mockProfiles[activeEmail]?.id);
        if (progress) Object.assign(progress, { assigned_source_submission_id: source.id, assigned_source_snapshot: { submissionId: source.id, authorId: source.student_id, author: source.author_name_snapshot, text: source.response } });
        else progressDatabaseRows.push({ classroom_id: body.p_classroom_id, student_id: mockProfiles[activeEmail]?.id, current_stage: 0, assigned_source_submission_id: source.id, assigned_source_snapshot: { submissionId: source.id, authorId: source.student_id, author: source.author_name_snapshot, text: source.response } });
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (url.pathname === '/rest/v1/rpc/submit_classroom_activity' && method === 'POST') {
        const body = request.postDataJSON();
        const activity = activityDatabaseRows.find((item) => item.id === body.p_activity_instance_id);
        if (!activity || !membershipDatabaseRows.some((item) => item.classroom_id === activity.classroom_id && item.student_id === mockProfiles[activeEmail]?.id && item.status === 'active')) return json({ message: 'Active classroom membership required' }, 403);
        const attemptNumber = Math.max(0, ...submissionDatabaseRows.filter((item) => item.activity_instance_id === activity.id && item.student_id === mockProfiles[activeEmail]?.id && item.submission_kind === 'original').map((item) => item.attempt_number)) + 1;
        const source = body.p_source_submission_id ? submissionDatabaseRows.find((item) => item.id === body.p_source_submission_id) : null;
        const academicAssignment = assignmentDatabaseRows.find((item) => item.activity_instance_id === activity.id);
        const row = { id: `submission-${submissionDatabaseRows.length + 1}`, classroom_id: activity.classroom_id, activity_instance_id: activity.id, student_id: mockProfiles[activeEmail]?.id, submission_kind: 'original', author_name_snapshot: mockProfiles[activeEmail]?.display_name, attempt_number: attemptNumber, version_number: 1, revision_of_submission_id: null, response: body.p_response, recipient: null, prompt_snapshot: academicAssignment?.source_sentence_snapshot || null, exercise_id: academicAssignment?.exercise_id || null, exercise_title_snapshot: academicAssignment?.exercise_title_snapshot || null, source_submission_id: source?.id || null, source_author_id: source?.student_id || null, source_author_name_snapshot: source?.author_name_snapshot || null, source_text_snapshot: source?.response || null, submitted_at: new Date().toISOString() };
        submissionDatabaseRows.push(row);
        gradeDatabaseRows.push({ classroom_id: row.classroom_id, submission_id: row.id, official_mark: null, feedback: '', status: 'pending', reviewed_by: null, reviewed_at: null, updated_at: row.submitted_at });
        return json(row.id);
      }
      if (url.pathname === '/rest/v1/rpc/submit_academic_revision' && method === 'POST') {
        const body = request.postDataJSON();
        const original = submissionDatabaseRows.find((item) => item.id === body.p_original_submission_id && item.student_id === mockProfiles[activeEmail]?.id && item.submission_kind === 'original' && item.activity_instance_id === 'activity-academic-1');
        if (!original) return json({ message: 'Original Academic Transfer submission required' }, 403);
        const versionNumber = Math.max(1, ...submissionDatabaseRows.filter((item) => item.revision_of_submission_id === original.id).map((item) => item.version_number)) + 1;
        const row = { ...original, id: `submission-${submissionDatabaseRows.length + 1}`, submission_kind: 'revision', version_number: versionNumber, revision_of_submission_id: original.id, response: body.p_response, submitted_at: new Date().toISOString() };
        submissionDatabaseRows.push(row);
        gradeDatabaseRows.push({ classroom_id: row.classroom_id, submission_id: row.id, official_mark: null, feedback: '', status: 'pending', reviewed_by: null, reviewed_at: null, updated_at: row.submitted_at });
        return json(row.id);
      }
      if (url.pathname === '/rest/v1/rpc/consume_invitation') {
      const { p_token_hash: tokenHash } = request.postDataJSON();
      const invitation = invitationRecords.find((item) => item.token_hash === tokenHash)
        || [...fixtureInviteHashes.entries()].find(([rawToken]) => mockTokenHash(rawToken) === tokenHash)?.[1];
      if (!invitation) return json({ code: '22023', message: 'Invalid invitation token' }, 400);
      if (invitation.status === 'consumed') {
        if (invitation.consumed_by === mockProfiles[activeEmail]?.id) return json(invitation.id);
        return json({ code: '22023', message: 'Invitation has already been used' }, 400);
      }
      if (invitation.status !== 'pending') return json({ code: '22023', message: 'Invitation has already been used' }, 400);
      if (new Date(invitation.expires_at).getTime() <= Date.now()) return json({ code: '22023', message: 'Invitation has expired' }, 400);
      if (invitation.email && invitation.email.toLowerCase() !== activeEmail) return json({ code: '42501', message: 'Invitation email does not match this account' }, 403);
      invitation.status = 'consumed';
      invitation.consumed_by = mockProfiles[activeEmail]?.id;
      invitation.consumed_at = new Date().toISOString();
      const profile = profileRecords.find((item) => item.email === activeEmail);
      if (profile) { profile.role = invitation.intended_role; profile.status = 'active'; }
      if (mockProfiles[activeEmail]) { mockProfiles[activeEmail].role = invitation.intended_role; mockProfiles[activeEmail].status = 'active'; }
      if (invitation.intended_role === 'student') {
        const studentId = mockProfiles[activeEmail]?.id;
        const existing = membershipDatabaseRows.find((item) => item.classroom_id === invitation.classroom_id && item.student_id === studentId);
        const membership = { classroom_id: invitation.classroom_id, student_id: studentId, status: 'active', joined_at: new Date().toISOString(), ended_at: null };
        if (existing) Object.assign(existing, membership);
        else membershipDatabaseRows.push(membership);
      }
      return json(invitation.id);
    }
    if (url.pathname === '/rest/v1/rpc/create_invitation') {
      const profile = profileRecords.find((item) => item.email === activeEmail);
      const requestBody = request.postDataJSON();
      if (requestBody.p_intended_role === 'student' && activeEmail === 'teacher@wordsconnect.demo' && requestBody.p_classroom_id === classroomId) {
        const invitation = { id: `student-invite-${invitationRecords.length + 1}`, ...requestBody, intended_role: 'student', classroom_id: requestBody.p_classroom_id, token_hash: requestBody.p_token_hash, status: 'pending', expires_at: requestBody.p_expires_at };
        invitationRecords.push(invitation);
        return json(invitation.id);
      }
      if (profile?.role !== 'admin' || profile.status !== 'active') return json({ code: '42501', message: 'Only an admin may issue an email-bound teacher invitation' }, 403);
      const body = requestBody;
      if (!/^[0-9a-f]{64}$/.test(body.p_token_hash || '') || body.p_intended_role !== 'teacher' || body.p_classroom_id !== null || new Date(body.p_expires_at).getTime() <= Date.now()) {
        return json({ code: '22023', message: 'Invalid invitation request' }, 400);
      }
      const invitation = { id: `invite-${invitationRecords.length + 1}`, classroom_id: null, intended_role: 'teacher', email: body.p_email, token_hash: body.p_token_hash, status: 'pending', expires_at: body.p_expires_at, created_at: new Date().toISOString(), created_by: profile.id };
      invitationRecords.push(invitation);
      return json(invitation.id);
    }
    if (url.pathname === '/rest/v1/rpc/revoke_invitation') {
      const profile = profileRecords.find((item) => item.email === activeEmail);
      if (profile?.role !== 'admin' || profile.status !== 'active') return json({ code: '42501', message: 'Admin permission required' }, 403);
      const invitation = invitationRecords.find((item) => item.id === request.postDataJSON().p_invitation_id);
      if (!invitation) return json({ code: 'P0002', message: 'Invitation not found' }, 404);
      if (invitation.status === 'pending') invitation.status = 'revoked';
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.pathname === '/rest/v1/rpc/set_profile_status') {
      const profile = profileRecords.find((item) => item.email === activeEmail);
      if (profile?.role !== 'admin' || profile.status !== 'active') return json({ code: '42501', message: 'Admin permission required' }, 403);
      const body = request.postDataJSON();
      const target = profileRecords.find((item) => item.id === body.p_profile_id);
      if (!target || target.id === profile.id || target.status === 'pending' || !['active', 'suspended'].includes(body.p_status)) return json({ code: '22023', message: 'Invalid account status change' }, 400);
      target.status = body.p_status;
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.pathname === '/rest/v1/rpc/bootstrap_first_admin') {
      const profile = mockProfiles[activeEmail];
      if (bootstrapClaimedBy) {
        if (bootstrapClaimedBy === profile?.id && profile.role === 'admin' && profile.status === 'active') return json(profile.id);
        return json({ code: '42501', message: 'First-admin bootstrap has already been claimed' }, 403);
      }
      if (activeEmail === 'bootstrap-existing-admin@example.com') {
        return json({ code: '55000', message: 'An administrator already exists; bootstrap is unavailable' }, 409);
      }
      if (activeEmail !== 'bootstrap-owner@example.com') {
        return json({ code: '42501', message: 'This Auth account is not authorized for first-admin bootstrap' }, 403);
      }
      profile.role = 'admin';
      profile.status = 'active';
      const bootstrapRecord = profileRecords.find((item) => item.id === profile.id);
      if (bootstrapRecord) Object.assign(bootstrapRecord, { role: 'admin', status: 'active' });
      else profileRecords.push({ id: profile.id, display_name: profile.display_name, email: activeEmail, role: 'admin', status: 'active', created_at: new Date().toISOString() });
      bootstrapClaimedBy = profile.id;
      return json(profile.id);
    }
    if (url.pathname === '/rest/v1/profiles' && method === 'GET') {
      const idFilter = url.searchParams.get('id');
      if (idFilter) {
        if (idFilter.startsWith('in.')) {
          const wanted = idFilter.slice(3).replace(/[()]/g, '').split(',');
          return json(profileRecords.filter((profile) => wanted.includes(profile.id)));
        }
        const id = idFilter.replace(/^eq\./, '');
        if (id === 'u-cross-tab-teacher' && request.frame().page() !== page && crossTabTransientFailures > 0) {
          crossTabTransientFailures -= 1;
          return json({ code: '08006', message: 'Temporary cross-tab profile query failure' }, 500);
        }
        if (id === 'u-profile-error' && transientProfileFailures > 0) {
          transientProfileFailures -= 1;
          return json({ code: '08006', message: 'Temporary profile query failure' }, 500);
        }
        if (id === 'u-slow-teacher') await new Promise((resolve) => setTimeout(resolve, 700));
        const profile = profileRecords.find((item) => item.id === id);
        if (!profile) return json(null);
        return json(profile);
      }
      return json(profileRecords);
    }
    if (url.pathname === '/rest/v1/profiles' && method === 'PATCH') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/invitations' && method === 'GET') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (id) {
        const invitation = invitationRecords.find((item) => item.id === id);
        return json(invitation ? { status: invitation.status, expires_at: invitation.expires_at } : null);
      }
      return json(invitationRecords.filter((invite) => invite.intended_role === 'teacher').map(({ token_hash, ...invite }) => invite));
    }
    if (method === 'GET' && mockProfiles[activeEmail]?.role === 'student' && url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').at(-1);
      const studentId = mockProfiles[activeEmail]?.id;
      const studentMemberships = membershipDatabaseRows.filter((item) => item.student_id === studentId);
      const studentClassroomIds = [...new Set(studentMemberships.map((item) => item.classroom_id))];
      const studentWallActivities = activityDatabaseRows.filter((item) => studentClassroomIds.includes(item.classroom_id) && item.activity_type === 'appreciation').map((item) => item.id);
      const rows = {
        classroom_memberships: studentMemberships,
        classrooms: classroomDatabaseRows.filter((item) => studentClassroomIds.includes(item.id)),
        classroom_activities: activityDatabaseRows.filter((item) => studentClassroomIds.includes(item.classroom_id)),
        quizzes: quizDatabaseRows.filter((item) => studentClassroomIds.includes(item.classroom_id)),
        quiz_versions: quizVersionDatabaseRows.filter((item) => studentClassroomIds.includes(item.classroom_id) && item.status === 'published'),
        quiz_questions: questionDatabaseRows.filter((item) => studentClassroomIds.includes(item.classroom_id)),
        student_progress: progressDatabaseRows.filter((item) => item.student_id === studentId),
        activity_submissions: submissionDatabaseRows.filter((item) => item.student_id === studentId || studentWallActivities.includes(item.activity_instance_id)),
        academic_exercises: exerciseDatabaseRows.filter((item) => studentClassroomIds.includes(item.classroom_id)),
        academic_exercise_assignments: assignmentDatabaseRows.filter((item) => studentClassroomIds.includes(item.classroom_id)),
        quiz_attempts: attemptDatabaseRows.filter((item) => item.student_id === studentId && studentClassroomIds.includes(item.classroom_id)),
        quiz_attempt_items: attemptItemDatabaseRows.filter((item) => attemptDatabaseRows.some((attempt) => attempt.id === item.attempt_id && attempt.student_id === studentId)),
        teacher_assessments: gradeDatabaseRows.filter((item) => submissionDatabaseRows.some((submission) => submission.id === item.submission_id && submission.student_id === studentId) && item.status === 'reviewed'),
        automated_assessments: automatedDatabaseRows.filter((item) => submissionDatabaseRows.some((submission) => submission.id === item.submission_id && submission.student_id === studentId)),
      };
      if (rows[table]) {
        let matching = rows[table];
        if (table === 'classroom_activities' && url.searchParams.has('id')) matching = matching.filter((item) => item.id === url.searchParams.get('id')?.replace(/^eq\./, ''));
        if (table === 'quiz_attempt_items' && url.searchParams.has('attempt_id')) matching = matching.filter((item) => url.searchParams.get('attempt_id')?.includes(item.attempt_id));
        if (table === 'quiz_attempts' && url.searchParams.has('activity_instance_id')) matching = matching.filter((item) => item.activity_instance_id === url.searchParams.get('activity_instance_id')?.replace(/^eq\./, ''));
        if (request.headers().accept?.includes('vnd.pgrst.object+json')) return matching.length ? json(matching[0]) : json({ message: 'No rows found' }, 406);
        return json(matching);
      }
    }
    if (activeEmail === 'teacher@wordsconnect.demo' && url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').at(-1);
      const getRows = {
        classrooms: classroomDatabaseRows, classroom_staff: classroomStaffRows,
        classroom_memberships: membershipDatabaseRows, classroom_activities: activityDatabaseRows,
        quizzes: quizDatabaseRows, quiz_versions: quizVersionDatabaseRows,
        academic_exercises: exerciseDatabaseRows, academic_exercise_assignments: assignmentDatabaseRows,
        student_progress: progressDatabaseRows, activity_submissions: submissionDatabaseRows,
        automated_assessments: automatedDatabaseRows, teacher_assessments: gradeDatabaseRows,
        quiz_attempts: attemptDatabaseRows, quiz_questions: questionDatabaseRows,
        quiz_answer_keys: keyDatabaseRows, quiz_attempt_items: attemptItemDatabaseRows,
      };
      if (url.pathname === '/rest/v1/profiles' && method === 'GET' && url.searchParams.get('id')?.startsWith('in.')) {
        const wanted = url.searchParams.get('id').slice(4).replace(/[()]/g, '').split(',');
        return json(profileRecords.filter((profile) => wanted.includes(profile.id)));
      }
      if (url.pathname === '/rest/v1/rpc/get_classroom_rankings') {
        const awards = gradeDatabaseRows.filter((grade) => grade.status === 'reviewed' && grade.official_mark != null).map((grade) => ({ student_id: submissionDatabaseRows.find((row) => row.id === grade.submission_id)?.student_id, display_name: profileRecords.find((profile) => profile.id === submissionDatabaseRows.find((row) => row.id === grade.submission_id)?.student_id)?.display_name, official_average: grade.official_mark, reviewed_activity_count: 1, rank_position: 1 }));
        return json(awards);
      }
      if (url.pathname === '/rest/v1/rpc/set_teacher_assessment' && method === 'POST') {
        const body = request.postDataJSON();
        const grade = gradeDatabaseRows.find((row) => row.submission_id === body.p_submission_id);
        if (!grade) return json({ message: 'Submission not found' }, 404);
        Object.assign(grade, { official_mark: body.p_official_mark, feedback: body.p_feedback, status: body.p_status, reviewed_by: body.p_status === 'reviewed' ? 'u-teacher' : null, reviewed_at: body.p_status === 'reviewed' ? new Date().toISOString() : null, updated_at: new Date().toISOString() });
        return json(grade);
      }
      if (url.pathname === '/rest/v1/rpc/archive_classroom' || url.pathname === '/rest/v1/rpc/reopen_classroom') {
        const archived = url.pathname.endsWith('archive_classroom');
        const row = classroomDatabaseRows.find((item) => item.id === request.postDataJSON().p_classroom_id);
        if (row) Object.assign(row, { status: archived ? 'archived' : 'open', archived_at: archived ? new Date().toISOString() : null });
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (url.pathname === '/rest/v1/rpc/create_invitation' && method === 'POST' && request.postDataJSON().p_intended_role === 'student') return json('student-invite-id');
      if (url.pathname === '/rest/v1/rpc/publish_quiz_version' && method === 'POST') {
        const version = quizVersionDatabaseRows.find((item) => item.id === request.postDataJSON().p_quiz_version_id);
        if (version) { version.status = 'published'; version.published_at = new Date().toISOString(); }
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (method === 'GET' && table === 'academic_exercises' && url.searchParams.has('id')) {
        const id = url.searchParams.get('id').replace(/^eq\./, '');
        const matching = exerciseDatabaseRows.filter((item) => item.id === id);
        return json(request.headers().accept?.includes('vnd.pgrst.object+json') ? matching[0] : matching);
      }
      if (method === 'GET' && getRows[table]) return json(getRows[table]);
      if (table === 'classrooms' && method === 'PATCH') {
        const row = classroomDatabaseRows.find((item) => item.id === new URLSearchParams(url.search).get('id')?.replace('eq.', ''));
        if (row) Object.assign(row, request.postDataJSON());
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (table === 'classrooms' && method === 'POST') {
        const body = request.postDataJSON();
        const created = { id: `db-class-${classroomDatabaseRows.length + 1}`, owner_teacher_id: body.owner_teacher_id, name: body.name, status: 'open', current_stage: 0, wall_open: true, submissions_open: true, awards_revealed: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived_at: null };
        classroomDatabaseRows.push(created);
        activityDatabaseRows.push({ id: `wall-${created.id}`, classroom_id: created.id, activity_type: 'appreciation', title: 'Appreciation Wall', status: 'open', position: 1, prompt_snapshot: null, quiz_version_id: null, created_at: created.created_at, updated_at: created.updated_at });
        return json({ id: created.id });
      }
      if (table === 'classroom_memberships' && method === 'PATCH') {
        const row = membershipDatabaseRows.find((item) => url.searchParams.get('classroom_id') === `eq.${item.classroom_id}` && url.searchParams.get('student_id') === `eq.${item.student_id}`);
        if (row) Object.assign(row, request.postDataJSON());
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (table === 'quizzes' && method === 'POST') {
        const row = { id: `quiz-${quizDatabaseRows.length + 1}`, ...request.postDataJSON(), created_at: new Date().toISOString() };
        quizDatabaseRows.push(row); return json({ id: row.id });
      }
      if (table === 'quiz_versions' && method === 'POST') {
        const row = { id: `version-${quizVersionDatabaseRows.length + 1}`, ...request.postDataJSON(), status: 'draft', published_at: null };
        quizVersionDatabaseRows.push(row); return json({ id: row.id });
      }
      if (table === 'quiz_questions' && method === 'POST') {
        const rows = request.postDataJSON().map((item, index) => ({ id: `question-${questionDatabaseRows.length + index + 1}`, ...item }));
        questionDatabaseRows.push(...rows); return json(rows.map(({ id, position }) => ({ id, position })));
      }
      if (table === 'quiz_answer_keys' && method === 'POST') { keyDatabaseRows.push(...request.postDataJSON()); return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' } }); }
      if (table === 'classroom_activities' && method === 'PATCH') {
        const row = activityDatabaseRows.find((item) => url.searchParams.get('id') === `eq.${item.id}`);
        if (row) Object.assign(row, request.postDataJSON());
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (table === 'academic_exercises' && method === 'POST') {
        const body = request.postDataJSON();
        const family = body.exercise_family_id || `exercise-family-${exerciseDatabaseRows.length + 1}`;
        const row = { id: `exercise-${exerciseDatabaseRows.length + 1}`, exercise_family_id: family, ...body, created_at: new Date().toISOString() };
        exerciseDatabaseRows.push(row); return json({ id: row.id });
      }
      if (table === 'academic_exercises' && method === 'PATCH') {
        const row = exerciseDatabaseRows.find((item) => url.searchParams.get('id') === `eq.${item.id}`);
        if (row) Object.assign(row, request.postDataJSON());
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (table === 'academic_exercise_assignments' && (method === 'POST' || method === 'PATCH')) {
        const body = request.postDataJSON();
        if (method === 'POST') assignmentDatabaseRows.push({ id: `assignment-${assignmentDatabaseRows.length + 1}`, ...body });
        else { const row = assignmentDatabaseRows.find((item) => url.searchParams.get('id') === `eq.${item.id}`); if (row) Object.assign(row, body); }
        return route.fulfill({ status: method === 'POST' ? 201 : 204, headers: { 'access-control-allow-origin': '*' } });
      }
    }
    return json({ message: `Unhandled Supabase test request: ${method} ${url.pathname}` }, 404);
  });
});

function mockTokenHash(token) {
  // Keep fixed invitation fixture hashes deterministic in the browser test harness.
  return createHash('sha256').update(token).digest('hex');
}

function makeAuthSession(email) {
  const profile = mockProfiles[email] || { id: 'u-new', display_name: 'New account', role: 'student' };
  return {
    access_token: 'playwright-access-token',
    refresh_token: 'playwright-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: profile.id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: profile.display_name }, created_at: new Date().toISOString() },
  };
}

async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(demoPassword);
  await page.getByRole('button', { name: /log in/i }).click();
}

test('student can use the five-stage path, assigned quiz, activity submissions and revision history', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await login(page, 'student@wordsconnect.demo');
  await expect(page.getByRole('heading', { name: 'The Appreciation Wall' })).toBeVisible();
  await page.getByLabel('For someone').fill('Nadia');
  await page.getByLabel('Your message').fill('I appreciate your thoughtful ideas. They help our class learn together.');
  await page.getByRole('button', { name: /post to the wall/i }).click();
  await expect(page.getByText('Your message is on the wall.')).toBeVisible();

  await page.locator('.stage-progress button').nth(1).click();
  await expect(page.getByRole('heading', { name: 'The Paraphrasing Studio' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Common questions' })).toBeVisible();
  await expect(page.getByLabel(/Ask a paraphrasing question/)).toHaveCount(0);
  await page.getByText('Do I need to change every word?').click();
  await expect(page.getByText('No. Choose accurate words that fit the context.', { exact: false })).toBeVisible();
  await expect(page.getByText(/please ask your teacher/)).toBeVisible();

  await page.locator('.stage-progress button').nth(2).click();
  await expect(page.getByRole('heading', { name: 'Paraphrase Pit Stop' })).toBeVisible();
  await page.getByRole('button', { name: /B\. Through involvement/ }).click();
  await page.getByRole('button', { name: /A\. Participation in university clubs allows/ }).click();
  await page.getByRole('button', { name: /C\. By getting involved/ }).click();
  await expect(page.getByText(/Meaning secured/)).toBeVisible();
  await expect(page.getByText('3/3', { exact: true })).toBeVisible();

  await page.locator('.stage-progress button').nth(3).click();
  await page.getByLabel('Your paraphrase').fill('Your warm attitude helps everyone feel welcome and encourages the class to participate.');
  await page.getByRole('button', { name: /next: academic sentence/i }).click();
  await page.getByLabel('Your academic paraphrase').fill('By joining campus activities, university students can strengthen their social abilities and grow as individuals.');
  await page.getByRole('button', { name: /^submit$/i }).click();
  await page.locator('.stage-progress button').nth(4).click();
  await expect(page.getByRole('heading', { name: 'Your Report' })).toBeVisible();
  await expect(page.getByText(/indicative learning feedback, not official grades/i)).toBeVisible();
  await expect(page.getByText('Pending review')).toBeVisible();
  await page.getByLabel('Your revised version').fill('Students can build social skills and develop personally by taking part in extracurricular activities.');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByText(/Revision saved/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revision history' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('Supabase student Stage 3 attempts and Stage 4 submissions and revisions persist for teacher review', async ({ page }) => {
  await login(page, 'student@wordsconnect.demo');

  await page.locator('.stage-progress button').nth(2).click();
  await expect(page.getByRole('heading', { name: 'Paraphrase Pit Stop' })).toBeVisible();
  await expect(page.getByText('Which answer keeps the central idea?')).toBeVisible();
  await page.getByRole('button', { name: 'A. Keep the idea' }).click();
  await expect(page.getByText('1/1', { exact: true })).toBeVisible();
  await expect(page.getByText('Attempt 1')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Paraphrase Pit Stop' })).toBeVisible();
  await expect(page.getByText('Attempt 1')).toBeVisible();

  await page.locator('.stage-progress button').nth(3).click();
  await expect(page.getByText(/MESSAGE FROM (NADIA ISLAM|RAFI HASAN)/)).toBeVisible();
  await page.getByLabel('Your paraphrase').fill('Your encouraging words help the whole class keep learning.');
  await page.getByRole('button', { name: /next: academic sentence/i }).click();
  await expect(page.getByText('Taking part in campus activities can help students develop social skills.')).toBeVisible();
  await page.getByLabel('Your academic paraphrase').fill('Students can build social abilities by joining activities on campus.');
  await page.getByRole('button', { name: /^submit$/i }).click();
  await expect(page.getByRole('heading', { name: 'Your Report' })).toBeVisible();
  await page.locator('.stage-progress button').nth(3).click();
  await expect(page.getByText('LAST SUBMISSION SAVED')).toBeVisible();

  await page.locator('.stage-progress button').nth(4).click();
  await page.getByLabel('Your revised version').fill('Taking part in campus activities helps students strengthen their social skills.');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByText(/Revision saved/)).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await login(page, 'teacher@wordsconnect.demo');
  await page.getByRole('tab', { name: 'Results' }).click();
  await page.locator('.results-student-group').filter({ hasText: 'Maya Ahmed' }).locator('summary').click();
  await expect(page.getByText('Your encouraging words help the whole class keep learning.')).toBeVisible();
  await expect(page.getByText('Students can build social abilities by joining activities on campus.').first()).toBeVisible();
  await expect(page.getByText('Taking part in campus activities can help students develop social skills.').first()).toBeVisible();
  await expect(page.getByText(/I appreciate the way you always welcome new ideas/).first()).toBeVisible();
  await expect(page.getByText('Taking part in campus activities helps students strengthen their social skills.')).toBeVisible();
});

test('teacher can edit the section quiz and manage academic exercises', async ({ page }) => {
  await login(page, 'teacher@wordsconnect.demo');
  await page.getByRole('tab', { name: 'Controls' }).click();
  await expect(page.getByRole('heading', { name: /Assigned Pit Stop quiz/ })).toBeVisible();
  const quizForm = page.locator('.manager-form').first();
  await quizForm.getByLabel('Question title').fill('Meaning check');
  await quizForm.getByLabel('Prompt').fill('Which option preserves the central idea?');
  await quizForm.locator('input[aria-label="Option 1"]').fill('Keep the main idea.');
  await quizForm.locator('input[aria-label="Option 2"]').fill('Add an unrelated claim.');
  await quizForm.locator('input[aria-label="Option 3"]').fill('Change the source meaning.');
  await quizForm.getByRole('button', { name: 'Add question' }).click();
  await expect(page.getByText('Meaning check')).toBeVisible();

  const exerciseForm = page.locator('.manager-form').nth(1);
  await exerciseForm.getByLabel('Exercise title').fill('Campus learning');
  await exerciseForm.getByLabel('Academic source sentence').fill('Taking part in campus groups can help students build friendships and confidence.');
  await exerciseForm.getByRole('button', { name: 'Create exercise' }).click();
  await page.getByLabel('Assigned exercise').selectOption({ label: 'Campus learning' });
  await expect(page.getByText('Campus learning · assigned')).toBeVisible();
});

test('teacher can inspect and grade complete submissions and official awards use reviewed marks', async ({ page }) => {
  await login(page, 'teacher@wordsconnect.demo');
  await page.getByRole('tab', { name: 'Students' }).click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('Nadia');
  await expect(page.getByRole('button', { name: /Nadia Islam/ })).toBeVisible();
  await page.getByRole('button', { name: /Nadia Islam/ }).click();
  await expect(page.getByRole('dialog', { name: /Nadia Islam.*learning history/ })).toBeVisible();
  await expect(page.getByText('Your positive attitude encourages everyone to keep trying.')).toBeVisible();
  await expect(page.getByText('By joining campus activities, students can strengthen their social abilities and grow as individuals.')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('tab', { name: 'Results' }).click();
  const nadiaGroup = page.locator('.results-student-group').filter({ hasText: 'Nadia Islam' });
  await nadiaGroup.locator('summary').click();
  const academicCard = nadiaGroup.locator('.submission-detail-card').filter({ hasText: 'Academic Transfer' });
  await expect(academicCard.locator('b', { hasText: '87/100' })).toBeVisible();
  await academicCard.getByLabel(/Official mark/).fill('91');
  await academicCard.getByLabel('Written teacher feedback').fill('Clear meaning and effective sentence structure.');
  await academicCard.getByRole('button', { name: /Save and mark reviewed/i }).click();
  await expect(academicCard.locator('.status-reviewed')).toHaveText('Reviewed');
  await expect(page.getByText('91/100 official average')).toBeVisible();
  await page.getByRole('button', { name: /reveal to students/i }).click();
  await expect(page.getByRole('button', { name: /hide from students/i })).toBeVisible();
  await page.getByRole('tab', { name: 'Controls' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export current section CSV/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('Section-A-results.csv');
});

test('teacher dashboard loads Supabase classroom records and saves official marks through its RPC', async ({ page }) => {
  const classroomId = '10000000-0000-4000-8000-000000000001';
  const activityId = '20000000-0000-4000-8000-000000000001';
  const submissionId = '30000000-0000-4000-8000-000000000001';
  const studentId = '40000000-0000-4000-8000-000000000001';
  const classroomRows = [{ id: classroomId, owner_teacher_id: 'u-teacher', name: 'Real English Class', status: 'open', current_stage: 3, wall_open: true, submissions_open: true, awards_revealed: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', archived_at: null }];
  const membershipRows = [{ classroom_id: classroomId, student_id: studentId, status: 'active', joined_at: '2026-01-02T00:00:00Z', ended_at: null }];
  const studentProfile = [{ id: studentId, display_name: 'Real Student', email: 'real.student@example.com', role: 'student', status: 'active' }];
  const activityRows = [{ id: activityId, classroom_id: classroomId, activity_type: 'appreciation', title: 'Appreciation Wall', status: 'open', position: 1, prompt_snapshot: null, quiz_version_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }];
  const submissionRows = [{ id: submissionId, classroom_id: classroomId, activity_instance_id: activityId, student_id: studentId, submission_kind: 'original', author_name_snapshot: 'Real Student', attempt_number: 1, version_number: 1, revision_of_submission_id: null, response: 'A real classroom response.', recipient: 'Class', prompt_snapshot: null, exercise_id: null, exercise_title_snapshot: null, source_submission_id: null, source_author_id: null, source_author_name_snapshot: null, source_text_snapshot: null, submitted_at: '2026-01-03T00:00:00Z' }];
  let gradeRows = [{ classroom_id: classroomId, submission_id: submissionId, official_mark: null, feedback: '', status: 'pending', reviewed_by: null, reviewed_at: null, updated_at: '2026-01-03T00:00:00Z' }];
  let classroomCreateBody;
  const tableRows = {
    classrooms: classroomRows, classroom_staff: [], classroom_memberships: membershipRows,
    classroom_activities: activityRows, quizzes: [], quiz_versions: [], academic_exercises: [],
    academic_exercise_assignments: [], student_progress: [], activity_submissions: submissionRows,
    automated_assessments: [], teacher_assessments: gradeRows, quiz_attempts: [],
    quiz_questions: [], quiz_answer_keys: [], quiz_attempt_items: [],
  };
  await page.context().route('https://supabase.test/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fallback();
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' }, body: JSON.stringify(body) });
    if (url.pathname === '/rest/v1/rpc/get_classroom_rankings') return json([]);
    if (url.pathname === '/rest/v1/rpc/set_teacher_assessment') {
      const body = request.postDataJSON();
      gradeRows = [{ classroom_id: classroomId, submission_id: body.p_submission_id, official_mark: body.p_official_mark, feedback: body.p_feedback, status: body.p_status, reviewed_by: 'u-teacher', reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
      return json(gradeRows[0]);
    }
    if (request.method() === 'GET' && url.pathname === '/rest/v1/profiles' && url.searchParams.get('id')?.startsWith('in.')) return json(studentProfile);
    const table = url.pathname.split('/').at(-1);
    if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/create_classroom') {
      classroomCreateBody = request.postDataJSON();
      const created = { id: '50000000-0000-4000-8000-000000000001', owner_teacher_id: 'u-teacher', name: classroomCreateBody.p_name, status: 'open', current_stage: 0, wall_open: true, submissions_open: true, awards_revealed: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived_at: null };
      classroomRows.push(created);
      activityRows.push({ id: '60000000-0000-4000-8000-000000000001', classroom_id: created.id, activity_type: 'appreciation', title: 'Appreciation Wall', status: 'open', position: 1, prompt_snapshot: null, quiz_version_id: null, created_at: created.created_at, updated_at: created.updated_at });
      return json(created.id);
    }
    if (request.method() === 'GET' && tableRows[table]) return json(tableRows[table]);
    return route.fallback();
  });

  await login(page, 'teacher@wordsconnect.demo');
  await expect(page.locator('.page-title h1')).toHaveText('Real English Class');
  await page.getByRole('tab', { name: 'Students' }).click();
  await expect(page.getByRole('button', { name: /Real Student/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Results' }).click();
  await page.locator('.results-student-group summary').click();
  await expect(page.getByText('A real classroom response.')).toBeVisible();
  await page.getByLabel(/Official mark/).fill('94');
  await page.getByLabel('Written teacher feedback').fill('Strong work.');
  await page.getByRole('button', { name: /Save and mark reviewed/i }).click();
  await expect(page.getByLabel('Written teacher feedback')).toHaveValue('Strong work.');
  expect(gradeRows[0]).toMatchObject({ official_mark: 94, feedback: 'Strong work.', status: 'reviewed' });

  await page.getByRole('tab', { name: 'Controls' }).click();
  await page.getByLabel('New section name').fill('Created from dashboard');
  await page.getByRole('button', { name: 'Create section' }).click();
  await expect(page.locator('.page-title h1')).toHaveText('Created from dashboard');
  await expect(page.getByText('Created from dashboard created and selected.')).toBeVisible();
  await expect(page.locator('.managed-section-row').filter({ hasText: 'Created from dashboard' })).toContainText('Current');
  expect(classroomCreateBody).toEqual({ p_name: 'Created from dashboard' });
});

test('invitation token SHA-256 hashing works without Web Crypto', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: undefined }));
  expect(await page.evaluate(() => window.crypto.subtle)).toBeUndefined();
  const tokens = ['a'.repeat(64), 'invite-token-with-unicode-অ', 'local-http-token'];
  for (const token of tokens) {
    const actual = await page.evaluate(async (value) => {
      const { sha256Hex } = await import('/src/lib/hash.js');
      return sha256Hex(value);
    }, token);
    expect(actual).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
  }
});

test('spotlight manual navigation advances one message and wraps in both directions', async ({ page }) => {
  await login(page, 'teacher@wordsconnect.demo');
  await page.getByRole('button', { name: /Open spotlight/i }).click();
  const dialog = page.getByRole('dialog', { name: /Appreciation Wall Spotlight/ });
  await expect(dialog.getByText(/1 \/ 2/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Next message' }).click();
  await expect(dialog.getByText(/2 \/ 2/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Next message' }).click();
  await expect(dialog.getByText(/1 \/ 2/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Previous message' }).click();
  await expect(dialog.getByText(/2 \/ 2/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Play autoplay' }).click();
  await expect(dialog.getByRole('button', { name: 'Pause autoplay' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Pause autoplay' }).click();
  await expect(dialog.getByRole('button', { name: 'Play autoplay' })).toBeVisible();
});

test('section creation, switching, archiving, historical reports and reopening preserve results', async ({ page }) => {
  await login(page, 'teacher@wordsconnect.demo');
  await page.getByRole('tab', { name: 'Controls' }).click();
  await page.getByLabel('New section name').fill('Section B');
  await page.getByRole('button', { name: 'Create section' }).click();
  await expect(page.locator('.page-title h1')).toHaveText('Section A');
  await expect(page.getByText(/created\. Activate it from Open sections/)).toBeVisible();
  const sectionB = page.locator('.managed-section-row').filter({ hasText: 'Section B' });
  await sectionB.getByRole('button', { name: 'Make current' }).click();
  await expect(page.locator('.page-title h1')).toHaveText('Section B');
  await page.getByRole('tab', { name: 'Results' }).click();
  await expect(page.getByText('No students are assigned to this section.')).toBeVisible();

  await page.getByRole('tab', { name: 'Controls' }).click();
  const sectionA = page.locator('.managed-section-row').filter({ hasText: 'Section A' });
  await sectionA.getByRole('button', { name: 'Make current' }).click();
  await expect(page.locator('.page-title h1')).toHaveText('Section A');
  await page.getByRole('tab', { name: 'Results' }).click();
  await page.locator('.results-student-group').filter({ hasText: 'Nadia Islam' }).locator('summary').click();
  await expect(page.getByText('By joining campus activities, students can strengthen their social abilities and grow as individuals.')).toBeVisible();

  await page.getByRole('tab', { name: 'Controls' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.managed-section-row').filter({ hasText: 'Section A' }).getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('Section A archived. Its data was preserved.')).toBeVisible();
  const archivedA = page.locator('.managed-section-row').filter({ hasText: 'Section A' });
  await archivedA.getByRole('button', { name: 'View reports' }).click();
  await expect(page.getByRole('dialog', { name: /Section A.*Historical reports/ })).toBeVisible();
  await expect(page.getByText('By joining campus activities, students can strengthen their social abilities and grow as individuals.')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.managed-section-row').filter({ hasText: 'Section A' }).getByRole('button', { name: 'Reopen' }).click();
  await expect(page.locator('.page-title h1')).toHaveText('Section A');
  await page.getByRole('tab', { name: 'Results' }).click();
  await page.locator('.results-student-group').filter({ hasText: 'Nadia Islam' }).locator('summary').click();
  await expect(page.getByText('By joining campus activities, students can strengthen their social abilities and grow as individuals.')).toBeVisible();
});

test('legacy local data is backed up and migrated without dropping responses or revisions', async ({ page }) => {
  const legacy = {
    users: [{ id: 'legacy-student', name: 'Legacy Student', email: 'legacy@example.com', role: 'student' }],
    invites: [], classroom: { id: 'class-legacy', name: 'Legacy Class', stage: 4, wallOpen: true, submissionsOpen: true, reveal: false },
    sections: [{ id: 'old-section', name: 'Old Section', createdAt: 10 }], activeSectionId: 'old-section', archives: [],
    wall: [{ id: 'old-wall', authorId: 'legacy-student', author: 'Legacy Student', recipient: 'Peer', text: 'A full wall message stays intact.', createdAt: 15 }],
    progress: { 'legacy-student': { stage: 4, pit: { 0: { choice: 1 }, 1: { choice: 0 }, 2: { choice: 2 } }, assignment: { author: 'Peer', text: 'Original peer message.' }, submission: { remix: 'Full remix response.', academic: 'Full academic response.', source: 'Original prompt.', result: { score: 80, m: 4, nw: 80, re: 1, cp: 0, iss: '' }, createdAt: 20 }, revision: 'Full revised response.', revisionResult: { score: 90, m: 4, nw: 90, re: 1, cp: 0, iss: '' } } },
  };
  const legacyString = JSON.stringify(legacy);
  await page.addInitScript(({ value, users }) => {
    localStorage.setItem('wc_frontend_mock_data_v1', value);
    localStorage.setItem('wc_frontend_mock_users', JSON.stringify(users));
  }, { value: legacyString, users: [...legacy.users, { id: 'u-teacher', name: 'Teacher', role: 'teacher', email: 'teacher@example.com' }] });
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(localStorage.getItem('wc_frontend_mock_data_v2')));
  const migrated = await page.evaluate(() => ({
    backup: localStorage.getItem('wc_frontend_mock_data_v1_backup'),
    oldKey: localStorage.getItem('wc_frontend_mock_data_v1'),
    data: JSON.parse(localStorage.getItem('wc_frontend_mock_data_v2')),
  }));
  expect(migrated.backup).toBe(legacyString);
  expect(migrated.oldKey).toBe(legacyString);
  expect(migrated.data.schemaVersion).toBe(2);
  const section = migrated.data.sections.find((item) => item.id === 'old-section');
  expect(section.wall[0].text).toBe('A full wall message stays intact.');
  expect(section.submissions.map((item) => item.type)).toEqual(expect.arrayContaining(['appreciation', 'message-remix', 'academic-transfer', 'revision']));
  expect(section.submissions.find((item) => item.type === 'message-remix').sourceMessage.text).toBe('Original peer message.');
  expect(section.submissions.find((item) => item.type === 'academic-transfer').response).toBe('Full academic response.');
  expect(section.submissions.find((item) => item.type === 'revision').response).toBe('Full revised response.');
  await page.reload();
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem('wc_frontend_mock_data_v2')).sections[0].submissions.length);
  expect(count).toBe(section.submissions.length);
});

test('admin People & Invitations loads database profiles and uses protected invitation and status RPCs', async ({ page }) => {
  await login(page, 'admin@wordsconnect.demo');
  await expect(page.getByRole('heading', { name: 'People & invitations' })).toBeVisible();
  await expect(page.locator('.admin-metrics .metric').nth(0).locator('strong')).toHaveText('5');
  await expect(page.locator('.admin-metrics .metric').nth(1).locator('strong')).toHaveText('1');
  await expect(page.locator('.admin-metrics .metric').nth(2).locator('strong')).toHaveText('3');
  await expect(page.locator('.admin-user-row').filter({ hasText: 'Avery Morgan' })).toBeVisible();
  await expect(page.locator('.admin-user-row')).toHaveCount(5);
  await page.getByLabel('Teacher name').fill('Alex Teacher');
  await page.getByLabel('Teacher email').fill('alex.teacher@example.com');
  await page.getByRole('button', { name: /create invitation/i }).click();
  await expect(page.getByText(/Invitation ready for Alex Teacher \(alex.teacher@example.com\)/)).toBeVisible();
  await expect(page.getByLabel('Invitation link')).toHaveValue(/invite\/teacher\?token=/);
  await expect(page.getByText(/database stores only its token hash/i)).toBeVisible();
  await expect(page.getByText(/expires/i).first()).toBeVisible();
  await expect(page.locator('.invite-row')).toContainText('alex.teacher@example.com');
  await expect(page.locator('.admin-metrics .metric').nth(3).locator('strong')).toHaveText('1');
  const studentRow = page.locator('.admin-user-row').filter({ hasText: 'Maya Ahmed' });
  await studentRow.getByRole('button', { name: /suspend maya/i }).click();
  await expect(studentRow.getByText('Suspended')).toBeVisible();
  await studentRow.getByRole('button', { name: /restore maya/i }).click();
  await expect(studentRow.getByText('Active')).toBeVisible();
  await page.getByRole('button', { name: /revoke invitation for alex.teacher@example.com/i }).click();
  await expect(page.locator('.invite-row').getByText('Revoked')).toBeVisible();
});

test('admin can share a real-format invitation, teacher accepts it, and invitation becomes accepted', async ({ page }) => {
  await login(page, 'admin@wordsconnect.demo');
  await page.getByLabel('Teacher name').fill('Alex Teacher');
  await page.getByLabel('Teacher email').fill('alex.teacher@example.com');
  await page.getByRole('button', { name: /create invitation/i }).click();
  const invitationLink = await page.getByLabel('Invitation link').inputValue();
  expect(invitationLink).toMatch(/\/invite\/teacher\?token=[0-9a-f]{64}$/);
  const invitationToken = new URL(invitationLink).searchParams.get('token');
  await page.getByRole('button', { name: /log out/i }).click();
  await page.goto(invitationLink);
  await page.getByLabel('Your name').fill('Alex Teacher');
  await page.getByLabel('Invited email').fill('alex.teacher@example.com');
  await page.getByLabel('Create password').fill('teacherpass123');
  await page.getByLabel('Confirm password').fill('teacherpass123');
  await page.getByRole('button', { name: /accept invitation/i }).click();
  await expect(page).toHaveURL(/\/account-ready$/);
  await expect(page.getByRole('heading', { name: 'Your account is ready!' })).toBeVisible();
  await expect(page.getByText('You can now log in to Words Connect.')).toBeVisible();
  await page.getByRole('button', { name: /go to login/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'admin@wordsconnect.demo');
  await expect(page.locator('.invite-row').filter({ hasText: 'alex.teacher@example.com' }).getByText('Accepted', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /log out/i }).click();
  await page.goto(`/login?token=${invitationToken}`);
  await page.getByLabel('Email address').fill('alex.teacher@example.com');
  await page.getByLabel('Password', { exact: true }).fill('teacherpass123');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/teacher$/);
});

test('teacher RPC authorization rejects invitation creation and invalid, expired or used teacher invitations fail', async ({ page }) => {
  await login(page, 'teacher@wordsconnect.demo');
  const unauthorized = await page.evaluate(async () => {
    const session = Object.values(localStorage).map((value) => { try { return JSON.parse(value); } catch { return null; } }).find((value) => value?.access_token);
    const response = await fetch('https://supabase.test/rest/v1/rpc/create_invitation', {
      method: 'POST',
      headers: { apikey: 'playwright-test-key', Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token_hash: 'a'.repeat(64), p_intended_role: 'teacher', p_email: 'intruder@example.com', p_classroom_id: null, p_expires_at: new Date(Date.now() + 86400000).toISOString() }),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(unauthorized.status).toBe(403);
  expect(unauthorized.body.message).toMatch(/admin/i);
  await page.getByRole('button', { name: /log out/i }).click();

  for (const scenario of [
    { token: 'not-a-valid-invitation', email: 'invalid.teacher@example.com', message: /invalid invitation/i },
    { token: 'expired-teacher-invite', email: 'expired.teacher@example.com', message: /expired/i },
    { token: 'used-teacher-invite', email: 'used.teacher@example.com', message: /already been used/i },
  ]) {
    await page.goto(`/invite/teacher?token=${scenario.token}`);
    await page.getByLabel('Your name').fill('Invited Teacher');
    await page.getByLabel('Invited email').fill(scenario.email);
    await page.getByLabel('Create password').fill('teacherpass123');
    await page.getByLabel('Confirm password').fill('teacherpass123');
    await page.getByRole('button', { name: /accept invitation/i }).click();
    await expect(page.getByRole('alert')).toContainText(scenario.message);
  }
});

test('invitation routes create the intended role without a role selector', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.screenshot({ path: testInfo.outputPath('login-390.png'), fullPage: true });
  await page.goto('/register?invite=student-demo-invite');
  await expect(page.getByText(/Invitation link received/)).toBeVisible();
  await expect(page.getByLabel('Role')).toHaveCount(0);
  await page.getByLabel('Your name').fill('Jamie Student');
  await page.getByLabel('Email address').fill('jamie@example.com');
  await page.getByLabel('Create password').fill('studentpass123');
  await page.getByLabel('Confirm password').fill('studentpass123');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/account-ready$/);
  await expect(page.getByRole('heading', { name: 'Your account is ready!' })).toBeVisible();
  await expect(page.getByText(/your student invitation has been accepted/i)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: /go to login/i }).click();
  await page.getByLabel('Email address').fill('jamie@example.com');
  await page.getByLabel('Password', { exact: true }).fill('studentpass123');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.locator('.topbar-user-name')).toContainText('Jamie Student');
  await page.getByRole('button', { name: /log out/i }).click();
  await page.goto('/invite/teacher?token=teacher-demo-invite');
  await expect(page.getByRole('heading', { name: 'Accept your invitation' })).toBeVisible();
  await expect(page.getByLabel('Role')).toHaveCount(0);
  await page.getByLabel('Your name').fill('Taylor Teacher');
  await page.getByLabel('Invited email').fill('new.teacher@example.com');
  await page.getByLabel('Create password').fill('teacherpass123');
  await page.getByLabel('Confirm password').fill('teacherpass123');
  await page.getByRole('button', { name: /accept invitation/i }).click();
  await expect(page).toHaveURL(/\/account-ready$/);
  await expect(page.getByRole('heading', { name: 'Your account is ready!' })).toBeVisible();
  await page.getByRole('button', { name: /go to login/i }).click();
  await page.getByLabel('Email address').fill('new.teacher@example.com');
  await page.getByLabel('Password', { exact: true }).fill('teacherpass123');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.locator('.topbar-user-name')).toContainText('Taylor Teacher');
});

test('teacher classroom QR invitation creates an active membership and loads the student classroom', async ({ page }) => {
  await login(page, 'teacher@wordsconnect.demo');
  await page.getByRole('button', { name: /Show QR code for students/i }).click();
  const qrDialog = page.getByRole('dialog', { name: /Student classroom invitation/i });
  await expect(qrDialog).toBeVisible();
  const invitationUrl = await qrDialog.getByLabel('Student invitation link').inputValue();
  const url = new URL(invitationUrl);
  expect(url.pathname).toBe('/register');
  expect(url.searchParams.get('invite')).toBeTruthy();

  await qrDialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /Show QR code for students/i }).click();
  const stillPendingDialog = page.getByRole('dialog', { name: /Student classroom invitation/i });
  await expect(stillPendingDialog.getByLabel('Student invitation link')).toHaveValue(invitationUrl);
  await stillPendingDialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /log out/i }).click();
  await page.goto(invitationUrl);
  await page.getByLabel('Your name').fill('QR Student');
  await page.getByLabel('Email address').fill('qr.student@example.com');
  await page.getByLabel('Create password').fill('studentpass123');
  await page.getByLabel('Confirm password').fill('studentpass123');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/account-ready$/);
  await page.getByRole('button', { name: /go to login/i }).click();
  await page.getByLabel('Email address').fill('qr.student@example.com');
  await page.getByLabel('Password', { exact: true }).fill('studentpass123');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.locator('.student-overview .muted')).toContainText('Section A');
  await expect(page.getByText('This account is not assigned to an open classroom section.', { exact: true })).toHaveCount(0);

  const invitationToken = url.searchParams.get('invite');
  await page.getByRole('button', { name: /log out/i }).click();
  await page.goto(`/login?invite=${encodeURIComponent(invitationToken)}`);
  await page.getByLabel('Email address').fill('qr.student@example.com');
  await page.getByLabel('Password', { exact: true }).fill('studentpass123');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.locator('.student-overview .muted')).toContainText('Section A');

  await page.getByRole('button', { name: /log out/i }).click();
  await login(page, 'teacher@wordsconnect.demo');
  await page.getByRole('button', { name: /Show QR code for students/i }).click();
  const secondInviteDialog = page.getByRole('dialog', { name: /Student classroom invitation/i });
  const secondInvitationUrl = new URL(await secondInviteDialog.getByLabel('Student invitation link').inputValue());
  const secondInvitationToken = secondInvitationUrl.searchParams.get('invite');
  expect(secondInvitationToken).toBeTruthy();
  await secondInviteDialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /log out/i }).click();
  await page.goto(`/register?invite=${encodeURIComponent(secondInvitationToken)}`);
  await page.getByRole('link', { name: 'Log in' }).click();
  await expect(page).toHaveURL(new RegExp(`/login\\?invite=${encodeURIComponent(secondInvitationToken)}`));
  await page.getByLabel('Email address').fill('qr.student@example.com');
  await page.getByLabel('Password', { exact: true }).fill('studentpass123');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.locator('.student-overview .muted')).toContainText('Section A');

  await page.getByRole('button', { name: /log out/i }).click();
  await page.goto(`/login?invite=${encodeURIComponent(secondInvitationToken)}`);
  await page.getByLabel('Email address').fill('student@wordsconnect.demo');
  await page.getByLabel('Password', { exact: true }).fill(demoPassword);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.getByRole('alert')).toContainText(/already been used/i);
});

test('invitation registration stops without consuming an invitation when Supabase returns no session', async ({ page }) => {
  const signupUrls = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/auth/v1/signup') signupUrls.push(request.url());
  });
  await page.goto('/invite/teacher?token=teacher-demo-invite');
  await page.getByLabel('Your name').fill('No Session Teacher');
  await page.getByLabel('Invited email').fill('no-session@example.com');
  await page.getByLabel('Create password').fill('teacherpass123');
  await page.getByLabel('Confirm password').fill('teacherpass123');
  await page.getByRole('button', { name: /accept invitation/i }).click();
  await expect(page).toHaveURL(/\/invite\/teacher\?/);
  await expect(page.getByRole('alert')).toContainText(/turn off Confirm Email/i);
  await expect(page.getByRole('heading', { name: 'Accept your invitation' })).toBeVisible();
  expect(signupUrls).toHaveLength(1);
  expect(new URL(signupUrls[0]).searchParams.has('redirect_to')).toBe(false);
});

test('first-admin bootstrap rejects other accounts and safely retries for the authorized UUID', async ({ page }) => {
  await page.goto('/bootstrap-admin');
  await page.getByLabel('Account email').fill('bootstrap-other@example.com');
  await page.getByLabel('Password').fill(demoPassword);
  await page.getByRole('button', { name: /provision administrator/i }).click();
  await expect(page.getByRole('alert')).toContainText(/not authorized/i);
  await expect(page).toHaveURL(/\/bootstrap-admin$/);

  await page.getByLabel('Account email').fill('bootstrap-existing-admin@example.com');
  await page.getByLabel('Password').fill(demoPassword);
  await page.getByRole('button', { name: /provision administrator/i }).click();
  await expect(page.getByRole('alert')).toContainText(/administrator already exists/i);

  await page.getByLabel('Account email').fill('bootstrap-owner@example.com');
  await page.getByLabel('Password').fill(demoPassword);
  await page.getByRole('button', { name: /provision administrator/i }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('.topbar-user-name')).toContainText('Bootstrap Owner');

  await page.getByRole('button', { name: /log out/i }).click();
  await page.goto('/bootstrap-admin');
  await page.getByLabel('Account email').fill('bootstrap-owner@example.com');
  await page.getByLabel('Password').fill(demoPassword);
  await page.getByRole('button', { name: /provision administrator/i }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: /log out/i }).click();
  await login(page, 'bootstrap-owner@example.com');
  await expect(page).toHaveURL(/\/admin$/);
});

test('validated administrator, teacher and student sessions restore after refresh', async ({ page }) => {
  for (const [email, role] of [
    ['admin@wordsconnect.demo', 'admin'],
    ['teacher@wordsconnect.demo', 'teacher'],
    ['student@wordsconnect.demo', 'student'],
  ]) {
    await login(page, email);
    await expect(page).toHaveURL(new RegExp(`/${role}$`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${role}$`));
    await expect(page.locator('.topbar-user-name')).toContainText(role === 'admin' ? 'Avery Morgan' : role === 'teacher' ? 'Samira Rahman' : 'Maya Ahmed');
    await page.getByRole('button', { name: /log out/i }).click();
  }
});

test('duplicate SIGNED_IN events share the completed profile activation', async ({ page }) => {
  let profileRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/rest/v1/profiles' && new URL(request.url()).searchParams.get('id')?.startsWith('eq.')) profileRequests += 1;
  });
  await login(page, 'teacher@wordsconnect.demo');
  await expect(page).toHaveURL(/\/teacher$/);
  await page.waitForTimeout(100);
  const afterLogin = profileRequests;
  expect(afterLogin).toBe(1);

  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.js');
    const { data: { session } } = await supabase.auth.getSession();
    await Promise.all([
      supabase.auth._notifyAllSubscribers('SIGNED_IN', session, false),
      supabase.auth._notifyAllSubscribers('SIGNED_IN', session, false),
    ]);
  });
  await page.waitForTimeout(150);
  await expect(page).toHaveURL(/\/teacher$/);
  expect(profileRequests).toBe(afterLogin);
});

test('cross-tab login and logout synchronize after a transient profile read', async ({ page }) => {
  const secondTab = await page.context().newPage();
  await page.goto('/login');
  await secondTab.goto('/login');
  await expect(secondTab.getByRole('button', { name: /log in/i })).toBeVisible();

  await login(page, 'cross-tab-teacher@example.com');
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.locator('.topbar-user-name')).toContainText('Cross Tab Teacher');
  await expect(secondTab).toHaveURL(/\/teacher$/);
  await expect(secondTab.locator('.topbar-user-name')).toContainText('Cross Tab Teacher');

  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(secondTab).toHaveURL(/\/login$/);
  await expect(secondTab.getByRole('button', { name: /log in/i })).toBeVisible();
  await secondTab.close();
});

test('transient profile loading failure does not sign out and session restoration can retry', async ({ page }) => {
  let logoutRequests = 0;
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/auth/v1/logout') logoutRequests += 1; });
  await login(page, 'profile-error@example.com');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('alert')).toContainText('Temporary profile query failure');
  expect(logoutRequests).toBe(0);

  await page.reload();
  await expect(page).toHaveURL(/\/teacher$/);
  expect(logoutRequests).toBe(0);
});

test('an older activation cannot replace or sign out a newer login', async ({ page }) => {
  let logoutRequests = 0;
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/auth/v1/logout') logoutRequests += 1; });
  await page.goto('/login');
  await page.getByLabel('Email address').fill('slow-teacher@example.com');
  await page.getByLabel('Password', { exact: true }).fill(demoPassword);
  const slowLookup = page.waitForRequest((request) => new URL(request.url()).pathname === '/rest/v1/profiles' && new URL(request.url()).searchParams.get('id') === 'eq.u-slow-teacher');
  await page.locator('.auth-form').evaluate((form) => form.requestSubmit());
  await slowLookup;

  await page.getByLabel('Email address').fill('newer-teacher@example.com');
  await page.getByLabel('Password', { exact: true }).fill(demoPassword);
  await page.locator('.auth-form').evaluate((form) => form.requestSubmit());
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.locator('.topbar-user-name')).toContainText('Newer Teacher');
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.locator('.topbar-user-name')).toContainText('Newer Teacher');
  expect(logoutRequests).toBe(0);
});

test('pending, suspended, invalid-role and missing-profile accounts are rejected', async ({ page }) => {
  const cases = [
    ['pending-login@example.com', /awaiting a valid invitation/i],
    ['suspended-login@example.com', /suspended/i],
    ['invalid-role@example.com', /invalid Words Connect role/i],
    ['missing-profile@example.com', /No Words Connect profile/i],
  ];
  for (const [email, message] of cases) {
    await login(page, email);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('alert')).toContainText(message);
  }
});

test('role guards redirect visitors away from another role’s workspace', async ({ page }) => {
  await page.goto('/teacher');
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'student@wordsconnect.demo');
  await expect(page.getByRole('heading', { name: /hi, maya/i })).toBeVisible();
  expect(await page.evaluate(() => Object.values(localStorage).some((value) => {
    try { return Boolean(JSON.parse(value)?.refresh_token); } catch { return false; }
  }))).toBe(true);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('heading', { name: /hi, maya/i })).toBeVisible();
});

for (const viewport of [
  { name: 'small phone', width: 360, height: 800 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'large phone', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 768 },
]) {
  test(`student and teacher layouts fit ${viewport.name} (${viewport.width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, 'student@wordsconnect.demo');
    await expect(page.getByRole('heading', { name: 'The Appreciation Wall' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    if (viewport.width === 390) await page.screenshot({ path: testInfo.outputPath('student-390.png'), fullPage: true });
    await page.getByRole('button', { name: /log out/i }).click();
    await login(page, 'teacher@wordsconnect.demo');
    await expect(page.getByRole('tab', { name: 'Live' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    if (viewport.width === 360) {
      await page.getByRole('tab', { name: 'Controls' }).click();
      await page.getByRole('button', { name: /Classroom QR/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('tab', { name: 'Live' }).click();
      await page.getByRole('button', { name: /Open spotlight/i }).click();
      await expect(page.getByRole('dialog', { name: /Appreciation Wall Spotlight/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    if (viewport.width === 390) await page.screenshot({ path: testInfo.outputPath('teacher-390.png'), fullPage: true });
  });
}
