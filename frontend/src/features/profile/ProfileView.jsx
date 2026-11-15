import { useState } from 'react'
import { User, Lock, Mail, Shield, CheckCircle2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '../../services/api'

function errorMessage(error, fallback) {
  return error.response?.data?.detail || error.message || fallback
}

export function ProfileView({ user, onNotify }) {
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [savingName, setSavingName] = useState(false)
  const [nameSuccess, setNameSuccess] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const queryClient = useQueryClient()

  const handleUpdateName = async (e) => {
    e.preventDefault()
    setNameSuccess('')
    setSavingName(true)
    try {
      const updated = await authApi.updateProfile({ full_name: fullName })
      queryClient.setQueryData(['account'], updated)
      setNameSuccess('Your name was successfully updated!')
      onNotify('Profile name updated!')
    } catch (err) {
      alert(errorMessage(err, 'Failed to update name.'))
    } finally {
      setSavingName(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }

    if (newPassword.length < 10) {
      setPasswordError('New password must be at least 10 characters long.')
      return
    }

    setSavingPassword(true)
    try {
      await authApi.updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      })
      setPasswordSuccess('Password changed successfully!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onNotify('Your password has been changed.')
    } catch (err) {
      setPasswordError(errorMessage(err, 'Failed to change password.'))
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="profile-page">
      <div className="section-top" style={{ marginBottom: '28px' }}>
        <div>
          <div className="eyebrow" style={{ color: '#5b4ce2' }}>Account Settings</div>
          <h2 className="section-title">Personal Details</h2>
          <p className="section-copy">Manage your campus account information and security preferences.</p>
        </div>
      </div>

      <div className="profile-grid">
        {/* Left Column: Account Overview Card */}
        <div className="profile-card profile-summary-card">
          <div className="profile-avatar">
            <User size={36} color="#5b4ce2" />
          </div>
          <h3>{user?.full_name}</h3>
          <p className="muted" style={{ margin: '4px 0 16px' }}>{user?.email}</p>

          <div className="profile-badge-list">
            <div className="profile-badge-item">
              <Shield size={16} color="#5b4ce2" />
              <span>Role: <strong>{user?.role}</strong></span>
            </div>
            <div className="profile-badge-item">
              <Mail size={16} color="#16794c" />
              <span>Status: <strong style={{ color: '#16794c' }}>Verified Account</strong></span>
            </div>
          </div>
        </div>

        {/* Right Column: Forms */}
        <div className="profile-forms">
          {/* Form 1: Update Name */}
          <form className="profile-card" onSubmit={handleUpdateName}>
            <div className="profile-card-header">
              <User size={18} color="#5b4ce2" />
              <h4>Personal Information</h4>
            </div>

            {nameSuccess && (
              <p className="form-message form-message-success" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> {nameSuccess}
              </p>
            )}

            <label className="profile-label">
              Full Name
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                minLength="2"
                maxLength="120"
                required
                className="profile-input"
              />
            </label>

            <label className="profile-label">
              Registered Email (Read-Only)
              <input
                value={user?.email || ''}
                disabled
                className="profile-input disabled"
                title="Email cannot be changed after verification"
              />
            </label>

            <button className="primary" type="submit" disabled={savingName || fullName === user?.full_name}>
              {savingName ? 'Saving…' : 'Save Changes'}
            </button>
          </form>

          {/* Form 2: Change Password */}
          <form className="profile-card" onSubmit={handleChangePassword}>
            <div className="profile-card-header">
              <Lock size={18} color="#5b4ce2" />
              <h4>Change Password</h4>
            </div>

            {passwordError && <p className="form-message">{passwordError}</p>}
            {passwordSuccess && (
              <p className="form-message form-message-success" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> {passwordSuccess}
              </p>
            )}

            <label className="profile-label">
              Current Password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                placeholder="Enter existing password"
                className="profile-input"
              />
            </label>

            <label className="profile-label">
              New Password (min 10 characters)
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength="10"
                required
                placeholder="Enter new secure password"
                className="profile-input"
              />
            </label>

            <label className="profile-label">
              Confirm New Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength="10"
                required
                placeholder="Re-enter new password"
                className="profile-input"
              />
            </label>

            <button className="secondary-btn" type="submit" disabled={savingPassword || !currentPassword || !newPassword}>
              {savingPassword ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}