import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ResumeEditor } from './components/ResumeEditor';
import { RepositoryPage } from './pages/RepositoryPage';
import { EducationPage } from './pages/EducationPage';
import { OngoingPage } from './pages/OngoingPage';
import { HistoryPage } from './pages/HistoryPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { PrivacyPage } from './pages/PrivacyPage';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/resume" replace />} />
          <Route path="/resume"     element={<ResumeEditor />} />
          <Route path="/repository" element={<RepositoryPage />} />
          <Route path="/education"   element={<EducationPage />} />
          <Route path="/ongoing"    element={<OngoingPage />} />
          <Route path="/history"    element={<HistoryPage />} />
          <Route path="/knowledge"  element={<KnowledgePage />} />
          <Route path="/privacy"    element={<PrivacyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
