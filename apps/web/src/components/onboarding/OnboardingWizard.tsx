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

  if (loading) return <p>Loading...</p>

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ color: '#666', marginBottom: '0.5rem' }}>
          Step {currentStep + 1} of {STEPS.length}: <strong>{STEPS[currentStep]}</strong>
        </p>
        <div style={{ background: '#eee', borderRadius: '4px', height: '8px' }}>
          <div style={{ background: '#4f46e5', borderRadius: '4px', height: '8px', width: `${((currentStep + 1) / STEPS.length) * 100}%`, transition: 'width 0.3s ease' }} />
        </div>
      </div>

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
  )
}
