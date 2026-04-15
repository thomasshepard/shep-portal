import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './hooks/useAuth'
import IOSInstallBanner from './components/IOSInstallBanner'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import PermRoute from './components/PermRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import PropertyDetail from './pages/PropertyDetail'
import Tools from './pages/Tools'
import ToolView from './pages/ToolView'
import Files from './pages/Files'
import LLCs from './pages/LLCs'
import LLCDetail from './pages/LLCDetail'
import Chickens from './pages/Chickens'
import FlockDetail from './pages/FlockDetail'
import AdminUsers from './pages/admin/AdminUsers'
import AdminLogs from './pages/admin/AdminLogs'
import AdminContent from './pages/admin/AdminContent'
import MaintenanceSubmit from './pages/MaintenanceSubmit'
import ErrorBoundary from './components/ErrorBoundary'
import Documents from './pages/Documents'
import Deals from './pages/Deals'
import DealsSearchCriteria from './pages/DealsSearchCriteria'
import HappyCuts from './pages/HappyCuts'
import HappyCutsClientDetail from './pages/HappyCutsClientDetail'
import HappyCutsGuide from './pages/HappyCutsGuide'
import ChickenIncubatorGuide from './pages/ChickenIncubatorGuide'
import Notifications from './pages/Notifications'
import Tasks from './pages/Tasks'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <IOSInstallBanner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="properties" element={<PermRoute permission="properties"><ErrorBoundary><Properties /></ErrorBoundary></PermRoute>} />
            <Route path="properties/:id" element={<PermRoute permission="properties"><ErrorBoundary><PropertyDetail /></ErrorBoundary></PermRoute>} />
            <Route path="tools" element={<Tools />} />
            <Route path="tools/:slug" element={<ToolView />} />
            <Route path="files" element={<Files />} />
            <Route path="llcs" element={<PermRoute permission="llcs"><LLCs /></PermRoute>} />
            <Route path="llcs/:id" element={<PermRoute permission="llcs"><LLCDetail /></PermRoute>} />
            <Route path="chickens" element={<PermRoute permission="chickens"><Chickens /></PermRoute>} />
            <Route path="chickens/:id" element={<PermRoute permission="chickens"><FlockDetail /></PermRoute>} />
            <Route path="chickens/incubator-guide" element={<PermRoute permission="chickens"><ChickenIncubatorGuide /></PermRoute>} />
            <Route path="documents" element={<PermRoute permission="documents"><Documents /></PermRoute>} />
            <Route path="deals" element={<PermRoute permission="deals"><Deals /></PermRoute>} />
            <Route path="deals/search-criteria" element={<PermRoute permission="deals"><DealsSearchCriteria /></PermRoute>} />
            <Route path="happy-cuts" element={<AdminRoute><HappyCuts /></AdminRoute>} />
            <Route path="happy-cuts/client/:id" element={<AdminRoute><HappyCutsClientDetail /></AdminRoute>} />
            <Route path="happy-cuts/guide" element={<AdminRoute><HappyCutsGuide /></AdminRoute>} />
            <Route path="notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
            <Route
              path="admin"
              element={
                <AdminRoute>
                  <Navigate to="/admin/users" replace />
                </AdminRoute>
              }
            />
            <Route
              path="admin/users"
              element={
                <AdminRoute>
                  <AdminUsers />
                </AdminRoute>
              }
            />
            <Route
              path="admin/logs"
              element={
                <AdminRoute>
                  <AdminLogs />
                </AdminRoute>
              }
            />
            <Route
              path="admin/content"
              element={
                <AdminRoute>
                  <AdminContent />
                </AdminRoute>
              }
            />
          </Route>
          <Route path="maintenance-request" element={<MaintenanceSubmit />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
