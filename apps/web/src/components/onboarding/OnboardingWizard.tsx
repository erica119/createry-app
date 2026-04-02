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

const STEPS = ['Family Size', 'Dietary Restrictions', 'Weekly Schedule', 'Grocery Schedule', 'Meal Preferences']

export default function OnboardingWizard({ user, tenantId, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍽️</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', color: 'var(--espresso)', margin: '0 0 0.25rem' }}>
            Let's set up your kitchen
          </h1>
          <p style={{ color: 'var(--text-light)', margin: 0, fontSize: '0.95rem' }}>
            Step {currentStep + 1} of {STEPS.length} — {STEPS[currentStep]}
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ background: 'var(--color-border)', borderRadius: '4px', height: '6px', marginBottom: '2rem', overflow: 'hidden' }}>
          <div style={{
            background: 'var(--color-primary)',
            height: '6px',
            width: `${((currentStep + 1) / STEPS.length) * 100}%`,
            transition: 'width 0.4s ease',
            borderRadius: '4px'
          }} />
        </div>

        {/* Step dots */}
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

        {/* Card */}
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
        </div>

      </div>
    </div>
  )
}
