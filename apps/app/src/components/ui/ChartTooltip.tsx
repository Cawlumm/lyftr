export interface ChartTooltipProps {
  /** The chart's accessible name. */
  label: string
  /** Each point's anchor in the chart's own pixels; the tooltip sits above it. */
  points: readonly { x: number; y: number }[]
  width: number
  height: number
  /** The point under (x, y), or null for none. Defaults to the point nearest along x. */
  hitTest?: (x: number, y: number) => number | null
  /** What point i says, one line each, already in the reader's notation. */
  describe: (i: number) => string[]
  selected: number | null
  onSelect: (i: number | null) => void
  /** False when the chart already shows the selection itself (the donut's hole). */
  tooltip?: boolean
}

// Native reads a chart by tapping its points, through each chart's own hit targets; hover and
// arrow keys are web's. The web version is ChartTooltip.web.tsx.
export function ChartTooltip(_: ChartTooltipProps) {
  return null
}
