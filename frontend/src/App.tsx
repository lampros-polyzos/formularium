import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import './App.css'
import LandingPage from './pages/LandingPage';
import StudioPage from './pages/StudioPage';
import FormulationEditor from './pages/FormulationEditor';
import StashPage from './pages/StashPage';

function App() {

  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/studio" element={<StudioPage />} />
              <Route path="/studio/new" element={<FormulationEditor />} />
              <Route path="/studio/:id" element={<FormulationEditor />} />
              <Route path="/stash" element={<StashPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  )
}

export default App
