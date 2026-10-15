import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Ticket, Menu, X } from 'lucide-react'

export function Navbar({ user, onSignIn, onRegister, onSignOut }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path)) return true
    return false
  }

  return (
    <>
      <nav className="nav">
        <Link to="/" className="brand" onClick={() => setMobileMenuOpen(false)}>
          <span className="brand-mark"><Ticket size={18} /></span>
          CampusTix
        </Link>
        <div className="nav-links">
          <Link
            to="/"
            className={isActive('/') ? 'active' : ''}
          >
            Discover
          </Link>
          <Link
            to="/bookings"
            className={isActive('/bookings') ? 'active' : ''}
            onClick={() => {
              if (!user) onSignIn()
            }}
          >
            My bookings
          </Link>
          <Link
            to="/organizers"
            className={isActive('/organizers') ? 'active' : ''}
          >
            For organizers
          </Link>
        </div>
        <div className="nav-actions">
          {user ? (
            <>
              <span className="signed-in">Hi, {user.full_name}</span>
              <button className="text-btn" onClick={onSignOut}>Log out</button>
            </>
          ) : (
            <>
              <button className="text-btn" onClick={onSignIn}>Log in</button>
              <button className="primary" onClick={onRegister}>Create account</button>
            </>
          )}
          <button
            className="icon-button mobile-menu-btn"
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="mobile-nav-drawer" role="menu">
          <Link
            to="/"
            className={isActive('/') ? 'active' : ''}
            onClick={() => setMobileMenuOpen(false)}
          >
            Discover
          </Link>
          <Link
            to="/bookings"
            className={isActive('/bookings') ? 'active' : ''}
            onClick={() => {
              if (!user) onSignIn()
              setMobileMenuOpen(false)
            }}
          >
            My bookings
          </Link>
          <Link
            to="/organizers"
            className={isActive('/organizers') ? 'active' : ''}
            onClick={() => setMobileMenuOpen(false)}
          >
            For organizers
          </Link>
          <div className="mobile-nav-auth">
            {user ? (
              <button
                className="danger-btn full"
                onClick={() => {
                  onSignOut()
                  setMobileMenuOpen(false)
                }}
              >
                Log out
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <button
                  className="secondary-btn full"
                  onClick={() => {
                    onSignIn()
                    setMobileMenuOpen(false)
                  }}
                >
                  Log in
                </button>
                <button
                  className="primary full"
                  onClick={() => {
                    onRegister()
                    setMobileMenuOpen(false)
                  }}
                >
                  Create account
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
