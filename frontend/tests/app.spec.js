import { expect, test } from '@playwright/test';

const demoPassword = 'connect123';

async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(demoPassword);
  await page.getByRole('button', { name: /log in/i }).click();
}

test('student can complete the original five-stage learning path', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Are synonyms enough?' }).click();
  await expect(page.getByText(/Replacing a few words/)).toBeVisible();

  await page.locator('.stage-progress button').nth(2).click();
  await page.getByRole('button', { name: /B\. Through involvement/ }).click();
  await expect(page.getByText(/Meaning secured/)).toBeVisible();

  await page.locator('.stage-progress button').nth(3).click();
  await page.getByLabel('Your paraphrase').fill('Your warm attitude helps everyone feel welcome and encourages the class to participate.');
  await page.getByRole('button', { name: /next: academic sentence/i }).click();
  await page.getByLabel('Your academic paraphrase').fill('By joining campus activities, university students can strengthen their social abilities and grow as individuals.');
  await page.getByRole('button', { name: /^submit$/i }).click();
  await expect(page.getByRole('heading', { name: 'Your Report' })).toBeVisible();
  await expect(page.getByText(/Indicative score/)).toBeVisible();
  await page.getByLabel('Your revised version').fill('Students can build social skills and develop personally by taking part in extracurricular activities.');
  await page.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByText(/New score/)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('teacher can manage a class, reveal results, and generate a registration QR', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await login(page, 'teacher@wordsconnect.demo');
  await expect(page.getByRole('heading', { name: 'Section A' })).toBeVisible();
  await page.getByRole('tab', { name: 'Controls' }).click();
  await page.getByRole('button', { name: '2 Learn' }).click();
  await page.locator('.control-row').nth(1).getByRole('button').click();
  await expect(page.locator('.control-row').nth(1).getByRole('button')).toHaveText(/closed.*tap to open/i);
  await page.getByRole('button', { name: 'Manage classroom QR' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.qr-frame svg')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('tab', { name: 'Results' }).click();
  await page.getByRole('button', { name: /reveal to students/i }).click();
  await expect(page.getByRole('button', { name: /hide from students/i })).toBeVisible();
  await page.getByRole('tab', { name: 'Controls' }).click();
  await page.getByLabel(/name of the new section/i).fill('Section B');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /start new section/i }).click();
  await expect(page.getByRole('heading', { name: 'Section B' })).toBeVisible();
  const archive = page.locator('.history-row').filter({ hasText: 'Section A' });
  await expect(archive).toBeVisible();
  await expect(archive.getByRole('button', { name: /export/i })).toBeEnabled();
  expect(consoleErrors).toEqual([]);
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
  await expect(page.getByRole('heading', { name: 'Section A' })).toBeVisible();
  await page.getByRole('button', { name: /log out/i }).click();
  await page.getByLabel('Email address').fill('new.teacher@example.com');
  await page.getByLabel('Password', { exact: true }).fill('teacherpass123');
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.getByRole('heading', { name: 'Section A' })).toBeVisible();
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
      await page.getByRole('button', { name: 'Manage classroom QR' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('button', { name: /spotlight wall/i }).click();
      await expect(page.getByRole('dialog', { name: 'Appreciation Wall' })).toBeVisible();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    if (viewport.width === 390) await page.screenshot({ path: testInfo.outputPath('teacher-390.png'), fullPage: true });
  });
}
