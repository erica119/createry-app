export interface ShoppingIngredient {
  name: string
  quantity: string | number
  unit?: string
}

// Match complete unit words. A single-letter unit must never eat the first
// letter of "grilled", "large", "lemon", or similar ingredient names.
const UNIT = '(?:cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|g|kg|ml|l|pinches?|cloves?|slices?|cans?|bunch(?:es)?|heads?|pkgs?|packages?|packets?|pieces?|packages?|pints?|quarts?|gallons?)'
const AMOUNT = '(?:\\d+(?:\\.\\d+)?(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|\\d+(?:\\.\\d+)?\\s*[-–]\\s*\\d+(?:\\.\\d+)?)'
const LINE = new RegExp(`^(${AMOUNT})(?:\\s+(${UNIT})\\b)?\\s+(.+)$`, 'i')
const QUANTITY = new RegExp(`^(${AMOUNT})(?:\\s+(${UNIT})\\b)?$`, 'i')
const AMBIGUOUS = /\b(?:or|and|optional|enough|to taste|for serving|as needed|of choice)\b/i

export function parseShoppingIngredient(line: string): ShoppingIngredient {
  const trimmed = line.trim()
  const match = trimmed.match(LINE)
  if (!match) return { name: trimmed, quantity: '' }
  return {
    quantity: [match[1].replace(/\\s*[-–]\\s*/g, '-'), match[2]].filter(Boolean).join(' '),
    name: match[3].trim(),
  }
}

export function ingredientReadinessIssue(ingredient: ShoppingIngredient): string | null {
  const name = ingredient.name.trim()
  if (!name) return 'Add an ingredient name.'
  if (AMBIGUOUS.test(name)) return 'Choose one purchasable ingredient; move alternatives, optional garnishes, and serving notes into the instructions.'
  const quantity = String(ingredient.quantity ?? '').trim()
  const match = quantity.match(QUANTITY)
  if (!match) return 'Add a numeric amount (for example, 2 lbs or 1 package).'
  const amount = match[1]
  const n = amount.includes('/') && !amount.includes('-')
    ? amount.split(' ').reduce((sum, part) => part.includes('/') ? sum + Number(part.split('/')[0]) / Number(part.split('/')[1]) : sum + Number(part), 0)
    : Number(amount.replace(/–/g, '-').split('-').pop())
  if (!Number.isFinite(n) || n <= 0) return 'Use an amount greater than zero.'
  return null
}

export function recipeIngredientIssues(ingredients: ShoppingIngredient[]): string[] {
  return ingredients.flatMap((ingredient, index) => {
    const issue = ingredientReadinessIssue(ingredient)
    return issue ? [`Ingredient ${index + 1} "${ingredient.name}": ${issue}`] : []
  })
}
