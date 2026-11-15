export function studentGradeSummary(studentId, submissions) {
  const records = submissions.filter((item) => item.studentId === studentId && item.type !== 'revision');
  const marks = records.filter((item) => item.grading?.status === 'reviewed' && item.grading.officialMark !== '' && Number.isFinite(Number(item.grading.officialMark))).map((item) => Number(item.grading.officialMark));
  return {
    submitted: records.some((item) => ['message-remix', 'academic-transfer'].includes(item.type)),
    gradingStatus: !records.length ? 'Not submitted' : records.every((item) => item.grading?.status === 'reviewed') ? 'Reviewed' : 'Pending review',
    officialMark: marks.length ? Math.round(marks.reduce((sum, value) => sum + value, 0) / marks.length) : null,
  };
}

export function officialRankings(submissions, users) {
  const byStudent = new Map();
  submissions.filter((item) => item.type !== 'revision' && item.grading?.status === 'reviewed' && item.grading.officialMark !== '' && Number.isFinite(Number(item.grading.officialMark))).forEach((item) => {
    const marks = byStudent.get(item.studentId) || [];
    marks.push(Number(item.grading.officialMark));
    byStudent.set(item.studentId, marks);
  });
  return [...byStudent.entries()].map(([studentId, marks]) => ({
    studentId,
    name: users.find((user) => user.id === studentId)?.name || 'Student',
    mark: Math.round(marks.reduce((sum, value) => sum + value, 0) / marks.length),
    reviewedCount: marks.length,
  })).sort((a, b) => b.mark - a.mark || a.name.localeCompare(b.name)).slice(0, 3);
}
