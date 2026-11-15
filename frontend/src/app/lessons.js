export const SAMPLE_MESSAGE = 'Your kindness makes our class a more welcoming place, and your positive attitude encourages everyone.';
export const SOURCE_SENTENCE = "Regular participation in extracurricular activities can improve university students' social skills and contribute to their personal development.";
export const PIT_STOP = [
  { title: '1 · The Meaning Keeper 🔐', question: 'Which option keeps the original meaning?', options: [
    'University clubs guarantee that first-year students will achieve academic success and become popular.',
    'Through involvement in campus clubs, newcomers can strengthen their communication abilities and build relationships with others.',
    'First-year students join clubs mainly to improve their grades and compete with classmates.',
  ], answer: 1, feedback: [
    'Oops! The meaning escaped. The source never promises success or popularity.',
    'Meaning secured! Both communication skills and social connections remain.',
    'Oops! The source says nothing about grades or competing.',
  ] },
  { title: '2 · The Synonym Trap 🪤', question: 'Which version mainly swaps words and keeps almost the same structure?', options: [
    'Participation in university clubs allows first-year students to improve communication skills and establish social relationships.',
    'Campus clubs offer newcomers opportunities to connect with peers while developing their communication abilities.',
    'When first-year students take part in clubs, they can develop stronger communication skills and social networks.',
  ], answer: 0, feedback: [
    'Trap spotted! Only words changed (“enables” → “allows”); the pattern is the same.',
    'Not this one. It already rebuilds the sentence.',
    'Not this one. “When… they can…” changes the structure.',
  ] },
  { title: '3 · The Structure Switch 🏁', question: 'Which option changes the grammatical structure and keeps the idea?', options: [
    'Participation in campus clubs enables new students to develop communication skills and establish social connections.',
    'First-year students become successful because university clubs guarantee better grades.',
    'By getting involved in campus clubs, first-year students can strengthen how they communicate and form connections with others.',
  ], answer: 2, feedback: [
    'Not quite. Only words changed; it still opens with “Participation in…”.',
    'Not quite. This adds ideas the source does not contain.',
    'Excellent! The “By getting involved…” opening changes the structure and keeps both ideas.',
  ] },
];

export const COACH_ANSWERS = [
  [/cite|citation|referenc|plagiar|credit|source/i, 'Yes. Cite the original source even when you paraphrase. Changing the wording does not make someone else’s idea your own.'],
  [/quot/i, 'Use direct quotations sparingly. A good paraphrase shows understanding, and it still needs a citation.'],
  [/synonym|swap|replac|thesaurus/i, 'No. Replacing a few words while keeping the same structure is a weak paraphrase. Understand the idea, then change vocabulary and structure.'],
  [/structur|grammar|pattern|rearrang|order|sentence/i, 'Change the grammatical pattern. “X helps students do Y” can become “By doing X, students can…”. Keep the meaning.'],
  [/vocab|word|expression|phrase/i, 'Choose alternatives that mean the same in this context. Simple accurate words beat difficult words that change the meaning.'],
  [/meaning|preserv|keep|distort/i, 'Keep every essential idea. Do not remove important information, add new claims, or exaggerate.'],
  [/why|import|purpose|need|useful/i, 'It lets you use source ideas in your own writing, show understanding, avoid too many quotes, and keep academic integrity.'],
  [/what is|mean by|defin|paraphras|how/i, 'Paraphrasing = same idea, different words and structure. First understand, then reword, then restructure.'],
];
