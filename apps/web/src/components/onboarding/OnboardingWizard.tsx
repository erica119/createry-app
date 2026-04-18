import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'
import StepFamilySize from './StepFamilySize'
import StepDietaryConstraints from './StepDietaryConstraints'
import StepWeeklySchedule from './StepWeeklySchedule'
import StepGrocerySchedule from './StepGrocerySchedule'
import StepMealPreferences from './StepMealPreferences'

interface Props {
  user: User
  tenantId: string
  onComplete: () => void
  brandName?: string
  brandColor?: string
}

const STEPS = ['Family Size', 'Dietary Restrictions', 'Weekly Schedule', 'Grocery Schedule', 'Meal Preferences', 'AI Disclosure']

export default function OnboardingWizard({ user, tenantId, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiConsented, setAiConsented] = useState(false)
  const [aiConsentError, setAiConsentError] = useState(false)

  useEffect(() => {
    const fetchFamily = async () => {
      const { data } = await supabase
        .from('family_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (data?.id) setFamilyId(data.id)
      setLoading(false)
    }
    fetchFamily()
  }, [user.id])

  const handleAiConsent = async () => {
    if (!aiConsented) {
      setAiConsentError(true)
      return
    }
    if (familyId) {
      await supabase.from('family_profiles').update({
        ai_consent_acknowledged_at: new Date().toISOString(),
      }).eq('id', familyId)
    }
    const { error: upsertError } = await supabase.from('user_profiles').insert({
      user_id: user.id,
      tenant_id: tenantId,
      role: 'user',
      ai_consent_acknowledged_at: new Date().toISOString(),
    })
    if (upsertError) console.error('user_profiles insert error:', upsertError)
    onComplete()
  }

  const handleNext = (newFamilyId?: string) => {
    if (newFamilyId && typeof newFamilyId === 'string') setFamilyId(newFamilyId)
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      onComplete()
    }
  }

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: '560px' }}>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍽️</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', color: 'var(--espresso)', margin: '0 0 0.25rem' }}>
            Let's set up your kitchen
          </h1>
          <p style={{ color: 'var(--text-light)', margin: 0, fontSize: '0.95rem' }}>
            Step {currentStep + 1} of {STEPS.length} — {STEPS[currentStep]}
          </p>
        </div>

        <div style={{ background: 'var(--color-border)', borderRadius: '4px', height: '6px', marginBottom: '2rem', overflow: 'hidden' }}>
          <div style={{
            background: 'var(--color-primary)',
            height: '6px',
            width: `${((currentStep + 1) / STEPS.length) * 100}%`,
            transition: 'width 0.4s ease',
            borderRadius: '4px'
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === currentStep ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: i <= currentStep ? 'var(--color-primary)' : 'var(--color-border)',
              transition: 'all 0.3s ease'
            }} />
          ))}
        </div>

        <div className="card onboarding-card" style={{ padding: '2rem' }}>
          {currentStep === 0 && (
            <StepFamilySize user={user} tenantId={tenantId} familyId={familyId} onNext={(id: string) => handleNext(id)} />
          )}
          {currentStep === 1 && familyId && (
            <StepDietaryConstraints familyId={familyId} tenantId={tenantId} onNext={() => handleNext()} onBack={handleBack} />
          )}
          {currentStep === 2 && familyId && (
            <StepWeeklySchedule familyId={familyId} tenantId={tenantId} onNext={() => handleNext()} onBack={handleBack} />
          )}
          {currentStep === 3 && familyId && (
            <StepGrocerySchedule familyId={familyId} tenantId={tenantId} onNext={() => handleNext()} onBack={handleBack} />
          )}
          {currentStep === 4 && familyId && (
            <StepMealPreferences familyId={familyId} tenantId={tenantId} onNext={() => handleNext()} onBack={handleBack} />
          )}
          {currentStep === 5 && (
            <div>
              <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '1rem' }}>&#10022;</div>
              <h2 style={{ fontFamily: 'var(--font-serif)', color: 'var(--espresso)', textAlign: 'center', margin: '0 0 0.5rem', fontSize: '1.4rem' }}>How your meal plans are made</h2>
              <p style={{ color: 'var(--text-light)', textAlign: 'center', margin: '0 0 1.5rem', fontSize: '0.9rem', lineHeight: 1.6 }}>Before we generate your first plan, here is what you should know.</p>
              <div style={{ background: '#FDF6EE', borderRadius: '12px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  "Your family dietary needs and preferences are used to filter and select from the recipe library",
                  "An AI system builds a personalized weekly plan from that filtered set",
                  "Your personal information stays within Plate systems and is not sent to external AI services",
                  "You can regenerate, swap, or modify any meal at any time",
                  "AI-generated plans are not medical or nutritional advice",
                ].map((point, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.875rem', color: '#4A3728', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '1px' }}>&#10003;</span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: aiConsentError ? '0.5rem' : '1.5rem' }}>
                <input
                  type="checkbox"
                  id="ai-consent"
                  checked={aiConsented}
                  onChange={e => { setAiConsented(e.target.checked); setAiConsentError(false) }}
                  style={{ marginTop: '2px', flexShrink: 0, width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                />
                <label htmlFor="ai-consent" style={{ fontSize: '0.82rem', color: '#4A3728', lineHeight: 1.5, cursor: 'pointer' }}>
                  I understand that Plate uses AI to generate my weekly meal plans based on my household preferences, and that this is not a substitute for professional dietary or medical advice.
                </label>
              </div>
              {aiConsentError && (
                <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 1rem' }}>Please check the box above to continue.</p>
              )}
              <button
                onClick={handleAiConsent}
                style={{ width: '100%', background: 'var(--color-primary)', color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              >
                Got it - show me my first plan
              </button>
              <button onClick={handleBack} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-light)', padding: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.25rem' }}>
                Back
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
