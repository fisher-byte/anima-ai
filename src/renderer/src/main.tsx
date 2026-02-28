import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Error boundary for debugging - 使用 Tailwind 样式
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App error:', error, errorInfo)
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-600 bg-red-50 min-h-screen flex flex-col items-center justify-center">
          <h2 className="text-xl font-bold mb-4">应用加载出错</h2>
          <pre className="text-sm bg-white p-4 rounded-lg shadow max-w-2xl overflow-auto">{this.state.error?.message}</pre>
          <p className="mt-4 text-sm text-red-500">请刷新页面或重启应用</p>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
