import { SOURCE_SENTENCE } from '../app/lessons.js';

const STOP = new Set('a an the of in on at to for and or but with by as is are was were be been can could may might will would that this these those it its their there from into than then so such which who whom while also more most very our your his her they them we you i not'.split(' '));
const ACT = /participat|involv|engag|take part|taking part|took part|join|activit|club|societ|extracurricular|co-curricular/;
const SOC = /social|sociab|relationship|connection|peer|interpersonal|friend|network|communicat|interact|people/;
const SKL = /skill|abilit|competenc|capab|capacit|proficien|talent|communicat|interact|sociab/;
const DEV = /develop|growth|grow|matur|personal|self-improv|progress|flourish|as individuals|as people/;
const NEG = /\b(harm|harms|harmful|damag\w*|hurt\w*|worsen\w*|hinder\w*|prevent\w*|reduc\w*|decreas\w*|destroy\w*|never|cannot|can't|not|no)\b/;
const OVR = /\b(always|guarantee\w*|definitely|certainly|ensure\w*|must|every student|all students|will (improve|develop|boost|build))\b/;

const tokenize = (text) => text.toLowerCase().replace(/’/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) || [];
const stem = (word) => word.replace(/'s$/, '').replace(/(ations|ation|ions|ion|ing|ed|es|s|ly|ment)$/, '').slice(0, 6);

export function assessParaphrase(text, sourceSentence = SOURCE_SENTENCE) {
  const lower = text.toLowerCase();
  const words = tokenize(text);
  const count = words.length;
  const content = words.filter((word) => !STOP.has(word));
  const sourceWords = tokenize(sourceSentence || SOURCE_SENTENCE);
  const sourceContent = new Set(sourceWords.filter((word) => !STOP.has(word)).map(stem));
  const overlap = content.length ? content.filter((word) => sourceContent.has(stem(word))).length / content.length : 1;
  let longestRun = 0;
  let previous = Array(sourceWords.length + 1).fill(0);
  for (let i = 1; i <= count; i += 1) {
    const current = Array(sourceWords.length + 1).fill(0);
    for (let j = 1; j <= sourceWords.length; j += 1) {
      current[j] = words[i - 1] === sourceWords[j - 1] ? previous[j - 1] + 1 : 0;
      longestRun = Math.max(longestRun, current[j]);
    }
    previous = current;
  }
  const trigrams = (tokens) => {
    const values = new Set();
    for (let i = 0; i + 2 < tokens.length; i += 1) values.add(tokens.slice(i, i + 3).join(' '));
    return values;
  };
  const candidateTrigrams = trigrams(words);
  const sourceTrigrams = trigrams(sourceWords);
  const commonTrigrams = [...candidateTrigrams].filter((item) => sourceTrigrams.has(item)).length;
  const trigramOverlap = candidateTrigrams.size ? commonTrigrams / candidateTrigrams.size : 0;
  const matchedIdeas = [ACT, SOC, SKL, DEV].filter((regex) => regex.test(lower)).length;
  const copied = longestRun >= 5 || trigramOverlap >= 0.3 || (overlap >= 0.8 && count >= 8);
  const similarity = copied || overlap >= 0.75;
  const openingChanged = words.slice(0, 2).join(' ') !== sourceWords.slice(0, 2).join(' ');
  const restructured = openingChanged && trigramOverlap < 0.2 && overlap < 0.8;
  const changedMeaning = NEG.test(lower) || OVR.test(lower);
  let score = Math.round(
    (matchedIdeas / 4) * 35 + Math.min((1 - overlap) / 0.5, 1) * 25 + (restructured ? 20 : 0) +
    (count >= 12 && count <= 45 ? 15 : count >= 8 && count <= 60 ? 8 : 3) + (/[.!?]\s*$/.test(text) ? 5 : 0),
  );
  if (similarity) score = Math.min(score, copied ? 35 : 60);
  if (changedMeaning) score = Math.min(score, 50);
  if (count < 8) score = Math.min(score, 30);
  const issues = [];
  if (similarity) issues.push('swap');
  if (matchedIdeas < 4 || count < 8) issues.push('lost');
  if (changedMeaning) issues.push('changed');
  if (!restructured) issues.push('structure');
  return { score, m: matchedIdeas, nw: Math.round((1 - overlap) * 100), re: restructured ? 1 : 0, cp: copied ? 1 : 0, iss: issues.join(',') };
}

export const feedbackLabels = {
  swap: ['Word Swapping', 'Only a few words were replaced.', 'Try changing the sentence structure as well.'],
  lost: ['Meaning Lost', 'An important idea is missing.', 'Check that all essential information remains.'],
  changed: ['Meaning Changed', 'The original idea was distorted.', 'Do not add information the source does not contain.'],
  structure: ['Structure Unchanged', 'The original sentence pattern was kept.', 'Rebuild the sentence with a different opening and pattern.'],
};

export const issueList = (result = {}) => result.iss ? String(result.iss).split(',').filter(Boolean) : [];
