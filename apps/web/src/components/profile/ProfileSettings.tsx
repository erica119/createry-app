import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import StepDietaryConstraints from '../onboarding/StepDietaryConstraints'
import StepMealPreferences from '../onboarding/StepMealPreferences'
import StepWeeklySchedule from '../onboarding/StepWeeklySchedule'
import StepFamilySize from '../onboarding/StepFamilySize'
import FamilyMembers from '../FamilyMembers'

interface Props {
  user: User
  familyId: string
  tenantId: string
}

type Section = 'overview' | 'family' | 'dietary' | 'schedule' | 'preferences' | 'members'

export default function ProfileSettings({ user, familyId, tenantId }: Props) {
  const [section, setSection] = useState<Section>('overview')
  const [saved, setSaved] = useState(false)

  const handleSaved = () => {
    setSaved(true)
    setTimeout(() => { setSaved(false); setSection('overview') }, 1500)
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
      {section !== 'overview' && section !== 'members' && (
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
