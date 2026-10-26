import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Last line of defence: a rendering bug shows a message instead of a white page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
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
