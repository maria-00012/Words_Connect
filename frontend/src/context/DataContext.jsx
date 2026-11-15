import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { seedState } from '../app/mockSeed.js';
import { createId } from '../services/mockApi.js';
import { DATA_KEY, createSectionRecord, emptyGrading, loadInitialState } from '../services/dataModel.js';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [data, setData] = useState(() => loadInitialState(globalThis.localStorage, seedState));
  const activeSection = data.sections.find((section) => section.id === data.activeSectionId) || null;

  useEffect(() => {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); }
    catch { /* Storage failures do not replace or clear the existing saved data. */ }
  }, [data]);

  useEffect(() => {
    const syncUsers = (event) => setData((current) => {
      const users = event.detail.map((user) => ({ ...user }));
      const sections = current.sections.map((section) => ({ ...section, studentIds: [...section.studentIds] }));
      users.filter((user) => user.role === 'student').forEach((user) => {
        const openMembership = sections.find((section) => section.status !== 'archived' && section.studentIds.includes(user.id));
        const existing = openMembership || sections.find((section) => section.studentIds.includes(user.id));
        const targetId = user.sectionId || openMembership?.id || existing?.id;
        const target = sections.find((section) => section.id === targetId && section.status !== 'archived');
        if (target && !target.studentIds.includes(user.id)) target.studentIds.push(user.id);
      });
      return { ...current, users, sections };
    });
    window.addEventListener('wc:users-updated', syncUsers);
    return () => window.removeEventListener('wc:users-updated', syncUsers);
  }, []);

  const value = useMemo(() => {
    const updateSection = (sectionId, changes) => setData((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId
        ? { ...section, ...changes, updatedAt: Date.now() }
        : section),
    }));
    const updateProgress = (userId, changes, sectionId = data.activeSectionId) => setData((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId && section.status !== 'archived'
        ? { ...section, studentIds: section.studentIds.includes(userId) ? section.studentIds : [...section.studentIds, userId], progress: { ...section.progress, [userId]: { ...(section.progress[userId] || {}), ...changes } }, updatedAt: Date.now() }
        : section),
    }));
    const updateClassroom = (changes, sectionId = data.activeSectionId) => setData((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId
        ? { ...section, settings: { ...section.settings, ...changes }, updatedAt: Date.now() }
        : section),
    }));
    const addWallPost = (post, sectionId = data.activeSectionId) => setData((current) => {
      const record = { ...post, id: createId('wall'), sectionId, createdAt: Date.now() };
      return {
        ...current,
        sections: current.sections.map((section) => section.id === sectionId && section.status !== 'archived'
          ? { ...section, studentIds: section.studentIds.includes(post.authorId) ? section.studentIds : [...section.studentIds, post.authorId], wall: [...section.wall, record], submissions: [...section.submissions, { id: record.id, type: 'appreciation', studentId: post.authorId, sectionId, response: record.text, recipient: record.recipient, submittedAt: record.createdAt, grading: emptyGrading() }], updatedAt: Date.now() }
          : section),
      };
    });
    const addSubmission = (record, sectionId = data.activeSectionId) => setData((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId && section.status !== 'archived'
        ? { ...section, studentIds: section.studentIds.includes(record.studentId) ? section.studentIds : [...section.studentIds, record.studentId], submissions: [...section.submissions, { ...record, id: record.id || createId('submission'), sectionId, submittedAt: record.submittedAt || Date.now(), grading: record.grading || emptyGrading() }], updatedAt: Date.now() }
        : section),
    }));
    const saveGrade = (submissionId, grade, sectionId = data.activeSectionId) => setData((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId
        ? { ...section, submissions: section.submissions.map((record) => record.id === submissionId ? { ...record, grading: { ...(record.grading || emptyGrading()), ...grade, updatedAt: Date.now() } } : record), updatedAt: Date.now() }
        : section),
    }));
    const createSection = (name) => setData((current) => {
      const section = createSectionRecord({ name: name.trim() || `Section ${String.fromCharCode(65 + current.sections.length)}` });
      return { ...current, sections: [...current.sections, section] };
    });
    const setActiveSection = (sectionId) => setData((current) => current.sections.some((section) => section.id === sectionId && section.status !== 'archived')
      ? { ...current, activeSectionId: sectionId }
      : current);
    const archiveSection = (sectionId) => setData((current) => {
      const target = current.sections.find((section) => section.id === sectionId);
      if (!target) return current;
      const sections = current.sections.map((section) => section.id === sectionId ? { ...section, status: 'archived', archivedAt: Date.now(), settings: { ...section.settings, wallOpen: false, submissionsOpen: false }, updatedAt: Date.now() } : section);
      const next = current.activeSectionId === sectionId ? sections.find((section) => section.status !== 'archived') : null;
      return { ...current, sections, activeSectionId: current.activeSectionId === sectionId ? next?.id || null : current.activeSectionId };
    });
    const reopenSection = (sectionId) => setData((current) => current.sections.some((section) => section.id === sectionId)
      ? { ...current, activeSectionId: sectionId, sections: current.sections.map((section) => section.id === sectionId ? { ...section, status: 'open', archivedAt: null, settings: { ...section.settings, wallOpen: true, submissionsOpen: true }, updatedAt: Date.now() } : section) }
      : current);
    const deleteSection = (sectionId) => setData((current) => {
      const remaining = current.sections.filter((section) => section.id !== sectionId);
      const nextActive = current.activeSectionId === sectionId ? remaining.find((section) => section.status !== 'archived')?.id || remaining[0]?.id || null : current.activeSectionId;
      return { ...current, sections: remaining, activeSectionId: nextActive };
    });
    const resetSection = (sectionId) => setData((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId ? {
        ...section,
        wall: [], submissions: [],
        progress: Object.fromEntries(section.studentIds.map((id) => [id, { stage: 0, pit: {}, pitAnswers: {}, pitCompleted: null, assignment: null, submission: null, revision: '', revisionResult: null, revisionHistory: [] }])),
        settings: { ...section.settings, stage: 0, reveal: false },
        updatedAt: Date.now(),
      } : section),
    }));
    const setStudentSection = (studentId, sectionId, isMember = true) => setData((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id !== sectionId ? section : ({
        ...section,
        studentIds: isMember ? [...new Set([...section.studentIds, studentId])] : section.studentIds.filter((id) => id !== studentId),
        updatedAt: Date.now(),
      })),
    }));
    return {
      data, setData, activeSection, updateSection, updateProgress, updateClassroom,
      addWallPost, addSubmission, saveGrade, createSection, setActiveSection,
      archiveSection, reopenSection, deleteSection, setStudentSection,
      resetSection,
      addInvite: (invite) => setData((current) => ({ ...current, invites: [invite, ...current.invites] })),
    };
  }, [data, activeSection]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used inside DataProvider');
  return context;
};
