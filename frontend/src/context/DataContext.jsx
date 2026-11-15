import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { seedState } from '../app/mockSeed.js';
import { createId } from '../services/mockApi.js';

const DataContext = createContext(null);
const DATA_KEY = 'wc_frontend_mock_data_v1';
function loadState() {
  try { return JSON.parse(localStorage.getItem(DATA_KEY)) || seedState; } catch { return seedState; }
}

export function DataProvider({ children }) {
  const [data, setData] = useState(loadState);
  useEffect(() => localStorage.setItem(DATA_KEY, JSON.stringify(data)), [data]);
  useEffect(() => {
    const syncUsers = (event) => setData((current) => ({ ...current, users: event.detail }));
    window.addEventListener('wc:users-updated', syncUsers);
    return () => window.removeEventListener('wc:users-updated', syncUsers);
  }, []);
  const value = useMemo(() => ({
    data,
    setData,
    addWallPost: (post) => setData((current) => ({ ...current, wall: [...current.wall, { ...post, id: createId('wall'), createdAt: Date.now() }] })),
    updateClassroom: (changes) => setData((current) => ({ ...current, classroom: { ...current.classroom, ...changes } })),
    updateProgress: (userId, changes) => setData((current) => ({ ...current, progress: { ...current.progress, [userId]: { ...(current.progress[userId] || {}), ...changes } } })),
    addInvite: (invite) => setData((current) => ({ ...current, invites: [invite, ...current.invites] })),
    addSection: (section) => setData((current) => ({
      ...current,
      archives: [...(current.archives || []), { section: current.sections.find((item) => item.id === current.activeSectionId), wall: current.wall, progress: current.progress }],
      sections: [...current.sections, section],
      activeSectionId: section.id,
      wall: [],
      progress: Object.fromEntries(Object.keys(current.progress).map((id) => [id, { stage: 0, pit: {}, assignment: null, submission: null, revision: '' }])),
      classroom: { ...current.classroom, stage: 0, wallOpen: true, submissionsOpen: true, reveal: false },
    })),
  }), [data]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used inside DataProvider');
  return context;
};
