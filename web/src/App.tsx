import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useAuthStore } from './stores/auth'
import { useSettingsStore } from './stores/settings'
import { useWorkoutSession } from './stores/workoutSession'
import { Toast } from './components/ui'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Workouts from './pages/Workouts'
import Programs from './pages/Programs'
import ActiveWorkout from './pages/ActiveWorkout'
import StartWorkout from './pages/StartWorkout'
import WorkoutExercisePicker from './pages/WorkoutExercisePicker'
import ExerciseDetail from './pages/ExerciseDetail'
import AddProgram from './pages/AddProgram'
import EditProgram from './pages/EditProgram'
import AddWorkout from './pages/AddWorkout'
import EditWorkout from './pages/EditWorkout'
import WorkoutDetail from './pages/WorkoutDetail'
import ProgramDetail from './pages/ProgramDetail'
import Food from './pages/Food'
import LogFood from './pages/LogFood'
import Weight from './pages/Weight'
import WeightDetail from './pages/WeightDetail'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Register from './pages/Register'

function App() {
  const { isAuthenticated } = useAuthStore()
  const { fetch: fetchSettings, reset: resetSettings } = useSettingsStore()
  const { gymOpen, gymPhase } = useWorkoutSession()
  // Same condition Layout.tsx uses to show the floating RestTimerBanner — it shares
  // this exact fixed bottom-24 slot, so PWA toasts must yield to it instead of
  // rendering on top.
  const restBannerShowing = gymOpen && gymPhase !== 'exercise'

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // update() rejects when the update-check fetch fails — expected whenever this
      // runs offline or on flaky gym wifi, which is the primary use case for this
      // feature, not an edge case. Swallow it; a failed check just means no update
      // was found this time, no need to log or surface anything.
      const checkForUpdate = () => { registration.update().catch(() => {}) }
      // Poll for a fresh sw.js hourly so long-lived tabs still get prompted.
      setInterval(checkForUpdate, 60 * 60 * 1000)
      // Also check on refocus — most "long-lived tab" cases are actually a
      // backgrounded tab, so this catches an update far sooner than the poll.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
    },
  })

  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings()
    } else {
      resetSettings()
    }
  }, [isAuthenticated])

  return (
    <>
      {needRefresh && !restBannerShowing && (
        <Toast
          variant="brand"
          icon={RefreshCw}
          title="Update available"
          description="Tap to reload with the latest version"
          onClick={() => updateServiceWorker(true)}
          onDismiss={() => setNeedRefresh(false)}
          autoDismissMs={0}
        />
      )}
      {/* Suppressed once needRefresh fires: both toasts share the same fixed
          bottom-24 slot, and the persistent, actionable "Update available" toast
          must win over the auto-dismissing "ready offline" confirmation. */}
      {offlineReady && !needRefresh && !restBannerShowing && (
        <Toast
          variant="success"
          icon={WifiOff}
          title="Ready to work offline"
          onDismiss={() => setOfflineReady(false)}
        />
      )}
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={isAuthenticated ? <Navigate to="/" /> : <Register />} />

          {/* Protected routes */}
          {isAuthenticated ? (
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/workouts" element={<Workouts />} />
              <Route path="/workouts/new" element={<AddWorkout />} />
              <Route path="/workouts/:id" element={<WorkoutDetail />} />
              <Route path="/workouts/:id/edit" element={<EditWorkout />} />
              <Route path="/programs" element={<Programs />} />
              <Route path="/programs/new" element={<AddProgram />} />
              <Route path="/programs/:id" element={<ProgramDetail />} />
              <Route path="/programs/:id/edit" element={<EditProgram />} />
              <Route path="/workout/start" element={<StartWorkout />} />
              <Route path="/workout/active" element={<ActiveWorkout />} />
              <Route path="/workout/active/add-exercise" element={<WorkoutExercisePicker />} />
              <Route path="/workout/active/exercise/:exerciseId" element={<ExerciseDetail />} />
              <Route path="/exercises/:exerciseId" element={<ExerciseDetail />} />
              <Route path="/food" element={<Food />} />
              <Route path="/food/log" element={<LogFood />} />
              <Route path="/weight" element={<Weight />} />
              <Route path="/weight/:id" element={<WeightDetail />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          ) : (
            <Route path="*" element={<Navigate to="/login" />} />
          )}
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
