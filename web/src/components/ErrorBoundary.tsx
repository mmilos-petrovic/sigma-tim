import { Component, type ErrorInfo, type ReactNode } from 'react'
import { isChunkLoadError, reloadForNewVersion } from '../lib/staleVersion'
import { reportError } from '../monitoring'
import { LoadingScreen } from './Status'

interface State {
  failed: boolean
  /** The error is a screen that could not be loaded after a new version was published: the page is being loaded again. */
  reloading: boolean
}

/**
 * Last line of defence: a rendering bug shows a message instead of a white page. A screen that cannot be loaded because
 * the page is older than the latest version is not a bug: the page is loaded again, and the person sees "loading".
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, reloading: false }

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, reloading: isChunkLoadError(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      // not now, if the page was loaded again a moment ago and it did not help: then it is an error like the others
      if (reloadForNewVersion()) return
      this.setState({ reloading: false })
    }
    console.error(error, info.componentStack)
    reportError(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    if (this.state.reloading) return <LoadingScreen />
    return (
      <main className="screen">
        <div className="screen__card" role="alert">
          <h1>Došlo je do greške</h1>
          <p>
            Nešto nije u redu sa aplikacijom. Osvežite stranicu; ako se greška ponovi, javite nam.
          </p>
          <div className="actions">
            <button type="button" className="button" onClick={() => window.location.reload()}>
              Osveži stranicu
            </button>
          </div>
        </div>
      </main>
    )
  }
}
