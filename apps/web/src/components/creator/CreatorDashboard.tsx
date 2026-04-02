import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'
import RecipeForm from '../recipes/RecipeForm'
import OnboardingWizard from '../onboarding/OnboardingWizard'
import WeeklyMenuView from '../menu/WeeklyMenuView'
import ShoppingList from '../shopping/ShoppingList'
import RecipeImport from '../recipes/RecipeImport'
import RecipeModal from '../recipes/RecipeModal'

interface Props {
  user: User
  tenantId: string
  onSignOut: () => void
}

interface Tenant {
  id: string
  brand_name: string
  subdomain: string
  tagline: string
  primary_color: string
  logo_url: string | null
  subscription_status: string
  stripe_account_id: string | null
  stripe_onboarded: boolean
}

export default function CreatorDashboard({ user, tenantId, onSignOut }: Props) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [recipes, setRecipes] = useState<any[]>([])
  const [view, setView] = useState<'overview' | 'recipes' | 'branding' | 'mealplan' | 'packs'>('overview')
  const [showRecipeForm, setShowRecipeForm] = useState(false)
  const [showRecipeImport, setShowRecipeImport] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Branding edit state
  const [editBrandName, setEditBrandName] = useState('')
  const [editTagline, setEditTagline] = useState('')
  const [editColor, setEditColor] = useState('#C4622D')
  const [savingBranding, setSavingBranding] = useState(false)
  const [brandingSaved, setBrandingSaved] = useState(false)
  const [connectingStripe, setConnectingStripe] = useState(false)
  const [stripeError, setStripeError] = useState<string | null>(null)
  const [packs, setPacks] = useState<any[]>([])
  const [showPackForm, setShowPackForm] = useState(false)
  const [newPackName, setNewPackName] = useState('')
  const [newPackDescription, setNewPackDescription] = useState('')
  const [newPackPrice, setNewPackPrice] = useState('')
  const [newPackCsvFile, setNewPackCsvFile] = useState<File | null>(null)
  const [savingPack, setSavingPack] = useState(false)
  const [packSaveError, setPackSaveError] = useState<string | null>(null)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null)
  const [menuView, setMenuView] = useState<'dashboard' | 'menu' | 'shopping'>('dashboard')
  const [generatingMenu, setGeneratingMenu] = useState(false)
  const [menuError, setMenuError] = useState<string | null>(null)

  useEffect(() => {
    fetchTenant()
    fetchRecipes()
    fetchFamilyProfile()
    fetchPacks()
  }, [tenantId])

  useEffect(() => {
    if (!tenant) return
    const color = tenant.primary_color || '#C4622D'
    const hex = color.replace('#', '')
    const r = parseInt(hex.substring(0,2), 16)
    const g = parseInt(hex.substring(2,4), 16)
    const b = parseInt(hex.substring(4,6), 16)
    const dr = Math.max(0, Math.round(r * 0.8))
    const dg = Math.max(0, Math.round(g * 0.8))
    const db = Math.max(0, Math.round(b * 0.8))
    const darkColor = '#' + [dr,dg,db].map(x => x.toString(16).padStart(2,'0')).join('')
    const lightColor = `rgba(${r},${g},${b},0.15)`
    const root = document.documentElement
    root.style.setProperty('--brand-color', color)
    root.style.setProperty('--color-primary', color)
    root.style.setProperty('--color-primary-dark', darkColor)
    root.style.setProperty('--color-primary-light', lightColor)
  }, [tenant])

  const fetchTenant = async () => {
    const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).single()
    if (data) {
      setTenant(data)
      setEditBrandName(data.brand_name || '')
      setEditTagline(data.tagline || '')
      setEditColor(data.primary_color || '#C4622D')
    }
    setLoading(false)
  }

  const fetchRecipes = async () => {
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (data) setRecipes(data)
  }

  const fetchPacks = async () => {
    const { data } = await supabase
      .from('recipe_packs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (data) setPacks(data)
  }

  const fetchFamilyProfile = async () => {
    const { data } = await supabase
      .from('family_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (data?.id) {
      setFamilyId(data.id)
      fetchCurrentMenu(data.id)
    }
  }

  const fetchCurrentMenu = async (fid: string) => {
    const { data } = await supabase
      .from('weekly_menus')
      .select('id')
      .eq('family_id', fid)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.id) setCurrentMenuId(data.id)
  }

  const generateMenu = async () => {
    if (!familyId) return
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
          body: JSON.stringify({ family_id: familyId, tenant_id: tenantId, week_start_date: weekStr }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Generation failed')
      setCurrentMenuId(result.menu.id)
      setMenuView('menu')
    } catch (err: any) {
      setMenuError(err.message)
    } finally {
      setGeneratingMenu(false)
    }
  }

  const saveBranding = async () => {
    setSavingBranding(true)
    const { error } = await supabase.from('tenants').update({
      brand_name: editBrandName,
      tagline: editTagline,
      primary_color: editColor,
      name: editBrandName,
    }).eq('id', tenantId)
    if (!error) {
      setTenant(t => t ? { ...t, brand_name: editBrandName, tagline: editTagline, primary_color: editColor } : t)
      const hex = editColor.replace('#', '')
      const r = parseInt(hex.substring(0,2), 16)
      const g = parseInt(hex.substring(2,4), 16)
      const b = parseInt(hex.substring(4,6), 16)
      const dr = Math.max(0, Math.round(r * 0.8))
      const dg = Math.max(0, Math.round(g * 0.8))
      const db = Math.max(0, Math.round(b * 0.8))
      const darkColor = '#' + [dr,dg,db].map(x => x.toString(16).padStart(2,'0')).join('')
      const lightColor = `rgba(${r},${g},${b},0.15)`
      document.documentElement.style.setProperty('--brand-color', editColor)
      document.documentElement.style.setProperty('--color-primary', editColor)
      document.documentElement.style.setProperty('--color-primary-dark', darkColor)
      document.documentElement.style.setProperty('--color-primary-light', lightColor)
      setBrandingSaved(true)
      setTimeout(() => setBrandingSaved(false), 2000)
    }
    setSavingBranding(false)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#FDF6EE' }}><p>Loading...</p></div>

  if (showRecipeForm) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)' }}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #E8D5B7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2C1810' }}>
          <span style={{ fontFamily: 'var(--font-serif)', color: 'white', fontWeight: '600', fontSize: '1.1rem' }}>🍽️ {tenant?.brand_name || 'Plate'}</span>
          <button onClick={() => setShowRecipeForm(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>← Back</button>
        </div>
        <RecipeForm user={user} tenantId={tenantId} onSaved={() => { setShowRecipeForm(false); fetchRecipes() }} onCancel={() => setShowRecipeForm(false)} />
      </div>
    )
  }

  if (showRecipeImport) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)' }}>
        <RecipeImport user={user} tenantId={tenantId} onComplete={() => { setShowRecipeImport(false); fetchRecipes() }} onCancel={() => setShowRecipeImport(false)} />
      </div>
    )
  }

  const filteredRecipes = recipes.filter(r =>
    r.title.toLowerCase().includes(recipeSearch.toLowerCase()) ||
    r.description?.toLowerCase().includes(recipeSearch.toLowerCase()) ||
    r.cuisine_tags?.some((t: string) => t.toLowerCase().includes(recipeSearch.toLowerCase()))
  )

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem',
    borderRadius: '10px', border: '2px solid #E8D5B7',
    background: '#FDF6EE', color: '#2C1810',
    fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const,
  }

  const color = tenant?.primary_color || '#C4622D'

  return (
    <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FDF6EE' }}>
      {/* Nav */}
      <div style={{ padding: '0 2rem', background: '#2C1810', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-serif)', color: 'white', fontWeight: '600', fontSize: '1.1rem', padding: '1rem 0' }}>
            🍽️ {tenant?.brand_name || 'Plate'} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: '400' }}>Creator</span>
          </span>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {(['overview', 'recipes', 'packs', 'branding', 'mealplan'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontWeight: view === v ? '700' : '400',
                color: view === v ? 'white' : 'rgba(255,255,255,0.7)',
                fontSize: '0.95rem', padding: '0.25rem 0',
                fontFamily: 'var(--font-sans)',
                borderBottom: view === v ? `2px solid ${color}` : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}>{v === 'mealplan' ? 'My Meal Plan' : v === 'packs' ? 'Recipe Packs' : v.charAt(0).toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{user.email}</span>
          <button onClick={onSignOut} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Sign out</button>
        </div>
      </div>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem' }}>

        {/* OVERVIEW */}
        {view === 'overview' && (
          <>
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>
                Welcome back! 👋
              </h2>
              <p style={{ color: '#6B5C52', margin: 0 }}>Here's how your creator account is looking.</p>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
              {[
                { label: 'Recipes', value: recipes.length, icon: '📖' },
                { label: 'Subdomain', value: tenant?.subdomain ? `${tenant.subdomain}.plate.app` : '—', icon: '🌐' },
                { label: 'Status', value: tenant?.subscription_status || '—', icon: '✅' },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #E8D5B7' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2C1810', fontFamily: 'var(--font-serif)' }}>{stat.value}</div>
                  <div style={{ color: '#9B8B82', fontSize: '0.85rem' }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E8D5B7', marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 1rem', fontSize: '1.1rem' }}>Quick actions</h3>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button onClick={() => { setView('recipes'); setShowRecipeImport(true) }} style={{ background: color, color: 'white', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>
                  ⬆ Import Recipes
                </button>
                <button onClick={() => { setView('recipes'); setShowRecipeForm(true) }} style={{ background: 'white', color, border: `1.5px solid ${color}`, padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>
                  + Add Recipe
                </button>
                <button onClick={() => setView('branding')} style={{ background: 'white', color: '#6B5C52', border: '1.5px solid #E8D5B7', padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>
                  🎨 Edit Branding
                </button>
              </div>
            </div>

            {/* Getting started checklist */}
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E8D5B7' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 1rem', fontSize: '1.1rem' }}>Getting started</h3>
              {[
                { done: !!tenant?.brand_name, label: 'Set up your brand name' },
                { done: recipes.length > 0, label: 'Add your first recipe' },
                { done: recipes.length >= 10, label: 'Add at least 10 recipes' },
                { done: !!tenant?.primary_color && tenant.primary_color !== '#C4622D', label: 'Customize your brand color' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: i < 3 ? '1px solid #F5EFE6' : 'none' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: item.done ? '#16a34a' : 'white', border: `2px solid ${item.done ? '#16a34a' : '#E8D5B7'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {item.done && <span style={{ color: 'white', fontSize: '0.7rem', fontWeight: '700' }}>✓</span>}
                  </div>
                  <span style={{ color: item.done ? '#9B8B82' : '#2C1810', fontSize: '0.9rem', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* RECIPES */}
        {view === 'recipes' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', margin: 0, color: '#2C1810', fontSize: '1.5rem' }}>
                Recipes <span style={{ color: '#9B8B82', fontSize: '1rem', fontFamily: 'var(--font-sans)', fontWeight: '400' }}>({recipes.length})</span>
              </h2>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => setShowRecipeImport(true)} style={{ background: 'white', color, border: `1.5px solid ${color}`, padding: '0.6rem 1.1rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>⬆ Import CSV</button>
                <button onClick={() => setShowRecipeForm(true)} style={{ background: color, color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>+ Add Recipe</button>
              </div>
            </div>
            <input type="text" placeholder="🔍 Search recipes..." value={recipeSearch} onChange={e => setRecipeSearch(e.target.value)}
              style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #E8D5B7', background: '#FDF6EE', color: '#2C1810', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', maxHeight: '65vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {filteredRecipes.map(recipe => (
                <div key={recipe.id} onClick={() => setSelectedRecipe(recipe)} style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E8D5B7', boxShadow: '0 1px 4px rgba(44,24,16,0.06)', cursor: 'pointer' }}>
                  {recipe.image_url && <img src={recipe.image_url} alt={recipe.title} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />}
                  <div style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', color: '#2C1810', fontWeight: '600', lineHeight: 1.3 }}>{recipe.title}</h3>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', background: '#F5EFE6', color, padding: '0.2rem 0.5rem', borderRadius: '20px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{recipe.complexity}</span>
                        <button onClick={async (e) => { e.stopPropagation(); if (confirm('Delete this recipe?')) { await supabase.from('recipes').delete().eq('id', recipe.id); fetchRecipes() } }} style={{ background: 'none', border: 'none', color: '#C8BAB2', cursor: 'pointer', fontSize: '1rem', padding: '0.1rem', lineHeight: 1 }}>✕</button>
                      </div>
                    </div>
                    {recipe.description && <p style={{ color: '#6B5C52', margin: '0 0 0.75rem', fontSize: '0.875rem', lineHeight: 1.5 }}>{recipe.description}</p>}
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: '#9B8B82', flexWrap: 'wrap' }}>
                      {recipe.prep_time_minutes && <span>⏱ {recipe.prep_time_minutes}m prep</span>}
                      {recipe.cook_time_minutes && <span>🔥 {recipe.cook_time_minutes}m cook</span>}
                      {recipe.servings && <span>🍽 {recipe.servings} servings</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* MEAL PLAN */}
        {view === 'mealplan' && (
          <>
            {!familyId ? (
              <div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>My Meal Plan</h2>
                  <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>Set up your family profile to start generating meal plans.</p>
                </div>
                <OnboardingWizard
                  user={user}
                  tenantId={tenantId}
                  onComplete={() => fetchFamilyProfile()}
                />
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '1.5rem', padding: '1.5rem 2rem', background: '#F5EFE6', borderRadius: '16px', border: '1px solid #E8D5B7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-serif)', margin: '0 0 0.25rem', color: '#2C1810', fontSize: '1.4rem' }}>This Week's Menu</h2>
                    <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>
                      {currentMenuId ? 'Your meal plan is ready.' : 'Generate a personalized weekly meal plan.'}
                    </p>
                    {menuError && <p style={{ color: '#dc2626', margin: '0.5rem 0 0', fontSize: '0.85rem' }}>{menuError}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {currentMenuId && (
                      <>
                        <button onClick={() => setMenuView('menu')} style={{ background: 'white', color, border: `1.5px solid ${color}`, padding: '0.6rem 1.1rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>View Menu</button>
                        <button onClick={() => setMenuView('shopping')} style={{ background: 'white', color: '#16a34a', border: '1.5px solid #16a34a', padding: '0.6rem 1.1rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>Shopping List</button>
                      </>
                    )}
                    <button onClick={generateMenu} disabled={generatingMenu} style={{ background: color, color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: generatingMenu ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: generatingMenu ? 0.7 : 1, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
                      {generatingMenu ? 'Generating...' : currentMenuId ? '✨ Regenerate' : '✨ Generate Menu'}
                    </button>
                  </div>
                </div>
                {menuView === 'menu' && currentMenuId && (
                  <WeeklyMenuView menuId={currentMenuId} tenantId={tenantId} onApproved={() => fetchCurrentMenu(familyId!)} onGoShopping={() => setMenuView('shopping')} />
                )}
                {menuView === 'shopping' && currentMenuId && familyId && (
                  <ShoppingList menuId={currentMenuId} familyId={familyId} tenantId={tenantId} />
                )}
              </div>
            )}
          </>
        )}

        {/* PACKS */}
        {view === 'packs' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Recipe Packs</h2>
                <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>Bundle recipes into packs your audience can purchase.</p>
              </div>
              <button onClick={() => setShowPackForm(!showPackForm)} style={{ background: color, color: 'white', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>
                {showPackForm ? '✕ Cancel' : '+ New Pack'}
              </button>
            </div>

            {showPackForm && (
              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #E8D5B7', marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 1.25rem', fontSize: '1.1rem' }}>Create New Pack</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#2C1810', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Pack name</label>
                    <input type="text" value={newPackName} onChange={e => setNewPackName(e.target.value)} placeholder="e.g. Summer Grilling Collection" style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #E8D5B7', background: '#FDF6EE', color: '#2C1810', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#2C1810', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Description</label>
                    <input type="text" value={newPackDescription} onChange={e => setNewPackDescription(e.target.value)} placeholder="What's included in this pack?" style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #E8D5B7', background: '#FDF6EE', color: '#2C1810', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#2C1810', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Price (USD)</label>
                    <input type="number" value={newPackPrice} onChange={e => setNewPackPrice(e.target.value)} placeholder="9.99" min="0.99" step="0.01" style={{ width: '200px', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #E8D5B7', background: '#FDF6EE', color: '#2C1810', fontFamily: 'var(--font-sans)', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#2C1810', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Upload premium recipes (CSV)</label>
                    <p style={{ color: '#6B5C52', fontSize: '0.8rem', margin: '0 0 0.5rem', lineHeight: 1.5 }}>These recipes will be marked as premium and locked until users purchase this pack. Use the same CSV format as regular recipe imports.</p>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={e => setNewPackCsvFile(e.target.files?.[0] || null)}
                      style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.875rem', borderRadius: '10px', border: '2px solid #E8D5B7', background: '#FDF6EE', color: '#2C1810', fontFamily: 'var(--font-sans)', cursor: 'pointer', boxSizing: 'border-box' as const }}
                    />
                    {newPackCsvFile && <p style={{ color: '#16a34a', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>✓ {newPackCsvFile.name} selected</p>}
                  </div>
                  {packSaveError && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0' }}>{packSaveError}</p>}
                  <button
                    onClick={async () => {
                      if (!newPackName.trim() || !newPackPrice) return
                      setSavingPack(true)
                      setPackSaveError(null)
                      try {
                        const priceCents = Math.round(parseFloat(newPackPrice) * 100)
                        const { data: pack, error: packError } = await supabase.from('recipe_packs').insert({
                          tenant_id: tenantId,
                          name: newPackName.trim(),
                          description: newPackDescription.trim() || null,
                          price_cents: priceCents,
                        }).select().single()
                        if (packError) throw new Error(packError.message)

                        if (newPackCsvFile && pack) {
                          const text = await newPackCsvFile.text()
                          const lines = text.trim().split('
')
                          const headers = lines[0].split(',')
                          const rows = lines.slice(1)
                          const recipesToInsert = rows.map(row => {
                            const vals = row.split(',')
                            const get = (key: string) => {
                              const i = headers.indexOf(key)
                              return i >= 0 ? vals[i]?.trim().replace(/^"|"$/g, '') : ''
                            }
                            return {
                              tenant_id: tenantId,
                              title: get('title'),
                              description: get('description') || null,
                              ingredients: get('ingredients') ? get('ingredients').split('|') : [],
                              instructions: get('instructions') || null,
                              prep_time_minutes: get('prep_time_minutes') ? parseInt(get('prep_time_minutes')) : null,
                              cook_time_minutes: get('cook_time_minutes') ? parseInt(get('cook_time_minutes')) : null,
                              servings: get('servings') ? parseInt(get('servings')) : null,
                              cuisine_tags: get('cuisine_tags') ? get('cuisine_tags').split('|') : [],
                              meal_type: get('meal_type') || null,
                              complexity: get('complexity') || 'moderate',
                              is_premium: true,
                              recipe_pack_id: pack.id,
                              is_active: true,
                            }
                          }).filter(r => r.title)
                          if (recipesToInsert.length > 0) {
                            const { error: recipeError } = await supabase.from('recipes').insert(recipesToInsert)
                            if (recipeError) throw new Error(recipeError.message)
                          }
                        }
                        setNewPackName('')
                        setNewPackDescription('')
                        setNewPackPrice('')
                        setNewPackCsvFile(null)
                        setShowPackForm(false)
                        fetchPacks()
                        fetchRecipes()
                      } catch (err: any) {
                        setPackSaveError(err.message)
                      }
                      setSavingPack(false)
                    }}
                    disabled={savingPack || !newPackName.trim() || !newPackPrice}
                    style={{ background: color, color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: savingPack ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: savingPack ? 0.7 : 1 }}
                  >
                    {savingPack ? 'Saving...' : 'Create Pack'}
                  </button>
                </div>
              </div>
            )}

            {packs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: '#F5EFE6', borderRadius: '16px', border: '1px dashed #D4B896' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📦</div>
                <p style={{ color: '#6B5C52', margin: '0 0 1rem' }}>No recipe packs yet. Create your first pack to start monetizing your recipes.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {packs.map(pack => (
                  <div key={pack.id} style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', border: '1px solid #E8D5B7', boxShadow: '0 1px 4px rgba(44,24,16,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', color: '#2C1810', fontWeight: '600' }}>{pack.name}</h3>
                      <span style={{ fontWeight: '700', color, fontSize: '1.1rem', flexShrink: 0, marginLeft: '0.5rem' }}>${(pack.price_cents / 100).toFixed(2)}</span>
                    </div>
                    {pack.description && <p style={{ color: '#6B5C52', margin: '0 0 0.75rem', fontSize: '0.875rem', lineHeight: 1.5 }}>{pack.description}</p>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#9B8B82' }}>👑 Premium pack</span>
                      <button onClick={async () => { if (confirm('Delete this pack?')) { await supabase.from('recipe_packs').delete().eq('id', pack.id); fetchPacks() } }} style={{ background: 'none', border: 'none', color: '#C8BAB2', cursor: 'pointer', fontSize: '0.85rem' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* BRANDING */}
        {view === 'branding' && (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Branding</h2>
              <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>Customize how your app looks to your audience.</p>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', border: '1px solid #E8D5B7', maxWidth: '560px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#2C1810', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Brand name</label>
                  <input type="text" value={editBrandName} onChange={e => setEditBrandName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#2C1810', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Tagline</label>
                  <input type="text" value={editTagline} onChange={e => setEditTagline(e.target.value)} placeholder="e.g. Meal plans made simple" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#2C1810', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Brand color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={{ width: '48px', height: '48px', borderRadius: '10px', border: '2px solid #E8D5B7', cursor: 'pointer', padding: '2px' }} />
                    <span style={{ color: '#2C1810', fontWeight: '500', fontSize: '0.9rem' }}>{editColor}</span>
                  </div>
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', background: editColor, color: 'white', fontWeight: '600', fontSize: '0.875rem', textAlign: 'center' }}>
                    Preview: Button color
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#2C1810', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Your subdomain</label>
                  <div style={{ padding: '0.75rem 1rem', borderRadius: '10px', border: '2px solid #E8D5B7', background: '#F5EFE6', color: '#6B5C52', fontSize: '0.95rem' }}>
                    {tenant?.subdomain}.plate.app
                  </div>
                  <p style={{ color: '#9B8B82', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>Subdomain cannot be changed after setup.</p>
                </div>

                <button onClick={saveBranding} disabled={savingBranding} style={{ background: color, color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: savingBranding ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: savingBranding ? 0.7 : 1 }}>
                  {brandingSaved ? '✓ Saved!' : savingBranding ? 'Saving...' : 'Save branding'}
                </button>

                <div style={{ borderTop: '1px solid #E8D5B7', paddingTop: '1.25rem' }}>
                  <h4 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.5rem', fontSize: '1rem' }}>Stripe Payouts</h4>
                  <p style={{ color: '#6B5C52', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                    {tenant?.stripe_onboarded
                      ? "✅ Your Stripe account is connected. You'll receive payouts automatically."
                      : 'Connect your Stripe account to receive payouts when users purchase your recipe packs.'}
                  </p>
                  {stripeError && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{stripeError}</p>}
                  {!tenant?.stripe_onboarded && (
                    <button
                      onClick={async () => {
                        setConnectingStripe(true)
                        setStripeError(null)
                        try {
                          const response = await fetch(
                            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-connect-onboard`,
                            {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                              },
                              body: JSON.stringify({
                                tenant_id: tenantId,
                                return_url: window.location.href,
                              }),
                            }
                          )
                          const result = await response.json()
                          if (!response.ok) throw new Error(result.error || 'Failed to start Stripe onboarding')
                          window.location.href = result.url
                        } catch (err: any) {
                          setStripeError(err.message)
                          setConnectingStripe(false)
                        }
                      }}
                      disabled={connectingStripe}
                      style={{ background: '#635BFF', color: 'white', border: 'none', padding: '0.875rem 1.5rem', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600', cursor: connectingStripe ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: connectingStripe ? 0.7 : 1 }}
                    >
                      {connectingStripe ? 'Redirecting...' : '💳 Connect Stripe Account'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {selectedRecipe && <RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />}
    </div>
  )
}
