import { Component, type ReactNode } from 'react'
import ErrorState from './ui/ErrorState'

// The last net under a PR whose whole subject is that a failure must be visible.
//
// Everything else here catches failures we ANTICIPATED — a rejected promise, a 502, a
// list page that never arrived. A render that throws is the one we did not, and React's
// answer to an uncaught throw is to unmount the entire tree: a white screen, no nav, no
// way back except a manual reload, which is the least visible failure the app can have.
// Found by feeding the workout list a row whose started_at would not parse — one bad row
// out of ten took down the page, and React logged the standard "Consider adding an error
// boundary" warning because there was not one anywhere in the codebase.
//
// This does not excuse a crash: the underlying bug still gets fixed. It bounds the damage
// to the region that threw, so an unknown future throw costs a section instead of the app.
interface Props {
  children: ReactNode
  /** What was on screen, so the copy can say it: "Couldn't show your workouts". */
  subject?: string
  /** page inside a route, section around a widget — same rule as ErrorState. */
  size?: 'page' | 'section'
}

interface State {
  failed: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // Keep the stack in the console: the boundary hides the crash from the user, and
    // a crash nobody can see in development is worse than the white screen was.
    console.error('Unhandled render error:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <ErrorState
        size={this.props.size ?? 'page'}
        title={`Couldn't show ${this.props.subject ?? 'this page'}`}
        message="Something went wrong on our side. Try again, and if it keeps happening reload the page."
        // Remounting the subtree is the retry: state that got us into the bad
        // render is thrown away with it.
        onRetry={() => this.setState({ failed: false })}
      />
    )
  }
}
