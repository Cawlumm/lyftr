export interface User {
  id: number
  email: string
  created_at: string
}

export interface Workout {
  id: number
  date: string
  exercises: WorkoutExercise[]
  created_at: string
}

export interface WorkoutExercise {
  id: number
  exercise_id: number
  name: string
  sets: Set[]
  notes?: string
}

export interface Set {
  reps: number
  weight: number
}

export interface Exercise {
  id: number
  name: string
  category: 'push' | 'pull' | 'legs' | 'cardio' | 'other'
  equipment?: string
  muscle_groups: string[]
}

export interface FoodLog {
  id: number
  date: string
  food_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  quantity: number
  unit: string
}

export interface Weight {
  id: number
  date: string
  value: number
}

export interface DailyStats {
  date: string
  weight?: number
  calories: number
  protein: number
  carbs: number
  fat: number
  workouts: number
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  user: User
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  password_confirm: string
}
