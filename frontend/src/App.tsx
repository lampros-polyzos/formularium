import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ScrollManager from './components/ScrollManager';
import './App.css'
import LandingPage from './pages/LandingPage';
import StudioPage from './pages/StudioPage';
import StartPage from './pages/StartPage';
import ImportFormulaPage from './pages/ImportFormulaPage';
import FormulationEditor from './pages/FormulationEditor';
import StashPage from './pages/StashPage';
import FormulaHistoryPage from './pages/FormulaHistoryPage';
import MetricsPage from './pages/MetricsPage';
import ShoppingListPage from './pages/ShoppingListPage';
import WhatCanIMakePage from './pages/WhatCanIMakePage';
import ContainersPage from './pages/ContainersPage';
import IngredientsLibraryPage from './pages/IngredientsLibraryPage';
import CommunityFeed from './pages/CommunityFeed';
import PostDetail from './pages/PostDetail';
import ModerationPage from './pages/ModerationPage';
import BlogPage from './pages/BlogPage';
import BlogArticlePage from './pages/BlogArticlePage';
import LearnHubPage from './pages/LearnHubPage';
import ToolsPage from './pages/ToolsPage';
import LegalPage from './pages/LegalPage';
import BatchesPage from './pages/BatchesPage';
import BatchDetailPage from './pages/BatchDetailPage';
import BenchModePage from './pages/BenchModePage';
import { DialogProvider } from './contexts/DialogContext';
import { PRIVACY_POLICY, TERMS_OF_USE } from './content/legal';

function App() {

  return (
    <AuthProvider>
      <SettingsProvider>
        <DialogProvider>
        <BrowserRouter>
          <ScrollManager />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/:slug" element={<BlogArticlePage />} />
            <Route path="/learn" element={<LearnHubPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/privacy" element={<LegalPage document={PRIVACY_POLICY} />} />
            <Route path="/terms" element={<LegalPage document={TERMS_OF_USE} />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/studio" element={<StudioPage />} />
              <Route path="/studio/start" element={<StartPage />} />
              <Route path="/studio/import" element={<ImportFormulaPage />} />
              <Route path="/studio/new" element={<FormulationEditor />} />
              <Route path="/studio/:id" element={<FormulationEditor />} />
              <Route path="/studio/:id/history" element={<FormulaHistoryPage />} />
              <Route path="/stash" element={<StashPage />} />
              <Route path="/what-can-i-make" element={<WhatCanIMakePage />} />
              <Route path="/metrics" element={<MetricsPage />} />
              <Route path="/shopping" element={<ShoppingListPage />} />
              <Route path="/batches" element={<BatchesPage />} />
              <Route path="/batches/:id" element={<BatchDetailPage />} />
              <Route path="/batches/:id/bench" element={<BenchModePage />} />
              <Route path="/containers" element={<ContainersPage />} />
              <Route path="/library" element={<IngredientsLibraryPage />} />
              <Route path="/community" element={<CommunityFeed />} />
              <Route path="/community/moderation" element={<ModerationPage />} />
              <Route path="/community/:id" element={<PostDetail />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </DialogProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}

export default App
