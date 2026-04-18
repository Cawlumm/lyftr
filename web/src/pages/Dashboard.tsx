import { format } from 'date-fns'

export default function Dashboard() {

  // Mock data for now (before backend is ready)
  const mockWorkouts = [
    { id: 1, name: 'Push Day', duration: '2 hours', timestamp: '2 hours ago' },
    { id: 2, name: 'Cardio', duration: '45 min', timestamp: '1 day ago' },
  ]

  const mockStats = {
    weight: 185,
    weightTrend: -2,
    calories: 1850,
    caloriesTarget: 2000,
    protein: 140,
    proteinTarget: 150,
    carbs: 180,
    carbsTarget: 250,
    fat: 60,
    fatTarget: 65,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-600 mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Weight Card */}
        <div className="card">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-600 text-sm font-medium">Current Weight</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{mockStats.weight} lbs</p>
            </div>
            <div className={`text-sm font-medium ${mockStats.weightTrend < 0 ? 'text-success' : 'text-warning'}`}>
              {mockStats.weightTrend < 0 ? '↓' : '↑'} {Math.abs(mockStats.weightTrend)} lbs
            </div>
          </div>
          <button className="text-primary text-sm font-medium hover:underline">
            + Add weight
          </button>
        </div>

        {/* Macros Card */}
        <div className="card">
          <p className="text-slate-600 text-sm font-medium mb-4">Today's Macros</p>
          <div className="space-y-3">
            {/* Protein */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700">Protein</span>
                <span className="font-medium">{mockStats.protein}g / {mockStats.proteinTarget}g</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${(mockStats.protein / mockStats.proteinTarget) * 100}%` }}
                />
              </div>
            </div>

            {/* Carbs */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700">Carbs</span>
                <span className="font-medium">{mockStats.carbs}g / {mockStats.carbsTarget}g</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500"
                  style={{ width: `${(mockStats.carbs / mockStats.carbsTarget) * 100}%` }}
                />
              </div>
            </div>

            {/* Fat */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700">Fat</span>
                <span className="font-medium">{mockStats.fat}g / {mockStats.fatTarget}g</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500"
                  style={{ width: `${(mockStats.fat / mockStats.fatTarget) * 100}%` }}
                />
              </div>
            </div>

            {/* Total Calories */}
            <div className="pt-2 border-t border-slate-200">
              <div className="flex justify-between text-sm font-medium">
                <span>Total Calories</span>
                <span>{mockStats.calories} / {mockStats.caloriesTarget}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <button className="btn-primary py-3">
          💪 Log Workout
        </button>
        <button className="btn-primary py-3">
          🍽️ Log Meal
        </button>
      </div>

      {/* Recent Workouts */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-900">Recent Workouts</h3>
          <a href="/workouts" className="text-primary text-sm font-medium hover:underline">
            View all
          </a>
        </div>
        <div className="space-y-3">
          {mockWorkouts.map((workout) => (
            <div key={workout.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900">{workout.name}</p>
                <p className="text-sm text-slate-600">{workout.duration}</p>
              </div>
              <p className="text-sm text-slate-500">{workout.timestamp}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
