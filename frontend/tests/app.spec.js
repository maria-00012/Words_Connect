import { expect, test } from '@playwright/test';

const demoPassword = 'connect123';

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

  await page.getByRole('button', { name: 'Log out' }).click();
  await login(page, 'student@wordsconnect.demo');
  await page.locator('.stage-progress button').nth(2).click();
  await expect(page.getByText('Which option preserves the central idea?')).toBeVisible();
  await page.locator('.stage-progress button').nth(3).click();
  await page.getByLabel('Your paraphrase').fill('A kind classmate makes the room welcoming.');
  await page.getByRole('button', { name: /next: academic sentence/i }).click();
  await expect(page.getByText('Taking part in campus groups can help students build friendships and confidence.')).toBeVisible();
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

test('admin can create a teacher invitation and suspend an account', async ({ page }) => {
  await login(page, 'admin@wordsconnect.demo');
  await expect(page.getByRole('heading', { name: 'People & invitations' })).toBeVisible();
  await page.getByLabel('Teacher name').fill('Alex Teacher');
  await page.getByLabel('Teacher email').fill('alex.teacher@example.com');
  await page.getByRole('button', { name: /create invitation/i }).click();
  await expect(page.getByText(/Invitation ready for alex.teacher@example.com/)).toBeVisible();
  await expect(page.getByLabel('Invitation link')).toHaveValue(/invite\/teacher\?token=/);
  const studentRow = page.locator('.admin-user-row').filter({ hasText: 'Maya Ahmed' });
  await studentRow.getByRole('button', { name: /suspend maya/i }).click();
  await expect(studentRow.getByText('Suspended')).toBeVisible();
});

test('invitation routes create the intended role without a role selector', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.screenshot({ path: testInfo.outputPath('login-390.png'), fullPage: true });
  await page.goto('/register?invite=student-demo-invite');
  await expect(page.getByText(/Joining Fluent Spring/)).toBeVisible();
  await expect(page.getByLabel('Role')).toHaveCount(0);
  await page.getByLabel('Your name').fill('Jamie Student');
  await page.getByLabel('Email address').fill('jamie@example.com');
  await page.getByLabel('Create password').fill('studentpass123');
  await page.getByLabel('Confirm password').fill('studentpass123');
  await page.getByRole('button', { name: /join fluent spring/i }).click();
  await expect(page.getByRole('heading', { name: /hi, jamie/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: /log out/i }).click();
  await page.goto('/invite/teacher?token=teacher-demo-invite');
  await expect(page.getByRole('heading', { name: 'Accept your invitation' })).toBeVisible();
  await expect(page.getByLabel('Role')).toHaveCount(0);
  await page.getByLabel('Your name').fill('Taylor Teacher');
  await page.getByLabel('Create password').fill('teacherpass123');
  await page.getByLabel('Confirm password').fill('teacherpass123');
  await page.getByRole('button', { name: /accept invitation/i }).click();
  await expect(page.locator('.page-title h1')).toHaveText('Section A');
  await page.getByRole('button', { name: /log out/i }).click();
  await page.getByLabel('Email address').fill('new.teacher@example.com');
  await page.getByLabel('Password', { exact: true }).fill('teacherpass123');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.locator('.page-title h1')).toHaveText('Section A');
});

test('role guards redirect visitors away from another role’s workspace', async ({ page }) => {
  await page.goto('/teacher');
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'student@wordsconnect.demo');
  await expect(page.getByRole('heading', { name: /hi, maya/i })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('wc_frontend_mock_user'))).not.toBeNull();
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
