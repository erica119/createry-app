import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import RecipeForm from './components/recipes/RecipeForm'

const TEST_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TEST_FAMILY_ID = 'ba4aa7d6-b1ac-44b6-9706-15aadccd8aa3'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [onboardingComplete, setOnboardingComplete] = useState(false)
  const [showRecipeForm, setShowRecipeForm] = useState(false)
  const [recipes, setRecipes] = useState<any[]>([])
  const [generatingMenu, setGeneratingMenu] = useState(false)
  const [menuResult, setMenuResult] = useState<any>(null)
  const [menuError, setMenuError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    checkOnboarding()
  }, [user])

  const checkOnboarding = async () => {
    const { data } = await supabase
      .from('family_profiles')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle()
    if (data?.id) {
      setOnboardingComplete(true)
      fetchRecipes()
    }
  }

  const fetchRecipes = async () => {
    const { data } = await supabase.from('recipes').select('*').eq('tenant_id', TEST_TENANT_ID).order('created_at', { ascending: false })
    if (data) setRecipes(data)
  }

  const generateMenu = async () => {
    setGeneratingMenu(true)
    setMenuError(null)
    setMenuResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const weekStartDate = new Date()
      weekStartDate.setDate(weekStartDate.getDate() - weekStartDate.getDay())
      const weekStr = weekStartDate.toISOString().split('T')[0]

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weekly-menu`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            family_id: TEST_FAMILY_ID,
            tenant_id: TEST_TENANT_ID,
            week_start_date: weekStr,
          }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generation failed')
      setMenuResult(result)
    } catch (err: any) {
      setMenuError(err.message)
    } finally {
      setGeneratingMenu(false)
    }
  }

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setOnboardingComplete(false)
    setRecipes([])
  }

  if (loading) return <p style={{ padding: '2rem' }}>Loading...</p>

  if (!user) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center', marginTop: '4rem' }}>
        <h1>Meal Plan App</h1>
        <p style={{ color: '#666' }}>Sign in to get started</p>
        <button onClick={signInWithGoogle} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.75rem 2rem', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer' }}>
          Sign in with Google
        </button>
      </div>
    )
  }

  if (!onboardingComplete) {
    return (
      <div style={{ fontFamily: 'sans-serif' }}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Meal Plan App</strong>
          <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Sign out</button>
        </div>
        <OnboardingWizard user={user} tenantId={TEST_TENANT_ID} onComplete={() => { setOnboardingComplete(true); fetchRecipes() }} />
      </div>
    )
  }

  if (showRecipeForm) {
    return (
      <div style={{ fontFamily: 'sans-serif' }}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Meal Plan App</strong>
          <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Sign out</button>
        </div>
        <RecipeForm user={user} tenantId={TEST_TENANT_ID} onSaved={() => { setShowRecipeForm(false); fetchRecipes() }} onCancel={() => setShowRecipeForm(false)} />
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Meal Plan App</strong>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ color: '#666', fontSize: '0.9rem' }}>{user.email}</span>
          <button onClick={signOut} style={{ background: 'none', border: '1px solid #ddd', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>Sign out</button>
        </div>
      </div>
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem' }}>

        {/* Generate Menu Section */}
        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #e0d9ff' }}>
          <h2 style={{ margin: '0 0 0.5rem' }}>Weekly Menu</h2>
          <p style={{ color: '#666', margin: '0 0 1rem', fontSize: '0.9rem' }}>Generate a personalized weekly meal plan using your recipes.</p>
          <button
            onClick={generateMenu}
            disabled={generatingMenu}
            style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '6px', fontSize: '0.95rem', cursor: generatingMenu ? 'not-allowed' : 'pointer', opacity: generatingMenu ? 0.7 : 1 }}
          >
            {generatingMenu ? 'Generating... (this may take 10-15 seconds)' : 'Generate This Week\'s Menu'}
          </button>
          {menuError && <p style={{ color: 'red', marginTop: '1rem' }}>{menuError}</p>}
          {menuResult && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ color: 'green', fontWeight: 'bold' }}>Menu generated successfully!</p>
              <pre style={{ background: '#fff', padding: '1rem', borderRadius: '4px', fontSize: '0.8rem', overflow: 'auto' }}>
                {JSON.stringify(menuResult.menu?.menu_data, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Recipes Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>My Recipes ({recipes.length})</h2>
          <button onClick={() => setShowRecipeForm(true)} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '6px', fontSize: '0.95rem', cursor: 'pointer' }}>
            + Add Recipe
          </button>
        </div>
        <div>
          {recipes.map(recipe => (
            <div key={recipe.id} style={{ padding: '1rem', marginBottom: '0.75rem', border: '1px solid #eee', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>{recipe.title}</h3>
                <span style={{ fontSize: '0.8rem', color: '#666', textTransform: 'capitalize' }}>{recipe.complexity}</span>
              </div>
              {recipe.description && <p style={{ color: '#666', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{recipe.description}</p>}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem', color: '#888' }}>
                {recipe.prep_time_minutes && <span>Prep: {recipe.prep_time_minutes}min</span>}
                {recipe.cook_time_minutes && <span>Cook: {recipe.cook_time_minutes}min</span>}
                {recipe.servings && <span>Serves: {recipe.servings}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
