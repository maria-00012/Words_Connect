export const DEMO_PASSWORD = 'connect123';

export const seedUsers = [
  { id: 'u-admin', name: 'Avery Morgan', email: 'admin@wordsconnect.demo', role: 'admin', status: 'Active' },
  { id: 'u-teacher', name: 'Samira Rahman', email: 'teacher@wordsconnect.demo', role: 'teacher', status: 'Active' },
  { id: 'u-student', name: 'Maya Ahmed', email: 'student@wordsconnect.demo', role: 'student', status: 'Active' },
  { id: 'u-student-2', name: 'Rafi Hasan', email: 'rafi@wordsconnect.demo', role: 'student', status: 'Active' },
  { id: 'u-student-3', name: 'Nadia Islam', email: 'nadia@wordsconnect.demo', role: 'student', status: 'Active' },
];

export const seedState = {
  users: seedUsers,
  invites: [
    { token: 'teacher-demo-invite', type: 'teacher', email: 'new.teacher@example.com', status: 'Pending', expiresAt: Date.now() + 7 * 86400000 },
    { token: 'student-demo-invite', type: 'student', classroomId: 'class-1', classroomName: 'Fluent Spring', status: 'Active', expiresAt: Date.now() + 7 * 86400000 },
  ],
  classroom: { id: 'class-1', name: 'Fluent Spring', teacherId: 'u-teacher', stage: 0, wallOpen: true, submissionsOpen: true, reveal: false },
  activeSectionId: 'section-1',
  sections: [{ id: 'section-1', name: 'Section A', createdAt: Date.now() - 86400000 }],
  archives: [],
  wall: [
    { id: 'w-1', authorId: 'u-student-2', author: 'Rafi Hasan', recipient: 'Maya', text: 'I appreciate the way you always welcome new ideas. It makes our group feel comfortable.', createdAt: Date.now() - 3600000 },
    { id: 'w-2', authorId: 'u-student-3', author: 'Nadia Islam', recipient: '', text: 'Your positive attitude encourages everyone to keep trying.', createdAt: Date.now() - 1800000 },
  ],
  progress: {
    'u-student': { stage: 0, pit: {}, assignment: null, submission: null, revision: '' },
    'u-student-2': { stage: 3, pit: { 0: { choice: 1 }, 1: { choice: 0 }, 2: { choice: 2 } }, submission: null },
    'u-student-3': { stage: 4, pit: { 0: { choice: 1 }, 1: { choice: 0 }, 2: { choice: 2 } }, submission: { academic: 'By joining campus activities, students can strengthen their social abilities and grow as individuals.', remix: '', result: { score: 87, m: 4, nw: 82, re: 1, cp: 0, iss: 'structure' }, createdAt: Date.now() - 900000 } },
  },
};
