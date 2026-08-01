import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ResumeEditor } from './components/ResumeEditor';
import { BulkResumeBuilderPage } from './pages/BulkResumeBuilderPage';
import { RepositoryPage } from './pages/RepositoryPage';
import { EducationPage } from './pages/EducationPage';
import { HistoryPage } from './pages/HistoryPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SettingsPage } from './pages/SettingsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/resume" replace />} />
          <Route path="/resume"     element={<ResumeEditor />} />
          <Route path="/bulk"       element={<BulkResumeBuilderPage />} />
          <Route path="/repository" element={<RepositoryPage />} />
          <Route path="/education"   element={<EducationPage />} />
          <Route path="/history"    element={<HistoryPage />} />
          <Route path="/knowledge"  element={<KnowledgePage />} />
          <Route path="/settings"   element={<SettingsPage />} />
          <Route path="/privacy"    element={<PrivacyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
