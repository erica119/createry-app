import { supabase } from './supabase'

export const EDITABLE_RECIPE_FIELDS = [
  'title', 'description', 'ingredients', 'instructions', 'prep_time_minutes',
  'cook_time_minutes', 'servings', 'complexity', 'cuisine_tags', 'meal_type', 'dietary_tags',
] as const

export async function getRecipeOverrides(familyId: string, recipeIds?: string[]) {
  let query = supabase.from('recipe_overrides').select('recipe_id, edits').eq('family_id', familyId)
  if (recipeIds) {
    if (recipeIds.length === 0) return {}
    query = query.in('recipe_id', recipeIds)
  }
  const { data, error } = await query
  if (error) throw error
  return Object.fromEntries((data || []).map(row => [row.recipe_id, row.edits])) as Record<string, Record<string, unknown>>
}

export function applyRecipeOverrides<T extends { id: string }>(recipes: T[], overrides: Record<string, Record<string, unknown>>): T[] {
  return recipes.map(recipe => {
    const edits = overrides[recipe.id]
    if (!edits) return recipe
    const safe = Object.fromEntries(EDITABLE_RECIPE_FIELDS.filter(field => Object.hasOwn(edits, field)).map(field => [field, edits[field]]))
    return { ...recipe, ...safe }
  })
}
