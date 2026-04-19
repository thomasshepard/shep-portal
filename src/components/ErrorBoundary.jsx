import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || 'Unknown error'
      const stack = this.state.error?.stack || ''
      const componentStack = this.state.info?.componentStack || ''

      return (
        <div style={{
          padding: '24px',
          fontFamily: 'monospace',
          fontSize: '13px',
          backgroundColor: '#fff',
          minHeight: '100vh',
          boxSizing: 'border-box',
        }}>
          <div style={{
            backgroundColor: '#fee2e2',
            border: '2px solid #ef4444',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#991b1b', marginBottom: '8px' }}>
              ⚠️ App Crashed
            </div>
            <div style={{ color: '#7f1d1d', wordBreak: 'break-word' }}>
              {message}
            </div>
          </div>

          <div style={{
            backgroundColor: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '12px',
            overflowX: 'auto',
          }}>
            <div style={{ fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
              Stack Trace:
            </div>
            <pre style={{ margin: 0, fontSize: '11px', color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {stack}
            </pre>
          </div>

          <div style={{
            backgroundColor: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '12px',
            overflowX: 'auto',
          }}>
            <div style={{ fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
              Component Stack:
            </div>
            <pre style={{ margin: 0, fontSize: '11px', color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {componentStack}
            </pre>
          </div>

          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px',
              padding: '10px 20px',
              backgroundColor: '#0f172a',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
