import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import RecipeForm from './components/recipes/RecipeForm'
import WeeklyMenuView from './components/menu/WeeklyMenuView'
import ShoppingList from './components/shopping/ShoppingList'

const TEST_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TEST_FAMILY_ID = 'ba4aa7d6-b1ac-44b6-9706-15aadccd8aa3'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [onboardingComplete, setOnboardingComplete] = useState(false)
  const [showRecipeForm, setShowRecipeForm] = useState(false)
  const [recipes, setRecipes] = useState<any[]>([])
  const [generatingMenu, setGeneratingMenu] = useState(false)
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [view, setView] = useState<'dashboard' | 'menu' | 'shopping'>('dashboard')

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
      fetchCurrentMenu()
    }
  }

  const fetchRecipes = async () => {
    const { data } = await supabase.from('recipes').select('*').eq('tenant_id', TEST_TENANT_ID).order('created_at', { ascending: false })
    if (data) setRecipes(data)
  }

  const fetchCurrentMenu = async () => {
    const { data } = await supabase
      .from('weekly_menus')
      .select('id')
      .eq('family_id', TEST_FAMILY_ID)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.id) setCurrentMenuId(data.id)
  }

  const generateMenu = async () => {
    setGeneratingMenu(true)
    setMenuError(null)
    try {
      const weekStartDate = new Date()
      const day = weekStartDate.getDay()
      weekStartDate.setDate(weekStartDate.getDate() - day)
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
          body: JSON.stringify({ family_id: TEST_FAMILY_ID, tenant_id: TEST_TENANT_ID, week_start_date: weekStr }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generation failed')
      setCurrentMenuId(result.menu.id)
      setView('menu')
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

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--color-bg)' }}>
      <p className="text-muted">Loading...</p>
    </div>
  )

  // Login screen
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🍽️</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--color-text)', marginBottom: '0.5rem' }}>
              Your Kitchen,<br /><em>Planned.</em>
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '1.05rem', lineHeight: '1.7' }}>
              Personalized weekly meal plans built from recipes you love. Shopping lists ready to go.
            </p>
          </div>
          <div className="card" style={{ padding: '2rem' }}>
            <button onClick={signInWithGoogle} className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', fontSize: '1rem' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: '0.5rem' }}>
                <path fill="#fff" d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z"/>
                <path fill="#fff" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                <path fill="#fff" d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9.008 9.008 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z"/>
                <path fill="#fff" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z"/>
              </svg>
              Continue with Google
            </button>
            <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
              Free to get started. No credit card required.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Onboarding
  if (!onboardingComplete) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
        <nav className="nav">
          <span className="nav-brand">🍽️ Plate</span>
          <button onClick={signOut} className="btn btn-ghost btn-sm" style={{ color: 'rgba(253,246,238,0.7)', borderColor: 'rgba(253,246,238,0.2)' }}>Sign out</button>
        </nav>
        <OnboardingWizard user={user} tenantId={TEST_TENANT_ID} onComplete={() => { setOnboardingComplete(true); fetchRecipes(); fetchCurrentMenu() }} />
      </div>
    )
  }

  // Recipe form
  if (showRecipeForm) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
        <nav className="nav">
          <span className="nav-brand">🍽️ Plate</span>
          <button onClick={() => setShowRecipeForm(false)} className="btn btn-ghost btn-sm" style={{ color: 'rgba(253,246,238,0.7)', borderColor: 'rgba(253,246,238,0.2)' }}>← Back</button>
        </nav>
        <RecipeForm user={user} tenantId={TEST_TENANT_ID} onSaved={() => { setShowRecipeForm(false); fetchRecipes() }} onCancel={() => setShowRecipeForm(false)} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Nav */}
      <nav className="nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span className="nav-brand">🍽️ Plate</span>
          <div className="nav-links">
            <button className={`nav-link ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Recipes</button>
            <button className={`nav-link ${view === 'menu' ? 'active' : ''} ${!currentMenuId ? 'disabled' : ''}`} onClick={() => currentMenuId && setView('menu')} disabled={!currentMenuId}>This Week</button>
            <button className={`nav-link ${view === 'shopping' ? 'active' : ''} ${!currentMenuId ? 'disabled' : ''}`} onClick={() => currentMenuId && setView('shopping')} disabled={!currentMenuId}>Shopping</button>
          </div>
        </div>
        <div className="nav-right">
          <span className="nav-email">{user.email}</span>
          <button onClick={signOut} className="btn btn-ghost btn-sm" style={{ color: 'rgba(253,246,238,0.7)', borderColor: 'rgba(253,246,238,0.2)' }}>Sign out</button>
        </div>
      </nav>

      <div className="page">
        {/* Menu View */}
        {view === 'menu' && currentMenuId && (
          <WeeklyMenuView menuId={currentMenuId} tenantId={TEST_TENANT_ID} onApproved={() => fetchCurrentMenu()} />
        )}

        {/* Shopping View */}
        {view === 'shopping' && currentMenuId && (
          <ShoppingList menuId={currentMenuId} familyId={TEST_FAMILY_ID} tenantId={TEST_TENANT_ID} />
        )}

        {/* Dashboard */}
        {view === 'dashboard' && (
          <>
            {/* Menu Generation Card */}
            <div className="card-warm" style={{ padding: '1.75rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ marginBottom: '0.25rem' }}>This Week's Menu</h2>
                <p className="text-small text-muted" style={{ margin: 0 }}>
                  {currentMenuId ? "Your meal plan is ready." : "Generate a personalized weekly meal plan."}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button onClick={generateMenu} disabled={generatingMenu} className="btn btn-primary">
                  {generatingMenu ? '⏳ Generating...' : currentMenuId ? '↺ Regenerate' : '✨ Generate Menu'}
                </button>
                {currentMenuId && (
                  <>
                    <button onClick={() => setView('menu')} className="btn btn-secondary">View Menu →</button>
                    <button onClick={() => setView('shopping')} className="btn btn-success">🛒 Shopping List</button>
                  </>
                )}
              </div>
              {menuError && <p className="text-error text-small" style={{ width: '100%', margin: 0 }}>{menuError}</p>}
            </div>

            {/* Recipes */}
            <div className="section-header">
              <h2>My Recipes <span className="text-muted text-small" style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}>({recipes.length})</span></h2>
              <button onClick={() => setShowRecipeForm(true)} className="btn btn-primary btn-sm">+ Add Recipe</button>
            </div>

            {recipes.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🥘</div>
                <h3>No recipes yet</h3>
                <p>Add your first recipe to get started with meal planning.</p>
                <button onClick={() => setShowRecipeForm(true)} className="btn btn-primary mt-2">Add Your First Recipe</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {recipes.map(recipe => (
                  <div key={recipe.id} className="card" style={{ padding: '1.25rem', transition: 'box-shadow 0.15s, transform 0.15s', cursor: 'default' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                      <h3 style={{ fontSize: '1rem', flex: 1, paddingRight: '0.5rem' }}>{recipe.title}</h3>
                      <span className="tag tag-muted" style={{ flexShrink: 0 }}>{recipe.complexity}</span>
                    </div>
                    {recipe.description && <p style={{ fontSize: '0.85rem', margin: '0 0 0.75rem', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>{recipe.description}</p>}
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                      {recipe.prep_time_minutes && <span>⏱ {recipe.prep_time_minutes}m prep</span>}
                      {recipe.cook_time_minutes && <span>🔥 {recipe.cook_time_minutes}m cook</span>}
                      {recipe.servings && <span>🍽 {recipe.servings} servings</span>}
                    </div>
                    {recipe.cuisine_tags?.length > 0 && (
                      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {recipe.cuisine_tags.slice(0, 3).map((tag: string) => (
                          <span key={tag} className="tag tag-primary">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
