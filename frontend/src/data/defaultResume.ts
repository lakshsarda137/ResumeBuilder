import type { ResumeData } from '../types/resume';
import { makeBullet } from '../types/resume';

export const defaultResume: ResumeData = {
  contact: {
    name: 'Laksh Sarda',
    links: [
      { id: 'link-email', value: 'lakshsarda137@gmail.com' },
      { id: 'link-phone', value: '(979) 327-8075' },
      { id: 'link-location', value: 'Houston, TX' },
      { id: 'link-linkedin', value: 'linkedin.com/in/lakshsarda' },
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
          title: 'Rice University',
          location: 'Houston, TX',
          date: 'August 2025 – May 2029',
          subtitle: 'Bachelor of Science in Computer Science and Mathematics',
          bullets: [
            makeBullet('GPA: 4.0/4.0'),
            makeBullet(
              'Coursework: Data Structures and Algorithms, Data Science and Machine Learning (Graduate), Linear Algebra',
            ),
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
          title: 'Checkmate',
          location: '',
          date: 'June 2025 – Present',
          subtitle:
            'Co-Founder | Python, LLM APIs, NLP, Computer Vision, FastAPI, PostgreSQL, Docker, AWS',
          bullets: [
            makeBullet(
              'Scoped and shipped an AI-powered grading tool that reads handwritten student submissions via Azure OCR, encodes rubric-answer pairs, and scores them using LLM-based semantic similarity, achieving >95% accuracy without manual intervention.',
            ),
            makeBullet(
              'Built an end-to-end automation pipeline: Chrome extension extracts submission data, FastAPI backend calls LLM APIs for scoring, results are written to PostgreSQL and returned to the user, eliminating a fully manual grading workflow.',
            ),
            makeBullet(
              'Deployed as containerized microservices on AWS; iterated based on user feedback from Rice, Stanford, and Georgia Tech, processing 500+ submissions per batch and 10k words in under 1 minute.',
            ),
          ],
        },
        {
          id: 'exp-2',
          title: 'Dell Technologies',
          location: '',
          date: 'March 2026',
          subtitle:
            'Student Extern | NIST Zero Trust (SP 800-207), MITRE ATT&CK, Threat Modeling',
          bullets: [
            makeBullet(
              'Analyzed supply chain attack vectors, BIOS-level vulnerabilities, and post-quantum cryptographic risks using the MITRE ATT&CK framework to classify and prioritize threat categories.',
            ),
            makeBullet(
              'Evaluated zero trust architecture patterns per NIST SP 800-207, assessing continuous verification and least-privilege access controls across enterprise environments.',
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
          title: 'Serenity',
          location: '',
          date: 'September 2023 – December 2024',
          subtitle:
            'Co-Founder | Python, Flask, Google Cloud, Sentiment Analysis, NLP, LLMs',
          bullets: [
            makeBullet(
              'Saw a gap in accessible mental health support and built a chatbot that uses sentiment analysis and NLP to adapt responses to user emotional state; implemented OOP-based session management with custom serialization to persist context across sessions.',
            ),
            makeBullet(
              'Top 4 at Harvard India Impact Initiative; won TYE Global Maker Faire ($1,500 prize).',
            ),
          ],
        },
        {
          id: 'proj-2',
          title: 'OwlUCanEat',
          location: '',
          date: 'January 2026 – Present',
          subtitle:
            'Founder | Python, FastAPI, SQL, JavaScript, Web Scraping, pytest, CI/CD, Vercel',
          bullets: [
            makeBullet(
              'Identified a manual process (students checking 5 servery menus daily) and automated it: built a data ingestion pipeline that scrapes live menu data and serves it via a REST API with <200ms response time to 100+ daily users.',
            ),
            makeBullet(
              'Implemented multi-filter search across 13 cuisine types, 10+ dietary tags, meal periods, and serveries. Wrote unit tests using pytest and set up CI/CD for automated deployment.',
            ),
          ],
        },
        {
          id: 'proj-3',
          title: 'Echo-Lingua',
          location: '',
          date: 'August 2024 – January 2025',
          subtitle:
            'Co-Founder | Python, PyTorch, NLP, Speech Processing, Raspberry Pi, ESP-32',
          bullets: [
            makeBullet(
              'Designed a multi-threaded pipeline running concurrent speech-to-text, machine translation, and text-to-speech models on a Raspberry Pi with end-to-end latency under 2 seconds.',
            ),
            makeBullet(
              'Wrote Python drivers for serial communication between Raspberry Pi and ESP-32 for real-time microphone input and speaker output.',
            ),
          ],
        },
        {
          id: 'proj-4',
          title: 'CourseDecider',
          location: '',
          date: 'February 2026 – Present',
          subtitle:
            'Founder | Python, React, FastAPI, SQL, Web Scraping, Graph Algorithms',
          bullets: [
            makeBullet(
              "Built a React frontend and FastAPI backend that scrapes Rice's course catalog; implemented BFS-based graph traversal over prerequisite chains and a ranking algorithm to compute the optimal path to a second major.",
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
        {
          id: 'skill-1',
          label: 'Languages',
          items: 'Python, SQL, JavaScript, Java, HTML/CSS',
        },
        {
          id: 'skill-2',
          label: 'AI & ML',
          items:
            'LLM APIs (Claude, OpenAI), PyTorch, Scikit-Learn, Hugging Face, NLP, Sentiment Analysis, Computer Vision',
        },
        {
          id: 'skill-3',
          label: 'Frameworks & Platforms',
          items: 'FastAPI, Flask, React, Node.js, AWS, Google Cloud, Azure, Docker, Vercel',
        },
        {
          id: 'skill-4',
          label: 'Data & Tools',
          items:
            'PostgreSQL, Firebase, Supabase, Pandas, NumPy, Git, GitHub, Claude Code, GitHub Copilot, CI/CD, Linux',
        },
      ],
    },
  ],
};
