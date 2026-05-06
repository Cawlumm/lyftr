import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './stores/auth'
import { useSettingsStore } from './stores/settings'
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

  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings()
    } else {
      resetSettings()
    }
  }, [isAuthenticated])

  return (
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
  )
}

export default App
