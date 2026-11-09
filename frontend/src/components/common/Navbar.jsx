import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Ticket, Menu, X, User, ChevronDown, UserCog, LogOut, Layers } from 'lucide-react'

export function Navbar({ user, onSignIn, onRegister, onSignOut }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const location = useLocation()

  const isOrganizerOrAdmin = user && (user.role === 'ORGANIZER' || user.role === 'ADMIN')

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path)) return true
    return false
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <>
      <nav className="nav">
        {/* Brand */}
        <Link to="/" className="brand" onClick={() => setMobileMenuOpen(false)}>
          <span className="brand-mark"><Ticket size={18} /></span>
          CampusTix
        </Link>

        {/* Center Links (Profile link removed to keep it clean) */}
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
          {isOrganizerOrAdmin && (
            <Link
              to="/organizers"
              className={isActive('/organizers') ? 'active' : ''}
            >
              For organizers
            </Link>
          )}
        </div>

        {/* Right Actions: Interactive Profile Overlay Button */}
        <div className="nav-actions">
          {user ? (
            <div className="user-menu-wrapper" ref={menuRef}>
              <button
                type="button"
                className={`user-profile-chip ${profileMenuOpen ? 'active' : ''}`}
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                aria-expanded={profileMenuOpen}
                aria-haspopup="true"
              >
                <div className="user-avatar-circle">
                  <User size={15} />
                </div>
                <span className="signed-in-name">Hi, {user.full_name}</span>
                <ChevronDown size={14} className={`chip-chevron ${profileMenuOpen ? 'open' : ''}`} />
              </button>

              {/* Profile Dropdown Overlay */}
              {profileMenuOpen && (
                <div className="user-profile-overlay" role="menu">
                  <div className="overlay-user-info">
                    <strong className="overlay-name">{user.full_name}</strong>
                    <span className="overlay-email">{user.email}</span>
                    <span className="overlay-role-tag">{user.role}</span>
                  </div>

                  <hr className="overlay-divider" />

                  <Link
                    to="/profile"
                    className="overlay-menu-item"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <UserCog size={16} />
                    <span>Personal Details & Profile</span>
                  </Link>

                  <Link
                    to="/bookings"
                    className="overlay-menu-item"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <Ticket size={16} />
                    <span>My Bookings</span>
                  </Link>

                  {isOrganizerOrAdmin && (
                    <Link
                      to="/organizers"
                      className="overlay-menu-item"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      <Layers size={16} />
                      <span>Organizer Dashboard</span>
                    </Link>
                  )}

                  <hr className="overlay-divider" />

                  <button
                    type="button"
                    className="overlay-menu-item overlay-logout-btn"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      onSignOut()
                    }}
                  >
                    <LogOut size={16} />
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <button className="text-btn" onClick={onSignIn}>Log in</button>
              <button className="primary" onClick={onRegister}>Create account</button>
            </>
          )}

          {/* Mobile hamburger button */}
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

      {/* Mobile Drawer */}
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
          {isOrganizerOrAdmin && (
            <Link
              to="/organizers"
              className={isActive('/organizers') ? 'active' : ''}
              onClick={() => setMobileMenuOpen(false)}
            >
              For organizers
            </Link>
          )}
          {user && (
            <Link
              to="/profile"
              className={isActive('/profile') ? 'active' : ''}
              onClick={() => setMobileMenuOpen(false)}
            >
              Personal Details & Profile
            </Link>
          )}
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