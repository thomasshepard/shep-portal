import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './hooks/useAuth'
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
import AdminUsers from './pages/admin/AdminUsers'
import AdminLogs from './pages/admin/AdminLogs'
import AdminContent from './pages/admin/AdminContent'
import MaintenanceSubmit from './pages/MaintenanceSubmit'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
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
            <Route path="properties" element={<PermRoute permission="properties"><Properties /></PermRoute>} />
            <Route path="properties/:id" element={<PermRoute permission="properties"><PropertyDetail /></PermRoute>} />
            <Route path="tools" element={<Tools />} />
            <Route path="tools/:slug" element={<ToolView />} />
            <Route path="files" element={<Files />} />
            <Route path="llcs" element={<PermRoute permission="llcs"><LLCs /></PermRoute>} />
            <Route path="llcs/:id" element={<PermRoute permission="llcs"><LLCDetail /></PermRoute>} />
            <Route path="chickens" element={<PermRoute permission="chickens"><Chickens /></PermRoute>} />
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
