import BrandMark from '../shared/BrandMark'
import './CreatorDashboard.css'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'
import RecipeForm from '../recipes/RecipeForm'
import OnboardingWizard from '../onboarding/OnboardingWizard'
import WeeklyMenuView from '../menu/WeeklyMenuView'
import ShoppingList from '../shopping/ShoppingList'
import RecipeImport from '../recipes/RecipeImport'
import RecipeModal from '../recipes/RecipeModal'
import ProfileSettings from '../profile/ProfileSettings'
import CreatorAnalytics from './CreatorAnalytics'
import SupportModal from '../shared/SupportModal'
import { parseShoppingIngredient, recipeIngredientIssues } from '../../lib/ingredientReadiness'

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

function RecipeCard({ recipe, tenantId, onSelect, onDelete, onImageUpdated, isFavorite, onToggleFavorite }: {
  recipe: any
  color: string
  tenantId: string
  onSelect: () => void
  onDelete: () => void
  onImageUpdated: () => void
  isFavorite?: boolean
  onToggleFavorite?: (recipeId: string) => void
}) {
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const ext = file.name.split('.').pop()
    const path = `${tenantId}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('recipe-images').upload(path, file)
    if (uploadError) { console.error('upload error:', uploadError); setUploadingImage(false); return }
    const { data } = supabase.storage.from('recipe-images').getPublicUrl(path)
    await supabase.from('recipes').update({ image_url: data.publicUrl }).eq('id', recipe.id)
    setUploadingImage(false)
    onImageUpdated()
  }

  return (
    <article className="creator-recipe-card">
      <button className="creator-recipe-preview" onClick={onSelect} aria-label={`View ${recipe.title}`}>
        {recipe.image_url && !imageFailed
          ? <img src={recipe.image_url} alt="" onError={() => setImageFailed(true)} />
          : <span className="creator-recipe-fallback" aria-hidden="true">{recipe.title?.charAt(0) || 'R'}</span>}
      </button>
      <div className="creator-recipe-content">
        <h3><button onClick={onSelect}>{recipe.title}</button></h3>
        {recipe.description && <p>{recipe.description}</p>}
        <div className="creator-recipe-meta">
          {[recipe.prep_time_minutes && `${recipe.prep_time_minutes}m prep`, recipe.cook_time_minutes && `${recipe.cook_time_minutes}m cook`, recipe.servings && `${recipe.servings} servings`].filter(Boolean).join(' · ')}
        </div>
        <div className="creator-recipe-actions">
          <button onClick={onSelect}>View recipe</button>
          <button onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}>{uploadingImage ? 'Uploading…' : 'Photo'}</button>
          <button onClick={() => onToggleFavorite?.(recipe.id)} aria-label={isFavorite ? `Remove ${recipe.title} from favorites` : `Add ${recipe.title} to favorites`}>{isFavorite ? '♥ Saved' : '♡ Save'}</button>
          <button className="delete" onClick={onDelete} aria-label={`Delete ${recipe.title}`}>Delete</button>
        </div>
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
      </div>
    </article>
  )
}

export default function CreatorDashboard({ user, tenantId, onSignOut }: Props) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [recipes, setRecipes] = useState<any[]>([])
  const [view, setView] = useState<'overview' | 'recipes' | 'branding' | 'mealplan' | 'packs' | 'earnings' | 'analytics' | 'shopping' | 'settings' | 'sharing'>('overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoUrl, setLogoUrl] = useState(tenant?.logo_url || '')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [earnings, setEarnings] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [showRecipeForm, setShowRecipeForm] = useState(false)
  const [showRecipeImport, setShowRecipeImport] = useState(false)
  const [creatorFavorites, setCreatorFavorites] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Branding edit state
  const [editBrandName, setEditBrandName] = useState('')
  const [editTagline, setEditTagline] = useState('')
  const [editColor, setEditColor] = useState('#C9471F')
  const [savingBranding, setSavingBranding] = useState(false)
  const [brandingSaved, setBrandingSaved] = useState(false)
  const [connectingStripe, setConnectingStripe] = useState(false)
  const handleStripeConnect = async () => {
    setConnectingStripe(true)
    setStripeError(null)
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-connect-onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ tenant_id: tenantId, return_url: window.location.href })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to start Stripe onboarding')
      window.location.href = result.url
    } catch (err: any) {
      setStripeError(err.message)
      setConnectingStripe(false)
    }
  }
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
  const [menuView, setMenuView] = useState<'dashboard' | 'menu' | 'shopping' | 'settings'>('menu')
  const [generatingMenu, setGeneratingMenu] = useState(false)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [targetWeekDate, setTargetWeekDate] = useState<string | null>(null)
  const [creatorFamilyId, setCreatorFamilyId] = useState<string | null>(null)
  const [creatorMenuId, setCreatorMenuId] = useState<string | null>(null)
  const [creatorMenuData, setCreatorMenuData] = useState<any>(null)
  const [creatorMenuStatus, setCreatorMenuStatus] = useState<string | null>(null)
  const [creatorShoppingStatus, setCreatorShoppingStatus] = useState<string | null>(null)
  const [creatorInstacartLive, setCreatorInstacartLive] = useState(false)
  const [heroSlide, setHeroSlide] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  const [creatorMenuRecipes, setCreatorMenuRecipes] = useState<any[]>([])
  const [homeActiveUsers, setHomeActiveUsers] = useState(0)
  const [homeMenusThisWeek, setHomeMenusThisWeek] = useState(0)
  const [subscription, setSubscription] = useState<any>(null)
  const [subLoading, setSubLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly')
  const [startingCheckout, setStartingCheckout] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)

  useEffect(() => {
    if (view !== 'overview' || heroPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setHeroSlide(current => (current + 1) % 2), 7000)
    return () => window.clearInterval(timer)
  }, [view, heroPaused])

  const fetchSubscription = async () => {
    setSubLoading(true)
    const { data } = await supabase
      .from('creator_subscriptions')
      .select('*')
      .eq('creator_id', user.id)
      .maybeSingle()
    setSubscription(data)
    setSubLoading(false)
  }

  // Handle return from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('subscription') === 'success') {
      // Give webhook a few seconds to fire, then re-fetch
      window.history.replaceState({}, '', window.location.pathname)
      setTimeout(() => fetchSubscription(), 3000)
    }
  }, [])

  const startSubscription = async () => {
    setStartingCheckout(true)
    setSubError(null)
    try {
      const priceId = selectedPlan === 'monthly'
        ? 'price_1TNdqeJzNLT19Phao9z7oH4u'
        : 'price_1TNdwNJzNLT19PhaZF15La1v'
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/creator-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ price_id: priceId, creator_id: user.id, tenant_id: tenantId })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to start checkout')
      window.location.href = result.url
    } catch (err: any) {
      setSubError(err.message)
      setStartingCheckout(false)
    }
  }

  useEffect(() => {
    fetchTenant()
    fetchRecipes()
    fetchFamilyProfile()
    fetchPacks()
    fetchHomeStats()
    fetchCreatorFavorites()
    fetchSubscription()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { fetchEarnings(); fetchPayouts() }
    })
  }, [tenantId])

  useEffect(() => {
    if (!tenant) return
    const color = tenant.primary_color || '#C9471F'
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

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (!user) return
    const fetchCreatorUserData = async () => {
      const { data: fp } = await supabase
        .from('family_profiles')
        .select('id, tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!fp) return
      setCreatorFamilyId(fp.id)
      const { data: menu } = await supabase
        .from('weekly_menus')
        .select('id, menu_data, status')
        .eq('family_id', fp.id)
        .order('week_start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!menu) return
      setCreatorMenuId(menu.id)
      setCreatorMenuData(menu.menu_data)
      setCreatorMenuStatus(menu.status)
      const { data: shopping } = await supabase
        .from('grocery_lists')
        .select('id, status, instacart_cart_url')
        .eq('weekly_menu_id', menu.id)
        .limit(1)
        .maybeSingle()
      setCreatorShoppingStatus(shopping?.status || null)
      try {
        const host = new URL(shopping?.instacart_cart_url || '').hostname
        setCreatorInstacartLive(host === 'instacart.com' || host.endsWith('.instacart.com'))
      } catch { setCreatorInstacartLive(false) }
      if (menu.menu_data?.days) {
        const recipeIds = Object.values(menu.menu_data.days).flatMap((day: any) =>
          ['breakfast', 'lunch', 'dinner'].map((m: string) => day[m]).filter(Boolean)
        )
        if (recipeIds.length > 0) {
          const { data: recipeData } = await supabase
            .from('recipes')
            .select('id, title, image_url, meal_type')
            .in('id', recipeIds)
          if (recipeData) setCreatorMenuRecipes(recipeData)
        }
      }
    }
    fetchCreatorUserData()
  }, [user])

  const fetchTenant = async () => {
    const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).single()
    if (data) {
      setTenant(data)
      setLogoUrl(data.logo_url || '')
      setEditBrandName(data.brand_name || '')
      setEditTagline(data.tagline || '')
      setEditColor(data.primary_color || '#C9471F')
    }
    setLoading(false)
  }

  const fetchCreatorFavorites = async () => {
    const { data } = await supabase.from('recipe_favorites').select('recipe_id').eq('user_id', user.id)
    if (data) setCreatorFavorites(new Set(data.map((f: any) => f.recipe_id)))
  }

  const toggleCreatorFavorite = async (recipeId: string) => {
    if (creatorFavorites.has(recipeId)) {
      await supabase.from('recipe_favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId)
      setCreatorFavorites(prev => { const next = new Set(prev); next.delete(recipeId); return next })
    } else {
      await supabase.from('recipe_favorites').insert({ user_id: user.id, tenant_id: tenantId, recipe_id: recipeId })
      setCreatorFavorites(prev => new Set(prev).add(recipeId))
    }
  }

  const fetchRecipes = async () => {
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (data) setRecipes(data)
  }

  const fetchEarnings = async () => {
    const { data } = await supabase
      .from('user_purchases')
      .select('amount_cents, recipe_pack_id, recipe_packs(name, price_cents)')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
    if (!data) return
    const byPack: Record<string, any> = {}
    for (const p of data) {
      const packId = p.recipe_pack_id
      if (!byPack[packId]) {
        byPack[packId] = {
          pack_name: (p.recipe_packs as any)?.name || 'Unknown',
          units_sold: 0,
          gross_cents: 0,
        }
      }
      byPack[packId].units_sold += 1
      byPack[packId].gross_cents += p.amount_cents
    }
    setEarnings(Object.values(byPack))
  }

  const fetchPayouts = async () => {
    const { data } = await supabase
      .from('creator_payouts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (data) setPayouts(data)
  }

  const fetchPacks = async () => {
    const { data } = await supabase
      .from('recipe_packs')
      .select('*, recipes(count)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (data) setPacks(data)
  }

  const fetchHomeStats = async () => {
    // Get the start of the current week (Sunday)
    const now = new Date()
    const dayOfWeek = now.getDay()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - dayOfWeek)
    weekStart.setHours(0, 0, 0, 0)
    const weekStartStr = weekStart.toISOString().split('T')[0]

    // Creators can see all weekly_menus in their tenant (weekly_menus_creator_select policy)
    const { data: allMenus } = await supabase
      .from('weekly_menus')
      .select('family_id, week_start_date')
      .eq('tenant_id', tenantId)

    if (allMenus) {
      const uniqueUsers = new Set(allMenus.map(m => m.family_id)).size
      const menusThisWeek = allMenus.filter(m => m.week_start_date === weekStartStr).length
      setHomeActiveUsers(uniqueUsers)
      setHomeMenusThisWeek(menusThisWeek)
    }
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
    const now = new Date()
    now.setDate(now.getDate() - now.getDay())
    const weekStart = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
    // Show the current menu, or the nearest upcoming one when this week has none.
    const { data: upcoming } = await supabase.from('weekly_menus')
      .select('id').eq('family_id', fid).gte('week_start_date', weekStart)
      .order('week_start_date', { ascending: true }).limit(1).maybeSingle()
    if (upcoming?.id) { setCurrentMenuId(upcoming.id); return }
    const { data: previous } = await supabase.from('weekly_menus')
      .select('id').eq('family_id', fid).lt('week_start_date', weekStart)
      .order('week_start_date', { ascending: false }).limit(1).maybeSingle()
    setCurrentMenuId(previous?.id || null)
  }

  const generateMenu = async (feedback?: string) => {
    if (!familyId) return
    setGeneratingMenu(true)
    setMenuError(null)
    try {
      let weekStr = targetWeekDate
      if (!weekStr) {
        const weekStartDate = new Date()
        const day = weekStartDate.getDay()
        weekStartDate.setDate(weekStartDate.getDate() - day)
        weekStr = weekStartDate.toISOString().split('T')[0]
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Please sign in again to generate your menu.')
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weekly-menu`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ family_id: familyId, tenant_id: tenantId, week_start_date: weekStr, feedback: feedback || undefined }),
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return }
    setUploadingLogo(true)
    const ext = file.name.split('.').pop()
    const path = `${tenantId}/logo.${ext}`
    const { error: uploadError } = await supabase.storage.from('recipe-images').upload(path, file, { upsert: true })
    if (uploadError) { console.error('logo upload error:', uploadError); setUploadingLogo(false); return }
    const { data } = supabase.storage.from('recipe-images').getPublicUrl(path)
    await supabase.from('tenants').update({ logo_url: data.publicUrl }).eq('id', tenantId)
    const cachedUrl = `${data.publicUrl}?t=${Date.now()}`
    setTenant(t => t ? { ...t, logo_url: cachedUrl } : t)
    setLogoUrl(cachedUrl)
    setUploadingLogo(false)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#FAF3E8' }}><p>Loading...</p></div>

  if (showRecipeForm) {
    return (
      <div style={{ fontFamily: 'var(--font-sans)' }}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #DDCDBB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: tenant?.primary_color || '#C9471F' }}>
          <span style={{ fontFamily: 'var(--font-display)', color: 'white', fontWeight: '600', fontSize: '1.1rem' }}><BrandMark tenant={tenant} onDark creator /></span>
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
    borderRadius: '10px', border: '2px solid #DDCDBB',
    background: '#FAF3E8', color: '#1F3B30',
    fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const,
  }

  const color = tenant?.primary_color || '#C9471F'

  const TAB_LABELS: Record<string, string> = {
    overview: 'Overview', recipes: 'Recipes', packs: 'Recipe Packs', shopping: 'Shopping',
    earnings: 'Earnings', analytics: 'Analytics', branding: 'Branding', mealplan: 'My Meal Plan',
    settings: 'Settings', sharing: 'Share Your App',
  }

  // Subscription loading
  if (subLoading) return (
    <div style={{ minHeight: '100vh', background: '#FAF3E8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#52645A', fontFamily: 'var(--font-sans)' }}>Loading...</p>
    </div>
  )

  // No subscription or pending — show plan selection
  const needsPlan = !subscription || subscription.status === 'pending'
  const isPastDue = subscription?.status === 'past_due'
  const isCancelled = subscription?.status === 'cancelled' || subscription?.status === 'unpaid'

  if (needsPlan) return (
    <div style={{ minHeight: '100vh', background: '#FAF3E8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: '520px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🍽️</div>
          <h1 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', fontSize: '2rem', margin: '0 0 0.5rem' }}>Choose your plan</h1>
          <p style={{ color: '#52645A', margin: 0 }}>Start with a 7-day free trial. Cancel anytime.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          {([
            { plan: 'monthly' as const, label: 'Monthly', price: '$199', period: '/month', savings: null },
            { plan: 'annual' as const, label: 'Annual', price: '$1,999', period: '/year', savings: 'Save $389' },
          ]).map(({ plan, label, price, period, savings }) => (
            <div
              key={plan}
              onClick={() => setSelectedPlan(plan)}
              style={{ background: 'white', borderRadius: '16px', border: selectedPlan === plan ? `2px solid ${color}` : '1px solid #DDCDBB', padding: '1.5rem', cursor: 'pointer', position: 'relative', transition: 'border 0.15s' }}
            >
              {savings && (
                <span style={{ position: 'absolute', top: '-0.75rem', right: '1rem', background: '#16a34a', color: 'white', fontSize: '0.7rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>{savings}</span>
              )}
              <p style={{ margin: '0 0 0.25rem', fontWeight: '700', color: '#1F3B30', fontSize: '1rem' }}>{label}</p>
              <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: color, fontWeight: '700', lineHeight: 1 }}>{price}</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#687A70' }}>{period}</p>
              {selectedPlan === plan && (
                <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', width: '18px', height: '18px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'white', fontSize: '0.65rem' }}>✓</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={startSubscription}
          disabled={startingCheckout}
          style={{ width: '100%', background: color, color: 'white', border: 'none', padding: '1rem', borderRadius: '12px', fontSize: '1rem', fontWeight: '700', cursor: startingCheckout ? 'not-allowed' : 'pointer', opacity: startingCheckout ? 0.7 : 1, fontFamily: 'var(--font-sans)', marginBottom: '0.75rem' }}
        >
          {startingCheckout ? 'Redirecting to checkout...' : 'Start 7-Day Free Trial →'}
        </button>

        {subError && <p style={{ color: '#dc2626', fontSize: '0.875rem', textAlign: 'center', margin: '0.5rem 0' }}>{subError}</p>}

        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#687A70', margin: '0.5rem 0 0' }}>
          Have a promo code? You'll enter it at checkout. No charge during your trial.
        </p>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button onClick={onSignOut} style={{ background: 'none', border: 'none', color: '#687A70', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}>Sign out</button>
        </div>
      </div>
    </div>
  )

  // Past due — soft lock
  if (isPastDue) return (
    <div style={{ minHeight: '100vh', background: '#FAF3E8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.75rem' }}>Payment issue</h2>
        <p style={{ color: '#52645A', marginBottom: '1.5rem' }}>There was a problem with your last payment. Please update your billing info to restore access.</p>
        <a href="https://billing.stripe.com/p/login/aFa9AU7GkaUJbPr7VM1RC00" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', background: color, color: 'white', padding: '0.75rem 2rem', borderRadius: '10px', fontWeight: '600', textDecoration: 'none', fontSize: '0.95rem' }}>
          Update Billing →
        </a>
        <div style={{ marginTop: '1rem' }}>
          <button onClick={onSignOut} style={{ background: 'none', border: 'none', color: '#687A70', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}>Sign out</button>
        </div>
      </div>
    </div>
  )

  // Cancelled — hard lock
  if (isCancelled) return (
    <div style={{ minHeight: '100vh', background: '#FAF3E8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.75rem' }}>Subscription ended</h2>
        <p style={{ color: '#52645A', marginBottom: '1.5rem' }}>Your Createry creator subscription has ended. Reactivate to access your dashboard.</p>
        <button onClick={() => setSubscription(null)} style={{ background: color, color: 'white', border: 'none', padding: '0.75rem 2rem', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '0.95rem', fontFamily: 'var(--font-sans)' }}>
          Reactivate Plan →
        </button>
        <div style={{ marginTop: '1rem' }}>
          <button onClick={onSignOut} style={{ background: 'none', border: 'none', color: '#687A70', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}>Sign out</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="creator-app" style={{ '--creator-accent': color } as React.CSSProperties}>
      {/* Nav */}
      <div ref={menuRef} className="creator-topbar">
        <div className="creator-nav-bar">
          <span className="creator-topbar-brand">
            <BrandMark tenant={tenant} onDark creator />
          </span>
          <div className="creator-topbar-right">
            <span className="nav-greeting">Hi, {tenant?.brand_name || 'Creator'}!</span>
            <button className="creator-signout" onClick={onSignOut}>Sign out</button>
            <button className="creator-menu-toggle" onClick={() => setMenuOpen(o => !o)} aria-label="Open creator navigation" aria-expanded={menuOpen}>☰</button>
          </div>
        </div>
        {menuOpen && (
          <div className="creator-mobile-menu">
            {(['overview', 'mealplan', 'shopping', 'recipes', 'packs', 'earnings', 'analytics', 'branding', 'sharing', 'settings'] as const).map((v, i, arr) => (
              <button key={v} onClick={() => { setView(v); setMenuOpen(false) }} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '0.8rem 1.25rem',
                background: view === v ? '#FAF3E8' : 'white',
                color: view === v ? color : '#1F3B30',
                fontWeight: view === v ? '700' : '400',
                fontSize: '0.95rem', border: 'none',
                borderBottom: i < arr.length - 1 ? '1px solid #F5E8D7' : 'none',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>{TAB_LABELS[v]}</button>
            ))}
          </div>
        )}
      </div>
      <div className="creator-layout">
        <aside className="creator-sidebar" aria-label="Creator navigation">
          <div className="creator-side-label">WORKSPACE</div>
          {(['overview', 'recipes', 'mealplan', 'shopping'] as const).map(v => <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined}>{TAB_LABELS[v]}</button>)}
          <div className="creator-side-label">GROWTH</div>
          {(['packs', 'earnings', 'analytics', 'sharing'] as const).map(v => <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined}>{TAB_LABELS[v]}</button>)}
          <div className="creator-side-label">ACCOUNT</div>
          {(['branding', 'settings'] as const).map(v => <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined}>{TAB_LABELS[v]}</button>)}
          <div className="creator-side-foot"><span>YOUR APP</span><strong>{tenant?.brand_name || 'Createry'}</strong><small>{tenant?.subdomain ? `createry.app/?creator=${tenant.subdomain}` : 'Ready to share'}</small></div>
        </aside>
        <main className="creator-main">

        {/* OVERVIEW */}
        {view === 'overview' && (
          <>
            <section className="creator-welcome" aria-label="Creator updates" onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)} onFocusCapture={() => setHeroPaused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHeroPaused(false) }}>
              <div>
                <span className="eyebrow">{heroSlide === 0 ? 'YOUR CREATOR STUDIO' : 'FROM LIST TO CART'}</span>
                <h1>{heroSlide === 0 ? 'Recipes people come back to.' : creatorInstacartLive ? 'One-Click Instacart Ordering is LIVE!' : 'Your shopping list, ready for Instacart.'}</h1>
                <p>{heroSlide === 0 ? 'Keep your library fresh, see what your audience is cooking, and give them a simple path from dinner idea to weekly plan.' : creatorInstacartLive ? 'Turn a planned week into a shopping list, then open it in Instacart to review products, quantities, and checkout.' : 'Build a shopping list from your weekly menu. Instacart ordering is in preview for this account while production access is finalized.'}</p>
                <button onClick={() => setView(heroSlide === 0 ? 'sharing' : 'shopping')}>{heroSlide === 0 ? 'Share your app ↗' : 'View shopping list ↗'}</button>
              </div>
              <div className="preview-card" aria-hidden="true"><span>{heroSlide === 0 ? 'YOUR APP AT A GLANCE' : 'THE WEEKLY FLOW'}</span><strong>{heroSlide === 0 ? tenant?.brand_name || 'Your kitchen' : 'Plan → List → Shop'}</strong><small>{heroSlide === 0 ? `${recipes.length} recipes ready to plan` : creatorInstacartLive ? 'Review your cart in Instacart' : 'Ordering preview in this account'}</small></div>
              <div className="creator-hero-controls" aria-label="Banner controls">
                {[0, 1].map(index => <button key={index} className={heroSlide === index ? 'active' : ''} onClick={() => setHeroSlide(index)} aria-label={`Show banner ${index + 1}: ${index === 0 ? 'Recipes' : 'Instacart'}`} aria-current={heroSlide === index ? 'true' : undefined} />)}
              </div>
            </section>
            {/* ── Creator's own meal plan status ── */}
            {!creatorMenuId ? (
              <div style={{ background: '#F5E8D7', borderRadius: '16px', border: '1px solid #DDCDBB', padding: '1.75rem 2rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>👩‍🍳</div>
                  <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem', color: '#1F3B30', fontSize: '1.3rem' }}>Let's plan your week</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Generate a meal plan for your own family from your recipe library.</p>
                </div>
                <button onClick={() => setView('mealplan')} style={{ background: color, color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
                  Go to Meal Plan →
                </button>
              </div>
            ) : creatorMenuStatus !== 'approved' ? (
              <div style={{ background: '#FFF9F0', borderRadius: '16px', border: `1.5px solid ${color}`, padding: '1.75rem 2rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>📋</div>
                  <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem', color: '#1F3B30', fontSize: '1.3rem' }}>Your menu is ready to review</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Take a look at this week's meal plan and approve it when ready.</p>
                </div>
                <button onClick={() => setView('mealplan')} style={{ background: color, color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
                  View Menu →
                </button>
              </div>
            ) : !creatorShoppingStatus ? (
              <div style={{ background: '#F0FDF4', borderRadius: '16px', border: '1.5px solid #16a34a', padding: '1.75rem 2rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>🛒</div>
                  <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem', color: '#1F3B30', fontSize: '1.3rem' }}>Time to build your shopping list</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Your menu is approved — head to your meal plan to generate a list.</p>
                </div>
                <button onClick={() => setView('mealplan')} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
                  Shopping List →
                </button>
              </div>
            ) : (
              <div style={{ background: '#F0FDF4', borderRadius: '16px', border: '1px solid #86efac', padding: '1.75rem 2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '1.75rem' }}>✅</span>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.25rem', color: '#1F3B30', fontSize: '1.3rem' }}>You're all set this week!</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Menu approved and shopping list ready. Enjoy your meals.</p>
                </div>
              </div>
            )}

            {/* Tonight's Recipe Hero Card */}
            {creatorMenuData?.days && creatorMenuStatus === 'approved' && (() => {
              const now = new Date()
              const today = now.getDay()
              const hour = now.getHours()
              const todayMeals = (creatorMenuData.days as Record<string, any>)[String(today)]
              if (!todayMeals) return null
              let mealOrder: string[]
              if (hour < 12) mealOrder = ['breakfast', 'lunch', 'dinner']
              else if (hour < 17) mealOrder = ['lunch', 'dinner', 'breakfast']
              else mealOrder = ['dinner', 'lunch', 'breakfast']
              const nextMeal = mealOrder.find(m => todayMeals[m])
              if (!nextMeal) return null
              const recipeId = todayMeals[nextMeal]
              const recipe = creatorMenuRecipes.find((r: any) => r.id === recipeId)
              if (!recipe) return null
              let mealLabel = 'Tonight'
              if (nextMeal === 'breakfast') mealLabel = 'This Morning'
              else if (nextMeal === 'lunch') mealLabel = 'Lunchtime'
              return (
                <div
                  style={{ background: 'white', borderRadius: '16px', border: '1px solid #DDCDBB', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 12px rgba(44,24,16,0.10)', marginBottom: '1.5rem' }}
                  onClick={() => setSelectedRecipe(recipe)}
                >
                  {recipe.image_url && (
                    <img
                      src={recipe.image_url}
                      alt={recipe.title}
                      style={{ width: '100%', height: '200px', objectFit: 'cover' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                  <div style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.2rem 0.75rem', borderRadius: '20px', background: color, color: 'white', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{mealLabel}</span>
                      {recipe.cuisine_tags && (
                        <span style={{ fontSize: '0.75rem', color: '#687A70', fontWeight: '500' }}>{Array.isArray(recipe.cuisine_tags) ? recipe.cuisine_tags[0] : recipe.cuisine_tags}</span>
                      )}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.5rem', color: '#1F3B30', fontSize: '1.3rem', lineHeight: 1.2 }}>{recipe.title}</h3>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      {recipe.cook_time_minutes && (
                        <span style={{ fontSize: '0.8rem', color: '#52645A' }}>🕐 {recipe.cook_time_minutes} min</span>
                      )}
                      {recipe.servings && (
                        <span style={{ fontSize: '0.8rem', color: '#52645A' }}>👥 {recipe.servings} servings</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>
                At a glance
              </h2>
              <p style={{ color: '#52645A', margin: 0 }}>Your creator account today.</p>
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
              {[
                { label: 'Recipes', value: recipes.length, icon: '📖' },
                { label: 'Active Users', value: homeActiveUsers, icon: '👥' },
                { label: 'Menus This Week', value: homeMenusThisWeek, icon: '📅' },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #DDCDBB' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1F3B30', fontFamily: 'var(--font-display)' }}>{stat.value}</div>
                  <div style={{ color: '#687A70', fontSize: '0.85rem' }}>{stat.label}</div>
                </div>
              ))}
            </div>
            {/* Quick actions */}
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #DDCDBB', marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 1rem', fontSize: '1.1rem' }}>Quick actions</h3>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button onClick={() => { setView('recipes'); setShowRecipeImport(true) }} style={{ background: color, color: 'white', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>
                  ⬆ Import Recipes
                </button>
                <button onClick={() => { setView('recipes'); setShowRecipeForm(true) }} style={{ background: 'white', color, border: `1.5px solid ${color}`, padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>
                  + Add Recipe
                </button>
                <button onClick={() => setView('branding')} style={{ background: 'white', color: '#52645A', border: '1.5px solid #DDCDBB', padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>
                  🎨 Edit Branding
                </button>
                <button onClick={() => setView('sharing')} style={{ background: 'white', color: '#52645A', border: '1.5px solid #DDCDBB', padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>
                  📣 Share Your App
                </button>
              </div>
              {subscription && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #F5E8D7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#687A70' }}>
                    Plan: <strong style={{ color: '#1F3B30', textTransform: 'capitalize' }}>{subscription.plan}</strong> · Status: <strong style={{ color: subscription.status === 'active' || subscription.status === 'trialing' ? '#16a34a' : '#dc2626', textTransform: 'capitalize' }}>{subscription.status}</strong>
                  </p>
                  <a href="https://billing.stripe.com/p/login/aFa9AU7GkaUJbPr7VM1RC00" target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '0.8rem', color: color, fontWeight: '600', textDecoration: 'none' }}>
                    Manage Billing →
                  </a>
                </div>
              )}
            </div>

            {/* Getting started checklist */}
            {(() => {
              const checks = [
                { done: !!tenant?.brand_name, label: 'Set up your brand name' },
                { done: recipes.length > 0, label: 'Add your first recipe' },
                { done: recipes.length >= 10, label: 'Add at least 10 recipes' },
                { done: !!tenant?.primary_color && tenant.primary_color !== '#C9471F', label: 'Customize your brand color' },
              ]
              const allDone = checks.every(c => c.done)
              return allDone ? (
                <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #DDCDBB' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.1rem' }}>🎉 You're all set up!</h3>
                  <p style={{ color: '#52645A', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>Here's what to do next to grow your audience.</p>
                  {[
                    { icon: '📣', label: `Share ${tenant?.brand_name || 'your page'} with your audience`, action: () => { navigator.clipboard.writeText(`${window.location.origin}?creator=${tenant?.subdomain}`); alert('Link copied!') }, btn: 'Copy Link' },
                    { icon: '💎', label: 'Create a Premium Recipe Pack to earn revenue', action: () => setView('packs'), btn: 'Create Pack' },
                    { icon: '💳', label: tenant?.stripe_onboarded ? "Stripe connected — you're ready to earn!" : 'Connect Stripe to receive payouts', action: tenant?.stripe_onboarded ? undefined : handleStripeConnect, btn: tenant?.stripe_onboarded ? undefined : 'Connect Stripe' },
                    { icon: '🖼️', label: 'Upload a logo to complete your brand', action: () => setView('branding'), btn: 'Go to Branding' },
                  ].map((item, i, arr) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.75rem 0', borderBottom: i < arr.length - 1 ? '1px solid #F5E8D7' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                        <span style={{ color: '#1F3B30', fontSize: '0.9rem' }}>{item.label}</span>
                      </div>
                      {item.btn && item.action && (
                        <button onClick={item.action} style={{ background: color, color: 'white', border: 'none', padding: '0.4rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>{item.btn}</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #DDCDBB' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 1rem', fontSize: '1.1rem' }}>Getting started</h3>
                  {checks.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: i < checks.length - 1 ? '1px solid #F5E8D7' : 'none' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: item.done ? '#16a34a' : 'white', border: `2px solid ${item.done ? '#16a34a' : '#DDCDBB'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {item.done && <span style={{ color: 'white', fontSize: '0.7rem', fontWeight: '700' }}>✓</span>}
                      </div>
                      <span style={{ color: item.done ? '#687A70' : '#1F3B30', fontSize: '0.9rem', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* This Week's Recipes */}
            {creatorMenuData?.days && (() => {
              const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
              const DAY_COLORS = ['#C9471F', '#2563eb', '#7C3AED', '#16a34a', '#d97706', '#db2777', '#0891b2']
              const MEAL_LABELS: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
              const slots: { day: number; meal: string; recipeId: string }[] = []
              Object.entries(creatorMenuData.days as Record<string, any>).forEach(([dayKey, meals]: [string, any]) => {
                const day = parseInt(dayKey)
                ;['breakfast', 'lunch', 'dinner'].forEach(meal => {
                  if (meals[meal]) slots.push({ day, meal, recipeId: meals[meal] })
                })
              })
              if (slots.length === 0) return null
              return (
                <div style={{ marginTop: '1.5rem' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', margin: '0 0 0.875rem', color: '#1F3B30', fontSize: '1.2rem' }}>This Week's Recipes</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.875rem' }}>
                    {slots.map(({ day, meal, recipeId }) => {
                      const recipe = creatorMenuRecipes.find((r: any) => r.id === recipeId)
                      if (!recipe) return null
                      return (
                        <div key={`${day}-${meal}`} style={{ background: 'white', borderRadius: '12px', border: '1px solid #DDCDBB', overflow: 'hidden', boxShadow: '0 1px 4px rgba(44,24,16,0.06)' }}>
                          {recipe.image_url && (
                            <img src={recipe.image_url} alt={recipe.title} style={{ width: '100%', height: '120px', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          )}
                          <div style={{ padding: '0.75rem 0.875rem' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '20px', background: DAY_COLORS[day], color: 'white', letterSpacing: '0.04em' }}>{DAY_LABELS[day]}</span>
                              <span style={{ fontSize: '0.65rem', color: '#687A70', fontWeight: '500' }}>{MEAL_LABELS[meal]}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#1F3B30', lineHeight: 1.3 }}>{recipe.title}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </>
        )}

        {/* RECIPES */}
        {view === 'recipes' && (
          <>
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', margin: 0, color: '#1F3B30', fontSize: '1.5rem' }}>
                Recipes <span style={{ color: '#687A70', fontSize: '1rem', fontFamily: 'var(--font-sans)', fontWeight: '400' }}>({recipes.length})</span>
              </h2>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => setShowRecipeImport(true)} style={{ background: 'white', color, border: `1.5px solid ${color}`, padding: '0.6rem 1.1rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>⬆ Import CSV</button>
                <button onClick={() => setShowRecipeForm(true)} style={{ background: color, color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>+ Add Recipe</button>
              </div>
            </div>
            <input type="text" placeholder="🔍 Search recipes..." value={recipeSearch} onChange={e => setRecipeSearch(e.target.value)}
              style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #DDCDBB', background: '#FAF3E8', color: '#1F3B30', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }} />
            <div className="creator-recipe-grid">
              {filteredRecipes.map(recipe => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  color={color}
                  tenantId={tenantId}
                  onSelect={() => setSelectedRecipe(recipe)}
                  onDelete={async () => { if (confirm('Delete this recipe?')) { const { error } = await supabase.from('recipes').delete().eq('id', recipe.id).eq('tenant_id', tenantId); if (error) { alert('Delete failed: ' + error.message); } else { fetchRecipes(); } } }}
                  onImageUpdated={fetchRecipes}
                  isFavorite={creatorFavorites.has(recipe.id)}
                  onToggleFavorite={toggleCreatorFavorite}
                />
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
                  <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>My Meal Plan</h2>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Set up your family profile to start generating meal plans.</p>
                </div>
                <OnboardingWizard
                  user={user}
                  tenantId={tenantId}
                  onComplete={() => fetchFamilyProfile()}
                />
              </div>
            ) : (
              <div>
                <div className="creator-meal-toolbar">
                  <div><h2>My Meal Plan</h2><p>Try the weekly planning flow as your audience experiences it.</p></div>
                  {currentMenuId && <div className="creator-meal-tabs" role="tablist" aria-label="Meal planning views">
                    <button className={menuView === 'menu' ? 'active' : ''} onClick={() => setMenuView('menu')} role="tab" aria-selected={menuView === 'menu'}>Menu</button>
                    <button className={menuView === 'shopping' ? 'active' : ''} onClick={() => setMenuView('shopping')} role="tab" aria-selected={menuView === 'shopping'}>Shopping list</button>
                    <button className={menuView === 'settings' ? 'active' : ''} onClick={() => setMenuView('settings')} role="tab" aria-selected={menuView === 'settings'}>Preferences</button>
                  </div>}
                </div>
                {!currentMenuId && <div className="creator-empty">
                  <h3>Start with a weekly plan</h3>
                  <p>{targetWeekDate ? `Generate a menu for the week of ${new Date(targetWeekDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}.` : 'Choose your meals, review the week, then build a shopping list.'}</p>
                  <button onClick={() => generateMenu()} disabled={generatingMenu}>{generatingMenu ? 'Generating…' : 'Generate menu →'}</button>
                  {menuError && <p role="alert" style={{ color: '#B42318', marginTop: '12px' }}>{menuError}</p>}
                </div>}
                {menuView === 'menu' && currentMenuId && (
                  <WeeklyMenuView
                    menuId={currentMenuId}
                    tenantId={tenantId}
                    familyId={familyId}
                    onApproved={() => fetchCurrentMenu(familyId!)}
                    onGoShopping={() => setMenuView('shopping')}
                    onWeekChange={(newMenuId, weekDate) => {
                      if (newMenuId) {
                        setCurrentMenuId(newMenuId)
                        setTargetWeekDate(weekDate)
                      } else {
                        setCurrentMenuId(null)
                        setTargetWeekDate(weekDate)
                        setMenuView('dashboard')
                      }
                    }}
                    onRegenerate={(feedback) => generateMenu(feedback)}
                  />
                )}
                {menuView === 'shopping' && currentMenuId && familyId && (
                  <ShoppingList menuId={currentMenuId} familyId={familyId} tenantId={tenantId} creatorPreview />
                )}
                {menuView === 'settings' && familyId && (
                  <ProfileSettings user={user} familyId={familyId} tenantId={tenantId} isCreator={true} />
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
                <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Recipe Packs</h2>
                <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Bundle recipes into packs your audience can purchase.</p>
              </div>
              <button onClick={() => setShowPackForm(!showPackForm)} style={{ background: color, color: 'white', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>
                {showPackForm ? '✕ Cancel' : '+ New Pack'}
              </button>
            </div>

            {showPackForm && (
              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', border: '1px solid #DDCDBB', marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 1.25rem', fontSize: '1.1rem' }}>Create New Pack</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Pack name</label>
                    <input type="text" value={newPackName} onChange={e => setNewPackName(e.target.value)} placeholder="e.g. Summer Grilling Collection" style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #DDCDBB', background: '#FAF3E8', color: '#1F3B30', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Description</label>
                    <input type="text" value={newPackDescription} onChange={e => setNewPackDescription(e.target.value)} placeholder="What's included in this pack?" style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #DDCDBB', background: '#FAF3E8', color: '#1F3B30', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Price (USD)</label>
                    <input type="number" value={newPackPrice} onChange={e => setNewPackPrice(e.target.value)} placeholder="9.99" min="0.99" step="0.01" style={{ width: '200px', padding: '0.75rem 1rem', fontSize: '0.95rem', borderRadius: '10px', border: '2px solid #DDCDBB', background: '#FAF3E8', color: '#1F3B30', fontFamily: 'var(--font-sans)', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Upload premium recipes (CSV)</label>
                    <p style={{ color: '#52645A', fontSize: '0.8rem', margin: '0 0 0.5rem', lineHeight: 1.5 }}>These recipes will be marked as premium and locked until users purchase this pack. Use the same CSV format as regular recipe imports.</p>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={e => setNewPackCsvFile(e.target.files?.[0] || null)}
                      style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.875rem', borderRadius: '10px', border: '2px solid #DDCDBB', background: '#FAF3E8', color: '#1F3B30', fontFamily: 'var(--font-sans)', cursor: 'pointer', boxSizing: 'border-box' as const }}
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
                        // Check the CSV before creating the pack so invalid recipes cannot
                        // leave behind an empty paid pack or reach household shopping lists.
                        if (newPackCsvFile) {
                          const csvText = await newPackCsvFile.text()
                          const parseRow = (line: string): string[] => {
                            const cells: string[] = []
                            let current = ''
                            let quoted = false
                            for (let i = 0; i < line.length; i++) {
                              if (line[i] === '"') quoted = !quoted
                              else if (line[i] === ',' && !quoted) { cells.push(current.trim()); current = '' }
                              else current += line[i]
                            }
                            cells.push(current.trim())
                            return cells
                          }
                          const rows = csvText.trim().split('\n')
                          const headers = parseRow(rows[0]).map(h => h.replace(/\r/g, ''))
                          const ingredientColumn = headers.indexOf('ingredients')
                          if (ingredientColumn < 0) throw new Error('Recipe pack CSV needs an ingredients column.')
                          for (let i = 1; i < rows.length; i++) {
                            const raw = parseRow(rows[i])[ingredientColumn]?.replace(/^"|"$/g, '') || ''
                            const ingredients = raw.split('|').map(x => x.trim()).filter(Boolean).map(parseShoppingIngredient)
                            const issues = ingredients.length ? recipeIngredientIssues(ingredients) : ['Add ingredients with amounts.']
                            if (issues.length) throw new Error(`CSV row ${i + 1}: ${issues.join(' ')}`)
                          }
                        }
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
                          const parseCSVLine = (line: string): string[] => {
                            const result: string[] = []
                            let current = ''
                            let inQuotes = false
                            for (let i = 0; i < line.length; i++) {
                              if (line[i] === '"') {
                                inQuotes = !inQuotes
                              } else if (line[i] === ',' && !inQuotes) {
                                result.push(current.trim())
                                current = ''
                              } else {
                                current += line[i]
                              }
                            }
                            result.push(current.trim())
                            return result
                          }
                          const { data: { user: currentUser } } = await supabase.auth.getUser()
                          const currentUserId = currentUser?.id
                          const lines = text.trim().split('\n')
                          const headers = parseCSVLine(lines[0])
                          const rows = lines.slice(1)
                          const recipesToInsert = rows.map(row => {
                            const vals = parseCSVLine(row)
                            const get = (key: string) => {
                              const i = headers.indexOf(key)
                              return i >= 0 ? vals[i]?.trim().replace(/^"|"$/g, '') : ''
                            }
                            return {
                              tenant_id: tenantId,
                              title: get('title'),
                              description: get('description') || null,
                              ingredients: get('ingredients') ? get('ingredients').split('|').map(line => parseShoppingIngredient(line.trim())) : [],
                              instructions: get('instructions') || null,
                              prep_time_minutes: get('prep_time_minutes') ? parseInt(get('prep_time_minutes')) : null,
                              cook_time_minutes: get('cook_time_minutes') ? parseInt(get('cook_time_minutes')) : null,
                              servings: get('servings') ? parseInt(get('servings')) : null,
                              cuisine_tags: get('cuisine_tags') ? get('cuisine_tags').split('|') : [],
                              meal_type: get('meal_type') ? get('meal_type').split('|') : [],
                              dietary_tags: get('dietary_tags') ? get('dietary_tags').split('|') : [],
                              complexity: get('complexity') || 'moderate',
                              is_premium: true,
                              recipe_pack_id: pack.id,
                              is_active: true,
                              created_by: currentUserId,
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
              <div className="creator-empty">
                <h3>Make your first collection</h3>
                <p>Bundle premium recipes into a pack your audience can purchase. Start with a clear theme and a handful of recipes that work together.</p>
                <button onClick={() => setShowPackForm(true)}>Create a recipe pack →</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {packs.map(pack => (
                  <div key={pack.id} style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', border: '1px solid #DDCDBB', boxShadow: '0 1px 4px rgba(44,24,16,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', color: '#1F3B30', fontWeight: '600' }}>{pack.name}</h3>
                      <span style={{ fontWeight: '700', color, fontSize: '1.1rem', flexShrink: 0, marginLeft: '0.5rem' }}>${(pack.price_cents / 100).toFixed(2)}</span>
                    </div>
                    {pack.description && <p style={{ color: '#52645A', margin: '0 0 0.75rem', fontSize: '0.875rem', lineHeight: 1.5 }}>{pack.description}</p>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#687A70' }}>👑 {pack.recipes?.[0]?.count || 0} premium recipes</span>
                      <button onClick={async () => { if (confirm('Delete this pack?')) { await supabase.from('recipe_packs').delete().eq('id', pack.id); fetchPacks() } }} style={{ background: 'none', border: 'none', color: '#8A9A8F', cursor: 'pointer', fontSize: '0.85rem' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* SHOPPING */}
        {view === 'shopping' && (
          <>
            {creatorMenuId && creatorFamilyId ? (
              <ShoppingList
                menuId={creatorMenuId}
                familyId={creatorFamilyId}
                tenantId={tenantId}
                creatorPreview
                onShoppingComplete={() => setCreatorShoppingStatus('complete')}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 2rem', background: 'white', borderRadius: '16px', border: '1px solid #DDCDBB' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛒</div>
                <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.5rem' }}>No meal plan yet</h3>
                <p style={{ color: '#52645A', margin: '0 0 1.5rem', fontSize: '0.9rem' }}>Generate a meal plan first to build your shopping list.</p>
                <button onClick={() => setView('mealplan')} style={{ background: color, color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  Go to Meal Plan
                </button>
              </div>
            )}
          </>
        )}
        {/* EARNINGS */}
        {view === 'earnings' && (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Earnings</h2>
              <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Recipe pack sales and payouts recorded for your account.</p>
            </div>
            <div className="creator-revenue-note"><strong>Audience subscriptions</strong><p>Your 80% share of the $9 monthly audience subscription is part of the Createry offer. Subscription commissions are not yet shown in this dashboard, so the figures below cover recipe packs only.</p></div>

            {!tenant?.stripe_onboarded && (
              <div style={{ background: '#FFF8EC', border: '1px solid #F5A623', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: '600', color: '#1F3B30', marginBottom: '0.25rem' }}>💳 Connect Stripe to receive payouts</div>
                  <div style={{ color: '#52645A', fontSize: '0.85rem' }}>You need a connected Stripe account before users can purchase your recipe packs.</div>
                </div>
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
                          body: JSON.stringify({ tenant_id: tenantId, return_url: window.location.href }),
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
                  style={{ background: '#635BFF', color: 'white', border: 'none', padding: '0.75rem 1.25rem', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: connectingStripe ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', opacity: connectingStripe ? 0.7 : 1 }}
                >
                  {connectingStripe ? 'Redirecting...' : '💳 Connect Stripe Account'}
                </button>
              </div>
            )}
            {earnings.length === 0 ? (
              <div className="creator-empty">
                <h3>No recipe pack sales yet</h3>
                <p>When someone buys a pack, its sales will appear here. You can create a pack from your recipe library.</p>
                <button onClick={() => setView('packs')}>Explore recipe packs →</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                  {[
                    { label: 'Total Gross', value: `$${(earnings.reduce((s, e) => s + e.gross_cents, 0) / 100).toFixed(2)}`, icon: '💵' },
                    { label: 'Your Pack Share (80%)', value: `$${(earnings.reduce((s, e) => s + e.gross_cents, 0) * 0.8 / 100).toFixed(2)}`, icon: '🏦' },
                    { label: 'Total Units Sold', value: earnings.reduce((s, e) => s + e.units_sold, 0), icon: '🧾' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '1.25rem', border: '1px solid #DDCDBB' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{stat.icon}</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1F3B30', fontFamily: 'var(--font-display)' }}>{stat.value}</div>
                      <div style={{ color: '#687A70', fontSize: '0.85rem' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #DDCDBB', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '0.875rem 1.25rem', background: '#F5E8D7', borderBottom: '1px solid #DDCDBB' }}>
                    {['Pack', 'Units Sold', 'Gross', 'Your 80%', 'Platform 20%'].map(h => (
                      <div key={h} style={{ fontSize: '0.8rem', fontWeight: '700', color: '#52645A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                    ))}
                  </div>
                  {earnings.map((e, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '1rem 1.25rem', borderBottom: i < earnings.length - 1 ? '1px solid #F5E8D7' : 'none', alignItems: 'center' }}>
                      <div style={{ fontWeight: '600', color: '#1F3B30', fontSize: '0.95rem' }}>{e.pack_name}</div>
                      <div style={{ color: '#1F3B30', fontSize: '0.95rem' }}>{e.units_sold}</div>
                      <div style={{ color: '#1F3B30', fontSize: '0.95rem' }}>${(e.gross_cents / 100).toFixed(2)}</div>
                      <div style={{ color: '#16a34a', fontWeight: '600', fontSize: '0.95rem' }}>${(e.gross_cents * 0.8 / 100).toFixed(2)}</div>
                      <div style={{ color: '#687A70', fontSize: '0.95rem' }}>${(e.gross_cents * 0.2 / 100).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Payout History */}
            <div style={{ marginTop: '2.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 1rem', fontSize: '1.2rem' }}>Payout History</h3>
              {payouts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', background: '#F5E8D7', borderRadius: '16px', border: '1px dashed #CAB7A4' }}>
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>🏦</div>
                  <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>No payouts yet. Payouts are processed weekly.</p>
                </div>
              ) : (
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #DDCDBB', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '0.875rem 1.25rem', background: '#F5E8D7', borderBottom: '1px solid #DDCDBB' }}>
                    {['Period', 'Amount (Your 80%)', 'Status', 'Date'].map(h => (
                      <div key={h} style={{ fontSize: '0.8rem', fontWeight: '700', color: '#52645A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                    ))}
                  </div>
                  {payouts.map((p, i) => (
                    <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '1rem 1.25rem', borderBottom: i < payouts.length - 1 ? '1px solid #F5E8D7' : 'none', alignItems: 'center' }}>
                      <div style={{ color: '#1F3B30', fontSize: '0.9rem' }}>{p.period_start} → {p.period_end}</div>
                      <div style={{ color: '#16a34a', fontWeight: '600', fontSize: '0.9rem' }}>${(p.amount_cents / 100).toFixed(2)}</div>
                      <div>
                        <span style={{ fontSize: '0.75rem', background: p.status === 'paid' ? '#F0FDF4' : '#FEF9C3', color: p.status === 'paid' ? '#16a34a' : '#854D0E', padding: '0.2rem 0.6rem', borderRadius: '20px', fontWeight: '600' }}>
                          {p.status === 'paid' ? '✓ Paid' : p.status}
                        </span>
                      </div>
                      <div style={{ color: '#687A70', fontSize: '0.85rem' }}>{new Date(p.created_at).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* BRANDING */}
        {view === 'branding' && (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Branding</h2>
              <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>Customize how your app looks to your audience.</p>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', border: '1px solid #DDCDBB', maxWidth: '560px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.75rem', fontSize: '0.875rem' }}>Logo / profile image</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '12px', border: '2px solid #DDCDBB', overflow: 'hidden', background: '#F5E8D7', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {logoUrl
                        ? <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: '2rem', fontWeight: 700, color }}>{editBrandName.charAt(0) || 'C'}</span>}
                    </div>
                    <div>
                      <button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                        style={{ background: 'none', border: `1.5px solid ${color}`, color, padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.85rem', cursor: uploadingLogo ? 'not-allowed' : 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)', opacity: uploadingLogo ? 0.6 : 1 }}
                      >
                        {uploadingLogo ? 'Uploading...' : logoUrl ? '🖼 Change logo' : '📷 Upload logo'}
                      </button>
                      <p style={{ color: '#687A70', fontSize: '0.78rem', margin: '0.4rem 0 0' }}>JPG or PNG, max 2MB</p>
                    </div>
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/jpeg,image/png" onChange={handleLogoUpload} style={{ display: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Brand name</label>
                  <input type="text" value={editBrandName} onChange={e => setEditBrandName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Tagline</label>
                  <input type="text" value={editTagline} onChange={e => setEditTagline(e.target.value)} placeholder="e.g. Meal plans made simple" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Brand color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={{ width: '48px', height: '48px', borderRadius: '10px', border: '2px solid #DDCDBB', cursor: 'pointer', padding: '2px' }} />
                    <span style={{ color: '#1F3B30', fontWeight: '500', fontSize: '0.9rem' }}>{editColor}</span>
                  </div>
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', background: editColor, color: 'white', fontWeight: '600', fontSize: '0.875rem', textAlign: 'center' }}>
                    Preview: Button color
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#1F3B30', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Your audience link</label>
                  <div style={{ padding: '0.75rem 1rem', borderRadius: '10px', border: '2px solid #DDCDBB', background: '#F5E8D7', color: '#52645A', fontSize: '0.95rem' }}>
                    {`https://createry.app/?creator=${tenant?.subdomain || ''}`}
                  </div>
                  <p style={{ color: '#687A70', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>Share this link to open your branded experience.</p>
                </div>

                <button onClick={saveBranding} disabled={savingBranding} style={{ background: color, color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: savingBranding ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: savingBranding ? 0.7 : 1 }}>
                  {brandingSaved ? '✓ Saved!' : savingBranding ? 'Saving...' : 'Save branding'}
                </button>

                <div style={{ borderTop: '1px solid #DDCDBB', paddingTop: '1.25rem' }}>
                  <h4 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.5rem', fontSize: '1rem' }}>Stripe Payouts</h4>
                  <p style={{ color: '#52645A', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
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
        {/* ANALYTICS */}
        {view === 'analytics' && (
          <CreatorAnalytics tenantId={tenantId} primaryColor={color} />
        )}

        {view === 'sharing' && (() => {
          const appUrl = `https://createry.app/?creator=${encodeURIComponent(tenant?.subdomain || '')}`
          const brandName = tenant?.brand_name || 'my meal planning app'
          const captions = {
            instagram: `Your saved recipes deserve a place in your real week. With ${brandName}, you can plan meals around your household, review the week, and take a shopping list with you.\n\nExplore my meal planning app: ${appUrl}\n\nAudience subscription: $9/month.\n\n#mealplanning #familymeals #weeknightdinners`,
            tiktok: `What if dinner ideas became an actual plan? My recipes are now in ${brandName}: weekly meal plans, easy swaps, and a shopping list for the week. Explore it at ${appUrl}. Audience subscription: $9/month.`,
            facebook: `I wanted my recipes to be useful beyond a saved post. ${brandName} helps you turn them into a weekly meal plan that fits your household, then builds the shopping list.\n\nTake a look: ${appUrl}\n\nAudience subscription: $9/month. I'd love to hear what you'd cook first.`,
          }
          const copy = (key: string, text: string) => {
            navigator.clipboard.writeText(text)
            setCopied(key)
            setTimeout(() => setCopied(null), 2000)
          }
          return (
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Share Your App 📣</h2>
              <p style={{ color: '#52645A', margin: '0 0 2rem' }}>Share your branded link. These captions are starting points; make them sound like you before posting.</p>

              {/* Signup link */}
              <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #DDCDBB', padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.75rem', fontSize: '1.1rem' }}>🔗 Your Signup Link</h3>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <code style={{ flex: 1, background: '#F5E8D7', padding: '0.65rem 1rem', borderRadius: '8px', fontSize: '0.875rem', color: '#1F3B30', wordBreak: 'break-all' }}>{appUrl}</code>
                  <button onClick={() => copy('link', appUrl)} style={{ background: color, color: 'white', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font-sans)' }}>
                    {copied === 'link' ? '✓ Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>

              {/* Caption cards */}
              {([
                { key: 'instagram', platform: 'Instagram', icon: '📸' },
                { key: 'tiktok', platform: 'TikTok', icon: '🎵' },
                { key: 'facebook', platform: 'Facebook', icon: '👥' },
              ] as const).map(({ key, platform, icon }) => (
                <div key={key} style={{ background: 'white', borderRadius: '16px', border: '1px solid #DDCDBB', padding: '1.5rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: 0, fontSize: '1.1rem' }}>{icon} {platform}</h3>
                    <button onClick={() => copy(key, captions[key])} style={{ background: copied === key ? '#16a34a' : color, color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.825rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'background 0.2s' }}>
                      {copied === key ? '✓ Copied!' : 'Copy Caption'}
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#1F3B30', lineHeight: 1.7, whiteSpace: 'pre-line', background: '#FAF3E8', padding: '1rem', borderRadius: '8px' }}>{captions[key]}</p>
                </div>
              ))}
            </div>
          )
        })()}
        {view === 'settings' && familyId && (
          <ProfileSettings user={user} familyId={familyId} tenantId={tenantId} isCreator={true} />
        )}
        {view === 'settings' && !familyId && (
          <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', border: '1px solid #DDCDBB', textAlign: 'center', color: '#52645A' }}>
            <p>Set up your meal plan first to access profile settings.</p>
          </div>
        )}

        </main>
      </div>
      <footer style={{ padding: '0.6rem 2rem', background: 'var(--color-primary-light)', borderTop: `1px solid ${color}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', fontWeight: '500' }}>Powered by <strong>Createry</strong></span>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/terms" style={{ fontSize: '0.75rem', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '500' }}>Terms</a>
          <a href="/privacy" style={{ fontSize: '0.75rem', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '500' }}>Privacy</a>
          <a href="/cookies" style={{ fontSize: '0.75rem', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '500' }}>Cookies</a>
          <button onClick={() => setShowSupport(true)} style={{ background: 'none', border: 'none', fontSize: '0.75rem', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: '500', padding: 0, fontFamily: 'var(--font-sans)' }}>Help &amp; Support</button>
        </div>
      </footer>
      {showSupport && <SupportModal primaryColor={color} onClose={() => setShowSupport(false)} />}
      {selectedRecipe && <RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />}

      {/* Bottom Tab Navigation — mobile only */}
      <nav className="bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white',
        borderTop: '1px solid #DDCDBB',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '0.5rem 0',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 100,
        boxShadow: '0 -2px 12px rgba(44,24,16,0.08)',
      }}>
        {[
          { v: 'overview' as const, label: 'Home', icon: '🏠' },
          { v: 'mealplan' as const, label: 'Menu', icon: '📅' },
          { v: 'shopping' as const, label: 'Shop', icon: '🛒' },
          { v: 'sharing' as const, label: 'Share', icon: '📣' },
          { v: 'settings' as const, label: 'Profile', icon: '👤' },
        ].map(({ v, label, icon }) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '0.2rem', background: 'none', border: 'none',
              padding: '0.4rem 0.75rem',
              cursor: 'pointer',
              minWidth: '60px',
            }}
          >
            <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{icon}</span>
            <span style={{
              fontSize: '0.65rem', fontWeight: view === v ? '700' : '500',
              color: view === v ? color : '#687A70',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.02em',
            }}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
