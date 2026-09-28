import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { applyRecipeOverrides, getRecipeOverrides } from '../../lib/recipeOverrides'
import WeekCalendarPicker from './WeekCalendarPicker'

type Meal = 'breakfast' | 'lunch' | 'dinner'

interface Props {
  menuId: string
  tenantId: string
  userId?: string
  familyId?: string
  onApproved: () => void
  onGoShopping?: () => void
  onViewRecipe?: (recipeId: string) => void
  onPlanChanged?: () => void
  onWeekChange?: (menuId: string | null, weekDate: string) => void
  onRegenerate?: (feedback: string, weekStartDate: string) => void
}

interface Recipe {
  id: string
  title: string
  complexity: string
  prep_time_minutes: number
  cook_time_minutes: number
  image_url: string | null
  is_premium: boolean
  recipe_pack_id: string | null
  meal_type: string[]
  is_active: boolean
}

interface RecipePack {
  id: string
  name: string
  price_cents: number
}

interface MenuData {
  days: Record<string, { breakfast: string | null; lunch: string | null; dinner: string | null }>
  schedule_override?: Record<string, Record<Meal, boolean>>
}

interface WeeklyMenu {
  id: string
  week_start_date: string
  status: string
  menu_data: MenuData
}

const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' }, { key: 'dinner', label: 'Dinner' },
]

export default function WeeklyMenuView({ menuId, tenantId, userId, familyId, onApproved, onGoShopping, onViewRecipe, onPlanChanged, onWeekChange, onRegenerate }: Props) {
  const [menu, setMenu] = useState<WeeklyMenu | null>(null)
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({})
  const [packs, setPacks] = useState<Record<string, RecipePack>>({})
  const [unlockedPackIds, setUnlockedPackIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [swapDay, setSwapDay] = useState<{ day: string; meal: Meal } | null>(null)
  const [savingSlot, setSavingSlot] = useState(false)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])
  const [unlockModal, setUnlockModal] = useState<{ pack: RecipePack; recipeTitle: string } | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay()
    return today
  })
  const [showFullWeek, setShowFullWeek] = useState(false)

  useEffect(() => {
    fetchMenu()
    fetchAllRecipes()
    if (userId) fetchUnlockedPacks()
  }, [menuId])

  const fetchMenu = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('weekly_menus')
      .select('*')
      .eq('id', menuId)
      .maybeSingle()
    if (data) {
      setMenu(data)
      const thisWeek = new Date()
      thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay())
      const weekKey = [thisWeek.getFullYear(), String(thisWeek.getMonth() + 1).padStart(2, '0'), String(thisWeek.getDate()).padStart(2, '0')].join('-')
      setSelectedDay(data.week_start_date === weekKey ? new Date().getDay() : 0)
      await fetchRecipesForMenu(data.menu_data)
    }
    setLoading(false)
  }

  const fetchRecipesForMenu = async (menuData: MenuData) => {
    const ids = Object.values(menuData.days)
      .flatMap(d => [d.breakfast, d.lunch, d.dinner])
      .filter((id): id is string => !!id)
    if (ids.length === 0) return
    const { data } = await supabase
      .from('recipes')
      .select('id, title, complexity, prep_time_minutes, cook_time_minutes, image_url, is_premium, recipe_pack_id, meal_type, is_active')
      .in('id', ids)
    if (data) {
      let householdRecipes = data
      if (familyId) {
        try { householdRecipes = applyRecipeOverrides(data, await getRecipeOverrides(familyId, ids)) }
        catch (error) { console.error('Could not load household recipe edits:', error) }
      }
      const map: Record<string, Recipe> = {}
      householdRecipes.forEach(r => { map[r.id] = r })
      setRecipes(map)
      await fetchPacksForRecipes(data)
    }
  }

  const fetchPacksForRecipes = async (recipeList: Recipe[]) => {
    const packIds = [...new Set(recipeList.map(r => r.recipe_pack_id).filter((id): id is string => !!id))]
    if (packIds.length === 0) return
    const { data } = await supabase
      .from('recipe_packs')
      .select('id, name, price_cents')
      .in('id', packIds)
    if (data) {
      const map: Record<string, RecipePack> = {}
      data.forEach(p => { map[p.id] = p })
      setPacks(map)
    }
  }

  const fetchAllRecipes = async () => {
    const { data } = await supabase
      .from('recipes')
      .select('id, title, complexity, prep_time_minutes, cook_time_minutes, image_url, is_premium, recipe_pack_id, meal_type, is_active')
      .eq('tenant_id', tenantId)
    if (data) {
      if (familyId) {
        try { setAllRecipes(applyRecipeOverrides(data, await getRecipeOverrides(familyId, data.map(r => r.id)))) }
        catch (error) { console.error('Could not load household recipe edits:', error); setAllRecipes(data) }
      } else setAllRecipes(data)
    }
  }

  const fetchUnlockedPacks = async () => {
    if (!userId) return
    const { data } = await supabase
      .from('user_purchases')
      .select('recipe_pack_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
    if (data) {
      setUnlockedPackIds(new Set(data.map(p => p.recipe_pack_id).filter((id): id is string => !!id)))
    }
  }

  const navigateWeek = async (direction: 'prev' | 'next') => {
    if (!menu || !familyId) return
    setNavigating(true)
    const current = new Date(menu.week_start_date)
    current.setUTCDate(current.getUTCDate() + (direction === 'next' ? 7 : -7))
    const newWeekStr = current.toISOString().split('T')[0]
    const { data } = await supabase
      .from('weekly_menus')
      .select('id')
      .eq('family_id', familyId)
      .eq('week_start_date', newWeekStr)
      .maybeSingle()
    if (onWeekChange) onWeekChange(data?.id || null, newWeekStr)
    setNavigating(false)
  }

  const handleApprove = async () => {
    if (!menu) return
    if (!Object.values(menu.menu_data.days).some(day => MEALS.some(({ key }) => day[key]))) {
      setSlotError('Add at least one meal before approving this menu.')
      return
    }
    setApproving(true)
    const { error } = await supabase
      .from('weekly_menus')
      .update({ status: 'approved' })
      .eq('id', menu.id)
    if (!error) {
      setMenu({ ...menu, status: 'approved' })
      onApproved()
      onGoShopping?.()
    } else {
      setSlotError('Could not save this plan. Please try again.')
    }
    setApproving(false)
  }

  const saveSlot = async (day: string, meal: Meal, recipeId: string | null) => {
    if (!menu || savingSlot) return false
    setSavingSlot(true)
    setSlotError(null)
    const updatedDays: MenuData['days'] = {
      ...menu.menu_data.days,
      [day]: { ...menu.menu_data.days[day], [meal]: recipeId },
    }
    // This snapshot belongs only to this menu. The recurring weekly_schedule is untouched.
    const scheduleOverride: Record<string, Record<Meal, boolean>> = {}
    for (let i = 0; i < 7; i++) {
      const slots = updatedDays[String(i)]
      scheduleOverride[String(i)] = {
        breakfast: !!slots?.breakfast,
        lunch: !!slots?.lunch,
        dinner: !!slots?.dinner,
      }
    }
    const updatedMenuData = { ...menu.menu_data, days: updatedDays, schedule_override: scheduleOverride }
    const nextStatus = menu.status === 'approved' ? 'approved' : 'pending_approval'
    const { error } = await supabase.from('weekly_menus')
      .update({ menu_data: updatedMenuData, status: nextStatus })
      .eq('id', menu.id)
    if (error) {
      setSlotError('Could not save this week’s schedule. Please try again.')
      setSavingSlot(false)
      return false
    }
    setMenu({ ...menu, menu_data: updatedMenuData, status: nextStatus })
    if (recipeId) await fetchRecipesForMenu(updatedMenuData)
    onPlanChanged?.()
    setSavingSlot(false)
    return true
  }

  const handleSwap = async (recipeId: string) => {
    if (!swapDay) return
    if (await saveSlot(swapDay.day, swapDay.meal, recipeId)) setSwapDay(null)
  }

  const handleUnlockClick = (pack: RecipePack, recipeTitle: string) => {
    setUnlockModal({ pack, recipeTitle })
  }

  const handleCheckout = async () => {
    if (!unlockModal || !userId) return
    setCheckingOut(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipe_pack_id: unlockModal.pack.id,
          tenant_id: tenantId,
        }),
      })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (err) {
      console.error('Checkout error:', err)
      alert('Something went wrong. Please try again.')
    } finally {
      setCheckingOut(false)
    }
  }

  const isLocked = (recipe: Recipe) => {
    if (!recipe.is_premium) return false
    if (!recipe.recipe_pack_id) return false
    return !unlockedPackIds.has(recipe.recipe_pack_id)
  }

  if (loading) return <p style={{ color: '#52645A' }}>Loading menu...</p>
  if (!menu) return <p style={{ color: '#52645A' }}>Menu not found.</p>

  const isApproved = menu.status === 'approved'
  const weekDate = new Date(`${menu.week_start_date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const visibleDays = showFullWeek ? [0, 1, 2, 3, 4, 5, 6] : [Math.min(selectedDay, 5), Math.min(selectedDay, 5) + 1]

  return (
    <div>
      {/* The same two-day and full-week controls work before and after approval. */}
      <div className="plan-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {familyId && <button onClick={() => navigateWeek('prev')} disabled={navigating} aria-label="Previous week" className="btn-secondary">←</button>}
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: '#1F3B30', margin: 0 }}>Week of {weekDate}</h2>
            {familyId && <button onClick={() => navigateWeek('next')} disabled={navigating} aria-label="Next week" className="btn-secondary">→</button>}
            {familyId && <button onClick={() => setShowCalendar(true)} aria-label="Choose a week" className="btn-secondary">📅</button>}
          </div>
          <p style={{ color: '#52645A', margin: '0.45rem 0 0', fontSize: '0.9rem' }}>
            {isApproved ? 'Your plan is ready. You can still change any meal.' : 'Review and adjust your meals before shopping.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {isApproved ? (
            onGoShopping && <button onClick={onGoShopping} className="btn-primary" style={{ padding: '0.7rem 1.1rem' }}>Review shopping list →</button>
          ) : (
            <button onClick={handleApprove} disabled={approving} className="btn-primary" style={{ padding: '0.7rem 1.1rem' }}>
              {approving ? 'Saving plan…' : 'Finish plan & review shopping →'}
            </button>
          )}
        </div>
      </div>
      {slotError && <p role="alert" style={{ color: '#B42318', margin: '0 0 1rem' }}>{slotError}</p>}

      <div aria-label="Days this week" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.4rem', marginBottom: '1.25rem' }}>
        {Array.from({ length: 7 }, (_, day) => {
          const date = new Date(`${menu.week_start_date}T12:00:00`)
          date.setDate(date.getDate() + day)
          const count = MEALS.filter(({ key }) => menu.menu_data.days[String(day)]?.[key]).length
          const active = visibleDays.includes(day)
          return <button key={day} type="button" onClick={() => { setSelectedDay(day); setShowFullWeek(false) }} aria-pressed={active}
            style={{ minWidth: 0, minHeight: '66px', padding: '0.5rem 0.2rem', borderRadius: '10px', border: `1.5px solid ${active ? 'var(--color-primary)' : '#DDCDBB'}`, background: active ? 'var(--color-primary)' : 'white', color: active ? 'white' : '#1F3B30', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700 }}>{FULL_DAY_NAMES[day].slice(0, 3)}</span>
            <span style={{ display: 'block', fontSize: '1.05rem', fontWeight: 700 }}>{date.getDate()}</span>
            <span style={{ display: 'block', fontSize: '0.65rem', opacity: 0.85 }}>{count ? `${count} meal${count === 1 ? '' : 's'}` : 'Open'}</span>
          </button>
        })}
      </div>

      <p style={{ margin: '0 0 1rem', color: '#52645A', fontSize: '0.84rem' }}>Open a recipe, swap a meal, or leave a slot empty. Changes save to this week.</p>
      {visibleDays.map(day => <section key={day} aria-label={`${FULL_DAY_NAMES[day]} meals`} style={{ marginBottom: '1.5rem' }}>
        <div style={{ background: '#F5E8D7', border: '1px solid #DDCDBB', borderRadius: '16px', padding: '0.85rem 1rem', marginBottom: '0.75rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', fontSize: '1.3rem', margin: 0 }}>{FULL_DAY_NAMES[day]}</h3>
        </div>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
        {MEALS.map(({ key, label }) => {
          const recipeId = menu.menu_data.days[String(day)]?.[key]
          const recipe = recipeId ? recipes[recipeId] : null
          const locked = recipe ? isLocked(recipe) : false
          const pack = recipe?.recipe_pack_id ? packs[recipe.recipe_pack_id] : null
          return <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', background: 'white', border: '1px solid #DDCDBB', borderRadius: '14px', padding: '0.9rem', flexWrap: 'wrap' }}>
            {recipe?.image_url ? <img src={recipe.image_url} alt="" style={{ width: '64px', height: '64px', borderRadius: '9px', objectFit: 'cover' }} />
              : <span aria-hidden="true" style={{ width: '64px', height: '64px', borderRadius: '9px', background: '#F5E8D7', display: 'grid', placeItems: 'center', fontSize: '1.5rem' }}>{recipe ? '🍽️' : '＋'}</span>}
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <span style={{ color: '#687A70', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
              <h4 style={{ color: '#1F3B30', fontSize: '1rem', margin: '0.15rem 0' }}>{recipe?.title || (recipeId ? 'Recipe unavailable' : 'No meal planned')}</h4>
              {recipe?.cook_time_minutes && <span style={{ color: '#687A70', fontSize: '0.78rem' }}>{recipe.cook_time_minutes} min cook time</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {locked && pack ? <button onClick={() => handleUnlockClick(pack, recipe?.title || '')} className="btn-secondary">Unlock recipe</button> : <>
                {recipe && onViewRecipe && <button onClick={() => onViewRecipe(recipe.id)} className="btn-secondary">View recipe</button>}
                <button onClick={() => { setSlotError(null); setSwapDay({ day: String(day), meal: key }) }} disabled={savingSlot} className="btn-secondary">{recipeId ? 'Swap' : 'Add meal'}</button>
                {recipeId && <button onClick={() => void saveSlot(String(day), key, null)} disabled={savingSlot} className="btn-secondary" aria-label={`Remove ${label} on ${FULL_DAY_NAMES[day]}`}>Remove</button>}
              </>}
            </div>
          </div>
        })}
        </div>
      </section>)}

      <div style={{ borderTop: '1px solid #DDCDBB', paddingTop: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setShowFullWeek(value => !value)} className="btn-secondary" aria-pressed={showFullWeek}>
            {showFullWeek ? 'Show two days' : 'See whole week'}
          </button>
          {onRegenerate && <button onClick={() => setShowFeedback(!showFeedback)} className="btn-secondary">{showFeedback ? 'Cancel replan' : 'Replan this week…'}</button>}
        </div>
        {showFeedback && onRegenerate && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
          <input value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="What would you like to change?" aria-label="Replan feedback"
            style={{ flex: '1 1 220px', padding: '0.7rem', border: '1px solid #DDCDBB', borderRadius: '8px' }} />
          <button onClick={() => { onRegenerate(feedback, menu.week_start_date); setShowFeedback(false); setFeedback('') }} className="btn-primary">Generate a new plan</button>
        </div>}
      </div>

      {/* Swap modal */}
      {swapDay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', maxWidth: '480px', width: '100%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', color: '#1F3B30' }}>
                {menu.menu_data.days[swapDay.day]?.[swapDay.meal] ? 'Swap' : 'Add'} {swapDay.meal} on {FULL_DAY_NAMES[parseInt(swapDay.day)]}
              </h3>
              <button onClick={() => setSwapDay(null)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#52645A' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {allRecipes.filter(r => r.is_active && !isLocked(r) && r.meal_type?.includes(swapDay?.meal || '')).map(recipe => (
                <button
                  key={recipe.id}
                  onClick={() => handleSwap(recipe.id)}
                  style={{ padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #DDCDBB', background: 'white', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                >
                  <p style={{ margin: '0 0 0.2rem', fontWeight: '600', color: '#1F3B30', fontSize: '0.9rem' }}>{recipe.title}</p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#687A70' }}>
                    {recipe.prep_time_minutes && `${recipe.prep_time_minutes}m prep · `}{recipe.complexity}
                  </p>
                </button>
              ))}
              {!allRecipes.some(r => r.is_active && !isLocked(r) && r.meal_type?.includes(swapDay?.meal || '')) && <p>No {swapDay.meal} recipes are available. Add one to your recipe library first.</p>}
              {slotError && <p role="alert" style={{ color: '#dc2626' }}>{slotError}</p>}
            </div>
          </div>
        </div>
      )}

      {showCalendar && onWeekChange && (
        <WeekCalendarPicker
          currentWeekDate={menu.week_start_date}
          onSelectWeek={async (weekDate) => {
            setNavigating(true)
            const { data } = await supabase
              .from('weekly_menus')
              .select('id')
              .eq('family_id', familyId!)
              .eq('week_start_date', weekDate)
              .maybeSingle()
            onWeekChange(data?.id || null, weekDate)
            setNavigating(false)
          }}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {/* Unlock modal */}
      {unlockModal && (
        <div
          onClick={() => setUnlockModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '20px', maxWidth: '420px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(44,24,16,0.25)' }}
          >
            <div style={{ background: 'var(--color-primary)', padding: '1.5rem 2rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
              <h2 style={{ fontFamily: 'var(--font-display)', color: 'white', margin: '0 0 0.25rem', fontSize: '1.35rem' }}>
                {unlockModal.pack.name}
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', margin: 0, fontSize: '0.875rem' }}>
                Unlock this recipe pack to access all premium recipes
              </p>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <div style={{ background: '#FAF3E8', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#687A70', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Includes</p>
                <p style={{ margin: 0, color: '#1F3B30', fontWeight: '500', fontSize: '0.95rem' }}>
                  {unlockModal.recipeTitle} + more recipes in this pack
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <span style={{ color: '#52645A', fontSize: '0.9rem' }}>One-time purchase</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: '#1F3B30', fontWeight: '700' }}>
                  ${(unlockModal.pack.price_cents / 100).toFixed(2)}
                </span>
              </div>
              <button
                onClick={handleCheckout}
                disabled={checkingOut}
                style={{ width: '100%', background: 'var(--color-primary)', color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '700', cursor: checkingOut ? 'not-allowed' : 'pointer', opacity: checkingOut ? 0.7 : 1, fontFamily: 'var(--font-sans)' }}
              >
                {checkingOut ? 'Redirecting...' : `Unlock for $${(unlockModal.pack.price_cents / 100).toFixed(2)}`}
              </button>
              <button
                onClick={() => setUnlockModal(null)}
                style={{ width: '100%', background: 'none', border: 'none', color: '#687A70', padding: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.5rem' }}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
