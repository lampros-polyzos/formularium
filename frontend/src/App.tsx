import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import './App.css'
import LandingPage from './pages/LandingPage';
import StudioPage from './pages/StudioPage';
import FormulationEditor from './pages/FormulationEditor';

function App() {

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/studio/new" element={<FormulationEditor />} />
            <Route path="/studio/:id" element={<FormulationEditor />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
