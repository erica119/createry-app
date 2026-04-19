import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import StepDietaryConstraints from '../onboarding/StepDietaryConstraints'
import StepMealPreferences from '../onboarding/StepMealPreferences'
import StepWeeklySchedule from '../onboarding/StepWeeklySchedule'
import StepFamilySize from '../onboarding/StepFamilySize'
import FamilyMembers from '../FamilyMembers'
import { supabase } from '../../lib/supabase'

async function deleteAccount(): Promise<{ error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    }
  )
  const result = await response.json()
  if (!response.ok) return { error: result.error || 'Failed to delete account' }
  return {}
}

interface Props {
  user: User
  familyId: string
  tenantId: string
  isCreator?: boolean
}

type Section = 'overview' | 'family' | 'dietary' | 'schedule' | 'preferences' | 'members' | 'notifications'

export default function ProfileSettings({ user, familyId, tenantId, isCreator = false }: Props) {
  const [section, setSection] = useState<Section>('overview')
  const [saved, setSaved] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushError, setPushError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const VAPID_PUBLIC_KEY = 'BN0xS6vCnCqTvPOFvPJpJL4paVaQkaSEKOfjRiK7QoKsvDC1psctCWD3nWPXbGWyOaa8qp3ND_XqQNGs0vYQqNc'

  useEffect(() => {
    setPushSupported('serviceWorker' in navigator && 'PushManager' in window)
    checkPushStatus()
  }, [])

  async function checkPushStatus() {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    setPushEnabled(!!sub)
  }

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
    return outputArray
  }

  async function enablePush() {
    setPushLoading(true)
    setPushError('')
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushError('Permission denied. Please enable notifications in your browser settings.')
        setPushLoading(false)
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-push-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ subscription: sub.toJSON(), tenant_id: tenantId }),
        }
      )
      if (!response.ok) throw new Error('Failed to save subscription')
      setPushEnabled(true)
    } catch (err: any) {
      setPushError(err.message || 'Something went wrong.')
    }
    setPushLoading(false)
  }

  async function disablePush() {
    setPushLoading(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      if (reg) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
      }
      setPushEnabled(false)
    } catch (err: any) {
      setPushError(err.message)
    }
    setPushLoading(false)
  }

  const handleSaved = () => {
    setSaved(true)
    setTimeout(() => { setSaved(false); setSection('overview') }, 1500)
  }

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    setDeleteError('')
    const { error } = await deleteAccount()
    if (error) {
      setDeleteError(error)
      setDeleteLoading(false)
      return
    }
    // Sign out locally — auth user is already deleted on server
    await supabase.auth.signOut()
  }

  const sectionBtn = (label: string, s: Section, icon: string) => (
    <button onClick={() => setSection(s)} style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '1rem 1.25rem', borderRadius: '12px',
      border: `1.5px solid ${section === s ? 'var(--color-primary)' : '#E8D5B7'}`,
      background: section === s ? 'var(--color-primary-light)' : 'white',
      cursor: 'pointer', width: '100%', textAlign: 'left' as const,
      fontFamily: 'var(--font-sans)', transition: 'all 0.15s ease',
    }}>
      <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      <span style={{ fontWeight: '600', color: '#2C1810', fontSize: '0.95rem' }}>{label}</span>
      <span style={{ marginLeft: 'auto', color: '#C8BAB2' }}>→</span>
    </button>
  )

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>
          Profile & Settings
        </h2>
        <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>
          Update your family profile and meal planning preferences.
        </p>
      </div>

      {saved && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '0.875rem 1rem', marginBottom: '1rem' }}>
          <p style={{ color: '#16a34a', margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>✅ Changes saved!</p>
        </div>
      )}

      {section === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sectionBtn('Family Size', 'family', '👨‍👩‍👧')}
          {sectionBtn('Family Members', 'members', '👨‍👩‍👧‍👦')}
          {sectionBtn('Dietary Restrictions', 'dietary', '🥗')}
          {sectionBtn('Weekly Schedule', 'schedule', '📅')}
          {sectionBtn('Meal Preferences', 'preferences', '❤️')}
          {sectionBtn('Notifications', 'notifications', '🔔')}
          {isCreator && (
            <a
              href="https://billing.stripe.com/p/login/aFa9AU7GkaUJbPr7VM1RC00"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1.5px solid #E8D5B7', borderRadius: '12px', padding: '1rem 1.25rem', textDecoration: 'none', color: '#2C1810', fontFamily: 'var(--font-sans)', fontWeight: '600', fontSize: '1rem' }}
            >
              <span>💳 Manage Plan and Billing</span>
              <span style={{ color: '#9B8B82' }}>→</span>
            </a>
          )}

          {/* Delete Account */}
          {!isCreator && (
          <>
          {!showDeleteConfirm ? (
            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.85rem', cursor: 'pointer', padding: '0.5rem 0', fontFamily: 'var(--font-sans)', fontWeight: '500', textDecoration: 'underline' }}
              >
                Delete my account
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '1rem', background: '#FFF5F5', border: '1.5px solid #FCA5A5', borderRadius: '12px', padding: '1.25rem 1.5rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#991B1B', fontFamily: 'var(--font-serif)', fontSize: '1rem' }}>Delete your account?</h4>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#4A3728', lineHeight: 1.6 }}>
                This will permanently delete your account and all associated data including your family profile, meal plans, shopping lists, and preferences. This action cannot be undone.
              </p>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#6B5C52' }}>
                Type <strong>DELETE</strong> to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                style={{ width: '100%', padding: '0.65rem 1rem', fontSize: '0.95rem', borderRadius: '8px', border: '1.5px solid #FCA5A5', background: 'white', color: '#2C1810', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const, marginBottom: '1rem' }}
              />
              {deleteError && (
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#dc2626', fontWeight: '500' }}>{deleteError}</p>
              )}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deleteLoading}
                  style={{ background: deleteConfirmText === 'DELETE' ? '#dc2626' : '#E8D5B7', color: 'white', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '600', cursor: deleteConfirmText === 'DELETE' && !deleteLoading ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', opacity: deleteLoading ? 0.7 : 1 }}
                >
                  {deleteLoading ? 'Deleting...' : 'Delete my account'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError('') }}
                  style={{ background: 'white', color: '#6B5C52', border: '1.5px solid #E8D5B7', padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          </>
          )}

          <div style={{ marginTop: '1.5rem', background: '#FDF6EE', borderRadius: '12px', padding: '1.25rem 1.5rem', border: '1px solid #E8D5B7' }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: '600', color: '#9B8B82', textTransform: 'uppercase', letterSpacing: '0.05em' }}>About AI Meal Planning</p>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#4A3728', lineHeight: 1.6 }}>
              Your weekly meal plans are generated by Plate's AI system. The AI selects from recipes in your library, filtered by your household dietary constraints and preferences. Meal plans are suggestions — you can always swap, regenerate, or skip any meal.
            </p>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#4A3728', lineHeight: 1.6 }}>
              Your personal information is not shared with external AI providers as part of meal plan generation.
            </p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#9B8B82', fontStyle: 'italic' }}>
              AI-generated content is not medical or nutritional advice.
            </p>
          </div>
        </div>
      )}

      {section === 'members' && (
        <div>
          <button onClick={() => setSection('overview')}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', padding: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            ← Back
          </button>
          <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 1rem', fontSize: '1.15rem' }}>
            Family Members
          </h3>
          <p style={{ color: '#6B5C52', fontSize: '0.85rem', marginBottom: '1.25rem', marginTop: '-0.5rem' }}>
            Add individual members so Claude can personalize meals for everyone.
          </p>
          <FamilyMembers familyId={familyId} tenantId={tenantId} />
        </div>
      )}
      {section === 'notifications' && (
        <div>
          <button onClick={() => setSection('overview')}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', padding: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            ← Back
          </button>
          <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem', fontSize: '1.15rem' }}>
            Notifications
          </h3>
          <p style={{ color: '#6B5C52', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Get notified every Sunday when your weekly meal plan is ready.
          </p>
          {!pushSupported ? (
            <div style={{ background: '#FFF5F5', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '1rem 1.25rem', fontSize: '0.875rem', color: '#991B1B' }}>
              Push notifications are not supported in this browser.
            </div>
          ) : (
            <div style={{ background: 'white', border: '1.5px solid #E8D5B7', borderRadius: '12px', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <div style={{ fontWeight: '700', color: '#2C1810', fontSize: '0.95rem' }}>Weekly menu notifications</div>
                  <div style={{ color: '#6B5C52', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    {pushEnabled ? 'You will be notified every Sunday morning.' : 'Off - tap to enable.'}
                  </div>
                </div>
                <button
                  onClick={pushEnabled ? disablePush : enablePush}
                  disabled={pushLoading}
                  style={{
                    flexShrink: 0,
                    padding: '0.55rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: pushEnabled ? '#F5EFE6' : 'var(--color-primary)',
                    color: pushEnabled ? '#6B5C52' : 'white',
                    fontWeight: '600',
                    fontSize: '0.875rem',
                    cursor: pushLoading ? 'not-allowed' : 'pointer',
                    opacity: pushLoading ? 0.7 : 1,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {pushLoading ? '...' : pushEnabled ? 'Turn Off' : 'Turn On'}
                </button>
              </div>
              {pushError && (
                <div style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: '500' }}>{pushError}</div>
              )}
              {pushEnabled && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#16a34a', fontWeight: '600' }}>
                  ✅ Notifications enabled
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {section !== 'overview' && section !== 'members' && section !== 'notifications' && (
        <div>
          <button onClick={() => setSection('overview')}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', padding: '0 0 1rem', fontFamily: 'var(--font-sans)' }}>
            ← Back to Settings
          </button>

          {section === 'family' && (
            <StepFamilySize
              user={user}
              tenantId={tenantId}
              familyId={familyId}
              onNext={handleSaved}
            />
          )}

          {section === 'dietary' && (
            <StepDietaryConstraints
              familyId={familyId}
              tenantId={tenantId}
              onNext={handleSaved}
              onBack={() => setSection('overview')}
            />
          )}

          {section === 'schedule' && (
            <StepWeeklySchedule
              familyId={familyId}
              tenantId={tenantId}
              onNext={handleSaved}
              onBack={() => setSection('overview')}
            />
          )}

          {section === 'preferences' && (
            <StepMealPreferences
              familyId={familyId}
              tenantId={tenantId}
              onNext={handleSaved}
              onBack={() => setSection('overview')}
            />
          )}
        </div>
      )}
    </div>
  )
}
