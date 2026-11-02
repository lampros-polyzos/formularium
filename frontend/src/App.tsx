import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import ScrollManager from './components/ScrollManager';
import './App.css'
import LandingPage from './pages/LandingPage';
import StudioPage from './pages/StudioPage';
import FormulationEditor from './pages/FormulationEditor';
import StashPage from './pages/StashPage';
import ContainersPage from './pages/ContainersPage';
import IngredientsLibraryPage from './pages/IngredientsLibraryPage';
import CommunityFeed from './pages/CommunityFeed';
import PostDetail from './pages/PostDetail';
import BlogPage from './pages/BlogPage';
import BlogArticlePage from './pages/BlogArticlePage';
import LearnHubPage from './pages/LearnHubPage';
import LegalPage from './pages/LegalPage';
import BatchesPage from './pages/BatchesPage';
import BatchDetailPage from './pages/BatchDetailPage';
import { PRIVACY_POLICY, TERMS_OF_USE } from './content/legal';

function App() {

  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <ScrollManager />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/:slug" element={<BlogArticlePage />} />
            <Route path="/learn" element={<LearnHubPage />} />
            <Route path="/privacy" element={<LegalPage document={PRIVACY_POLICY} />} />
            <Route path="/terms" element={<LegalPage document={TERMS_OF_USE} />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/studio" element={<StudioPage />} />
              <Route path="/studio/new" element={<FormulationEditor />} />
              <Route path="/studio/:id" element={<FormulationEditor />} />
              <Route path="/stash" element={<StashPage />} />
              <Route path="/batches" element={<BatchesPage />} />
              <Route path="/batches/:id" element={<BatchDetailPage />} />
              <Route path="/containers" element={<ContainersPage />} />
              <Route path="/library" element={<IngredientsLibraryPage />} />
              <Route path="/community" element={<CommunityFeed />} />
              <Route path="/community/:id" element={<PostDetail />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  )
}

export default App
