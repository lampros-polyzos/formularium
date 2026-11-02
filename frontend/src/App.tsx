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

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/studio" element={<StudioPage />} />
              <Route path="/studio/new" element={<FormulationEditor />} />
              <Route path="/studio/:id" element={<FormulationEditor />} />
              <Route path="/stash" element={<StashPage />} />
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
