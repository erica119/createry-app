import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  menuId: string
  familyId: string
  tenantId: string
  onShoppingComplete?: () => void
}

interface GroceryItem {
  name: string
  quantity: number
  unit: string
  aisle: string
  checked: boolean
  recipe_sources: string[]
}

interface GroceryList {
  id: string
  shopping_date: string
  items: GroceryItem[]
  status: string
  instacart_cart_url: string | null
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function ShoppingList({ menuId, familyId, tenantId, onShoppingComplete }: Props) {
  const [list, setList] = useState<GroceryList | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchList() }, [menuId])

  const fetchList = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('weekly_menu_id', menuId)
      .order('shopping_date')
      .limit(1)
      .maybeSingle()
    setList(data)
    setLoading(false)
  }

  const generateList = async () => {
    setGenerating(true)
    setError(null)
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/build-shopping-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({ menu_id: menuId, family_id: familyId, tenant_id: tenantId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to generate list')
      setList(result.grocery_list)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const markShoppingComplete = async () => {
    if (!list) return
    await supabase.from('grocery_lists').update({ status: 'complete' }).eq('id', list.id)
    setList({ ...list, status: 'complete' })
    if (onShoppingComplete) onShoppingComplete()
  }

  const toggleItem = async (index: number) => {
    if (!list) return
    const updatedItems = [...list.items]
    updatedItems[index] = { ...updatedItems[index], checked: !updatedItems[index].checked }
    setList({ ...list, items: updatedItems })
    await supabase.from('grocery_lists').update({ items: updatedItems }).eq('id', list.id)
  }


  const groupedItems = list?.items.reduce((acc, item, index) => {
    const aisle = item.aisle || 'Other'
    if (!acc[aisle]) acc[aisle] = []
    acc[aisle].push({ ...item, index })
    return acc
  }, {} as Record<string, (GroceryItem & { index: number })[]>)

  const checkedCount = list?.items.filter(i => i.checked).length || 0
  const totalCount = list?.items.length || 0

  if (loading) return <p style={{ color: '#6B5C52' }}>Loading shopping list...</p>

  if (!list) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 2rem', background: 'white', borderRadius: '16px', border: '1px solid #E8D5B7' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛒</div>
        <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.5rem', fontSize: '1.25rem' }}>Ready to shop?</h3>
        <p style={{ color: '#6B5C52', margin: '0 0 1.5rem', fontSize: '0.95rem' }}>
          We'll build your list from this week's approved menu.
        </p>
        <button
          onClick={generateList}
          disabled={generating}
          style={{ background: '#C4622D', color: 'white', border: 'none', padding: '0.875rem 2rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1, fontFamily: 'var(--font-sans)' }}
        >
          {generating ? 'Building list...' : '✨ Build Shopping List'}
        </button>
        {error && <p style={{ color: '#dc2626', marginTop: '1rem', fontSize: '0.9rem' }}>{error}</p>}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="shopping-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', color: '#2C1810', margin: '0 0 0.25rem' }}>Shopping List</h2>
          <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>
            {checkedCount} of {totalCount} items checked
          </p>
        </div>
        <div className="shopping-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {list.instacart_cart_url ? (
            // Instacart-approved CTA: Dark theme spec (exact text, colors, sizing required for IDP review)
            <a
              href={list.instacart_cart_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: '#003D29', color: '#FAF1E5', border: 'none', height: '46px', padding: '0 18px', borderRadius: '23px', fontSize: '0.875rem', fontWeight: '600', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'sans-serif' }}
            >
              <img src="/instacart-logo.svg" alt="" style={{ width: '22px', height: '22px', display: 'block' }} />
              Shop on Instacart
            </a>
          ) : (
            <button
              disabled
              style={{ background: '#a0a0a0', color: '#e0e0e0', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '600', cursor: 'not-allowed', opacity: 0.7 }}
            >
              🛒 Instacart Unavailable
            </button>
          )}
          <button onClick={() => window.print()} style={{ background: "#C4622D", color: "white", border: "none", padding: "0.6rem 1rem", borderRadius: "8px", fontSize: "0.875rem", fontWeight: "600", cursor: "pointer", fontFamily: "sans-serif" }}>🖨️ Print List</button>

          <button
            onClick={generateList}
            disabled={generating}
            style={{ background: 'white', color: '#6B5C52', border: '1.5px solid #E8D5B7', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.875rem', cursor: generating ? 'not-allowed' : 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}
          >
            {generating ? 'Rebuilding...' : '↺ Rebuild'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div style={{ background: '#E8D5B7', borderRadius: '4px', height: '6px', marginBottom: '1.5rem', overflow: 'hidden' }}>
          <div style={{ background: '#16a34a', height: '6px', width: `${(checkedCount / totalCount) * 100}%`, transition: 'width 0.3s ease', borderRadius: '4px' }} />
        </div>
      )}

      {/* Aisle groups */}
      {groupedItems && Object.entries(groupedItems)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([aisle, items]) => (
          <div key={aisle} style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#9B8B82', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '700' }}>
              {aisle}
            </h3>
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #E8D5B7', overflow: 'hidden' }}>
              {items.map((item, i) => (
                <div
                  key={i}
                  onClick={() => toggleItem(item.index)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '0.875rem 1rem',
                    borderBottom: i < items.length - 1 ? '1px solid #F5EFE6' : 'none',
                    cursor: 'pointer', background: item.checked ? '#FAFAF8' : 'white',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, marginRight: '0.875rem',
                    border: `2px solid ${item.checked ? '#16a34a' : '#E8D5B7'}`,
                    background: item.checked ? '#16a34a' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '0.7rem', fontWeight: '700', transition: 'all 0.15s ease',
                  }}>
                    {item.checked && '✓'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.95rem', color: item.checked ? '#9B8B82' : '#2C1810', textDecoration: item.checked ? 'line-through' : 'none', fontWeight: '500' }}>
                      {item.name}
                    </span>
                    {(item.quantity > 0 || item.unit) && (
                      <span style={{ color: '#9B8B82', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                        {item.quantity > 0 ? `${item.quantity} ${item.unit}` : item.unit}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#C8BAB2', textAlign: 'right', maxWidth: '100px', lineHeight: 1.3 }}>
                    {item.recipe_sources.slice(0, 2).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      }
      {list.status !== 'complete' && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button
            onClick={markShoppingComplete}
            style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.875rem 2rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
          >
            ✓ Shopping Complete
          </button>
        </div>
      )}
      {list.status === 'complete' && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center', padding: '1rem', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #86efac' }}>
          <p style={{ margin: 0, color: '#16a34a', fontWeight: '600', fontSize: '0.95rem' }}>✓ Shopping complete! Enjoy your meals this week.</p>
        </div>
      )}
      {error && <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{error}</p>}
    </div>
  )
}
