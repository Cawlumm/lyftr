import { AppText } from '../ui'

// The "Your exercises" / "From the catalog" headings over an exercise list (the library and the
// picker). Inset like the rows below it, so the heading lines up with their names.
export function ExerciseGroupHeading({ children }: { children: string }) {
  return (
    <AppText variant="label" color="muted" className="mb-1 mt-2 px-3 uppercase" headingLevel={2}>
      {children}
    </AppText>
  )
}
