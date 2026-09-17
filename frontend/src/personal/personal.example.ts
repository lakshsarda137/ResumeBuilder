// Committed placeholder profile, used when personal.local.ts is absent.
// To personalize: copy this file to personal.local.ts (gitignored), change
// `export const examplePersonalProfile` to a default export, and fill it in.
import { makeBullet } from '../types/resume';
import type { PersonalProfile } from './types';

export const examplePersonalProfile: PersonalProfile = {
  contact: {
    name: 'Alex Candidate',
    email: 'alex.candidate@example.com',
    phone: '(555) 555-0100',
    linkedin: 'linkedin.com/in/alex-candidate',
    github: 'github.com/alex-candidate',
    location: 'Springfield, IL',
  },
  defaultResume: {
    contact: {
      name: 'Alex Candidate',
      links: [
        { id: 'link-email', value: 'alex.candidate@example.com' },
        { id: 'link-phone', value: '(555) 555-0100' },
        { id: 'link-linkedin', value: 'linkedin.com/in/alex-candidate', label: 'LinkedIn' },
        { id: 'link-github', value: 'github.com/alex-candidate', label: 'GitHub' },
      ],
    },
    sections: [
      {
        id: 'education',
        type: 'education',
        title: 'Education',
        entries: [
          {
            id: 'edu-1',
            title: 'State University',
            location: 'Springfield, IL',
            date: 'May 2029 (Expected Graduation)',
            subtitle: 'Bachelor of Science in Computer Science',
            bullets: [
              makeBullet('GPA: 3.9/4.0'),
              makeBullet('Relevant Coursework: Data Structures, Algorithms, Databases'),
            ],
          },
        ],
      },
      {
        id: 'experience',
        type: 'experience',
        title: 'Experience',
        entries: [
          {
            id: 'exp-1',
            title: 'Example Startup',
            location: '',
            date: 'Jun 2025 – Present',
            subtitle: 'Co-Founder',
            bullets: [
              makeBullet(
                'Built a web app that helps small bakeries plan daily orders by predicting demand from past sales, now used by 30 local shops.',
              ),
            ],
          },
        ],
      },
      {
        id: 'projects',
        type: 'projects',
        title: 'Projects',
        entries: [
          {
            id: 'proj-1',
            title: 'Example Project',
            location: '',
            date: 'Jan 2026 – Present',
            subtitle: '',
            bullets: [
              makeBullet(
                'Created a campus dining website that shows every dining hall menu in one place for students checking what to eat.',
              ),
            ],
          },
        ],
      },
      {
        id: 'skills',
        type: 'skills',
        title: 'Technical Skills',
        entries: [],
        skills: [
          { id: 'skill-1', label: 'Languages', items: 'Python, TypeScript, SQL, Java' },
          { id: 'skill-2', label: 'Tools', items: 'React, FastAPI, PostgreSQL, Docker, AWS, Git' },
        ],
      },
    ],
  },
  promptExamples: {
    accelerator: {
      title: 'Acme Labs',
      programName: 'LaunchPad',
      titleNote: 'LaunchPad Startup Accelerator (<5% acceptance)',
    },
    plainDiscipline: ['an AI that taught itself to play chess', 'software that reads receipts'],
    technicalMechanics: 'deep reinforcement learning, tree search, a multi-million-parameter network',
    plainHow: 'reads scanned forms and checks them against the required fields',
    kindOfThing: ['a Chrome extension that...', 'an internal scheduling tool for...'],
    internalNames: ['Atlas', 'Tabby', 'the ingestion service'],
    beforeAfter: 'from over a week to 2-3 days',
    scale: ['400 machines', '100+ daily users'],
    sourceTermName: 'an inventory system',
    ownership: ['led', 'sole developer', 'primary developer as the team grew', 'sole engineer, later a small team'],
    educationHonors: "GPA: 3.90/4.00; Dean's List (Fall 2025)",
    educationInvolvement: 'Teaching Assistant, Intro to Programming; Robotics Club',
    coverLetterFrontLoad: "A computer science student at State University, I've...",
    coverLetterFrontLoadLong: "A computer science student at State University through May 2029, I've spent...",
  },
};
