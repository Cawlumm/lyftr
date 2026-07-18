// Domain types — ported verbatim from web/src/types.ts. Shared by web + mobile.
export interface User {
  id: number
  email: string
  created_at: string
  updated_at?: string
}

export interface UserSettings {
  user_id: number
  weight_unit: 'lbs' | 'kg'
  calorie_target: number
  protein_target: number
  carb_target: number
  fat_target: number
  workout_layout?: 'list' | 'gym'
  // Client-only (device storage, not persisted server-side):
  rest_enabled?: boolean        // master rest-timer on/off
  rest_seconds_default?: number // default rest seconds, seeds new exercises
}

export interface Exercise {
  id: number
  name: string
  muscle_group: string
  secondary_muscles: string[]
  category: string
  equipment: string
  description: string
  image_url?: string
  video_url?: string
}

export interface Set {
  id?: number
  set_number: number
  reps: number
  weight: number
  duration?: number
  distance?: number
  rpe?: number
  is_warmup?: boolean
}

export interface WorkoutExercise {
  id?: number
  workout_id?: number
  exercise_id: number
  order_index?: number
  notes?: string
  exercise: Exercise
  rest_seconds?: number
  sets: Set[]
}

export interface Workout {
  id: number
  user_id?: number
  name: string
  notes?: string
  duration: number
  started_at: string
  created_at: string
  exercises: WorkoutExercise[]
  // Present on the create response when finishing auto-progressed routine targets (#40).
  progression?: ProgressionResult
}

// Summary of staged routine suggestions, used for the finish toast (#40).
export interface ProgressionResult {
  program_id: number
  program_name: string
  count: number
  is_pr?: boolean
}

export interface WeightLog {
  id: number
  user_id?: number
  weight: number
  notes?: string
  logged_at: string
  created_at?: string
}

export interface FoodLog {
  id: number
  user_id?: number
  name: string
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snacks'
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  servings: number
  serving_size?: string
  barcode?: string
  image_url?: string
  logged_at: string
  created_at?: string
}

export interface DailyStats {
  date: string
  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
  total_fiber: number
  workout_count: number
}

export interface FoodSearchResult {
  name: string
  brand?: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  serving_size: string
  image_url?: string
  source: 'off' | 'saved' | 'manual'
}

export interface SavedFood {
  id: number
  name: string
  brand?: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  serving_size: string
  barcode?: string
}

export interface FoodHistoryPoint {
  date: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface WeightStats {
  latest: number
  starting: number
  min: number
  max: number
  avg: number
  total_entries: number
  change_7d: number
  change_30d: number
}

export interface ProgramSet {
  id?: number
  set_number: number
  target_reps: number
  target_weight: number
  // Pending auto-progression suggestion (#40) — present when the last workout beat
  // this set's target. The user approves it on the routine (copies into target_*).
  suggested_reps?: number
  suggested_weight?: number
  suggested_is_pr?: boolean
}

export interface ProgramExercise {
  id?: number
  exercise_id: number
  order_index?: number
  notes?: string
  exercise: Exercise
  rest_seconds?: number
  sets: ProgramSet[]
}

export interface Program {
  id: number
  name: string
  notes?: string
  created_at: string
  exercises: ProgramExercise[]
}

export interface ActiveSessionSet {
  set_number: number
  target_reps: number
  target_weight: number
  actual_reps: number
  actual_weight: number
  completed: boolean
  // Links back to the routine's ProgramSet so finishing can auto-progress that
  // target (issue #40). Absent for freestyle sessions and ad-hoc added sets.
  program_set_id?: number
}

export interface ActiveSessionExercise {
  exercise_id: number
  exercise: Exercise
  notes: string
  rest_seconds?: number
  sets: ActiveSessionSet[]
}

export interface ActiveSession {
  program_id?: number
  name: string
  started_at: string
  exercises: ActiveSessionExercise[]
  device_id?: string
}

export interface AuthResponse {
  token: string
  refresh_token: string
  user: User
}

export interface PersonalRecord {
  weight: number
  reps: number
  estimated_1rm: number
  date: string
  workout_id: number
}

export interface ExerciseHistoryPoint {
  date: string
  max_weight: number
  total_volume: number
  sets_count: number
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
}
