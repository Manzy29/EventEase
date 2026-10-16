import { useState } from 'react'
import { X } from 'lucide-react'
import { authApi } from '../../services/api'

function errorMessage(error, fallback) {
  return error.response?.data?.detail || error.message || fallback
}

export function AuthModal({ initialMode = 'login', initialEmail = '', onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setMessage('')
    setIsSuccess(false)
    setSubmitting(true)
    try {
      if (mode === 'login') {
        const user = await authApi.login(email, password)
        onAuthenticated(user)
        onClose()
      } else if (mode === 'register') {
        const result = await authApi.register(name, email, password)
        setIsSuccess(true)
        setMessage(`${result.message} Enter your 6-digit code below:`)
        setMode('verify')
      } else if (mode === 'verify') {
        const result = await authApi.verifyEmail(email, code)
        setIsSuccess(true)
        setMessage(`${result.message} Redirecting to login…`)
        setTimeout(() => {
          setMode('login')
          setMessage('Email verified! Please enter your password to sign in.')
        }, 1500)
      }
    } catch (error) {
      setIsSuccess(false)
      setMessage(errorMessage(error, 'Unable to complete that request.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : 'Verify email'}>
      <form className="auth-modal" onSubmit={submit}>
        <button className="icon-button auth-close" type="button" onClick={onClose} aria-label="Close">
          <X />
        </button>
        <div className="eyebrow auth-eyebrow">CampusTix account</div>
        <h2>{mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Verify your email'}</h2>
        <p className="muted">
          {mode === 'login'
            ? 'Sign in to hold and reserve seats.'
            : mode === 'register'
            ? 'Your email must be verified before you can reserve seats.'
            : 'Enter the 6-digit verification code sent to your email.'}
        </p>
        {mode === 'register' && (
          <label>
            Full name
            <input value={name} onChange={(event) => setName(event.target.value)} minLength="2" maxLength="120" required autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        </label>
        {mode !== 'verify' && (
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={mode === 'register' ? 10 : 1}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
        )}
        {mode === 'verify' && (
          <label>
            6-digit verification code
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              pattern="\d{6}"
              maxLength="6"
              placeholder="123456"
              required
              style={{ letterSpacing: '4px', fontSize: '1.2rem', textAlign: 'center' }}
              autoComplete="one-time-code"
            />
          </label>
        )}
        {message && (
          <p className={`form-message ${isSuccess ? 'form-message-success' : ''}`} role="status">
            {message}
          </p>
        )}
        <button className="primary full" disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : 'Verify email'}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
          {mode === 'login' && (
            <>
              <button
                className="text-btn auth-switch"
                type="button"
                onClick={() => {
                  setMode('register')
                  setMessage('')
                }}
              >
                Need an account? Create one
              </button>
              <button
                className="text-btn auth-switch"
                type="button"
                onClick={() => {
                  setMode('verify')
                  setMessage('')
                }}
              >
                Have a code to verify? Verify email
              </button>
            </>
          )}
          {mode === 'register' && (
            <button
              className="text-btn auth-switch"
              type="button"
              onClick={() => {
                setMode('login')
                setMessage('')
              }}
            >
              Already have an account? Log in
            </button>
          )}
          {mode === 'verify' && (
            <button
              className="text-btn auth-switch"
              type="button"
              onClick={() => {
                setMode('login')
                setMessage('')
              }}
            >
              Back to Log in
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
