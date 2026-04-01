import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  menuId: string
  familyId: string
  tenantId: string
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

export default function ShoppingList({ menuId, familyId, tenantId }: Props) {
  const [list, setList] = useState<GroceryList | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchList()
  }, [menuId])

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
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/build-shopping-list`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ANON_KEY}`,
            'apikey': ANON_KEY,
          },
          body: JSON.stringify({ menu_id: menuId, family_id: familyId, tenant_id: tenantId }),
        }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to generate list')
      setList(result.grocery_list)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const toggleItem = async (index: number) => {
    if (!list) return
    const updatedItems = [...list.items]
    updatedItems[index] = { ...updatedItems[index], checked: !updatedItems[index].checked }
    setList({ ...list, items: updatedItems })
    await supabase
      .from('grocery_lists')
      .update({ items: updatedItems })
      .eq('id', list.id)
  }

  const buildMailtoLink = () => {
    if (!list) return '#'
    const subject = `Shopping List - ${new Date(list.shopping_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`

    // Group items by aisle for the email body
    const groupedItems: Record<string, GroceryItem[]> = {}
    list.items.forEach(item => {
      const aisle = item.aisle || 'Other'
      if (!groupedItems[aisle]) groupedItems[aisle] = []
      groupedItems[aisle].push(item)
    })

    const body = Object.entries(groupedItems)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([aisle, items]) => {
        const itemLines = items.map(i => `  - ${i.name} ${i.quantity > 0 ? `(${i.quantity} ${i.unit})` : ''}`.trim()).join('\n')
        return `${aisle}:\n${itemLines}`
      })
      .join('\n\n')

    const fullBody = `Shopping List for ${new Date(list.shopping_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}\n\n${body}${list.instacart_cart_url ? `\n\nOrder on Instacart: ${list.instacart_cart_url}` : ''}`

    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody)}`
  }

  const groupedItems = list?.items.reduce((acc, item, index) => {
    const aisle = item.aisle || 'Other'
    if (!acc[aisle]) acc[aisle] = []
    acc[aisle].push({ ...item, index })
    return acc
  }, {} as Record<string, (GroceryItem & { index: number })[]>)

  const checkedCount = list?.items.filter(i => i.checked).length || 0
  const totalCount = list?.items.length || 0

  if (loading) return <p style={{ color: '#666' }}>Loading shopping list...</p>

  if (!list) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', background: '#f9f9f9', borderRadius: '8px' }}>
        <p style={{ color: '#666', marginBottom: '1rem' }}>No shopping list yet. Generate one from your approved menu!</p>
        <button onClick={generateList} disabled={generating} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '6px', fontSize: '0.95rem', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1 }}>
          {generating ? 'Building list...' : 'Build Shopping List'}
        </button>
        {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Shopping List</h2>
          <p style={{ color: '#666', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            {new Date(list.shopping_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {checkedCount}/{totalCount} items checked
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {list.instacart_cart_url && (
            <a href={list.instacart_cart_url} target="_blank" rel="noopener noreferrer" style={{ background: '#43b02a', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '6px', fontSize: '0.9rem', textDecoration: 'none', fontWeight: 'bold' }}>
              🛒 Order on Instacart
            </a>
          )}
          <a href={buildMailtoLink()} style={{ background: '#ea4335', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '6px', fontSize: '0.9rem', textDecoration: 'none', fontWeight: 'bold' }}>
            📧 Email List
          </a>
          <button onClick={generateList} disabled={generating} style={{ background: 'white', color: '#4f46e5', border: '1px solid #4f46e5', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem', cursor: generating ? 'not-allowed' : 'pointer' }}>
            {generating ? 'Rebuilding...' : 'Rebuild List'}
          </button>
        </div>
      </div>

      {totalCount > 0 && (
        <div style={{ background: '#eee', borderRadius: '4px', height: '6px', marginBottom: '1.5rem' }}>
          <div style={{ background: '#16a34a', borderRadius: '4px', height: '6px', width: `${(checkedCount / totalCount) * 100}%`, transition: 'width 0.3s ease' }} />
        </div>
      )}

      {groupedItems && Object.entries(groupedItems)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([aisle, items]) => (
          <div key={aisle} style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>{aisle}</h3>
            <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
              {items.map((item, i) => (
                <div key={i} onClick={() => toggleItem(item.index)} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: i < items.length - 1 ? '1px solid #f5f5f5' : 'none', cursor: 'pointer', background: item.checked ? '#f9fafb' : 'white' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: item.checked ? '2px solid #16a34a' : '2px solid #ddd', background: item.checked ? '#16a34a' : 'white', marginRight: '0.75rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.7rem' }}>
                    {item.checked && '✓'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.95rem', textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? '#999' : '#333' }}>{item.name}</span>
                    <span style={{ color: '#888', fontSize: '0.85rem', marginLeft: '0.5rem' }}>{item.quantity > 0 ? `${item.quantity} ${item.unit}` : item.unit}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#bbb', textAlign: 'right', maxWidth: '120px' }}>{item.recipe_sources.join(', ')}</div>
                </div>
              ))}
            </div>
          </div>
        ))
      }

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
