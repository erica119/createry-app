import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { menu_id, family_id, tenant_id } = await req.json();

    if (!menu_id || !family_id || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: menu_id, family_id, tenant_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch the approved menu
    const { data: menu, error: menuError } = await supabase
      .from("weekly_menus")
      .select("*")
      .eq("id", menu_id)
      .single();

    if (menuError || !menu) {
      return new Response(
        JSON.stringify({ error: "Menu not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Collect all recipe IDs from the menu
    const recipeIds = new Set<string>();
    const menuData = menu.menu_data as any;
    Object.values(menuData.days).forEach((day: any) => {
      if (day.breakfast) recipeIds.add(day.breakfast);
      if (day.lunch) recipeIds.add(day.lunch);
      if (day.dinner) recipeIds.add(day.dinner);
    });

    if (recipeIds.size === 0) {
      return new Response(
        JSON.stringify({ error: "No recipes in menu" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch all recipes
    const { data: recipes, error: recipesError } = await supabase
      .from("recipes")
      .select("id, title, ingredients, servings")
      .in("id", Array.from(recipeIds));

    if (recipesError || !recipes) {
      throw new Error("Failed to fetch recipes");
    }

    // 4. Build recipe lookup map
    const recipeMap: Record<string, any> = {};
    recipes.forEach(r => { recipeMap[r.id] = r; });

    // 5. Aggregate and deduplicate ingredients
    // Key: ingredient name (normalized) → aggregated item
    const ingredientMap: Record<string, {
      name: string;
      quantity: number;
      unit: string;
      recipe_sources: string[];
    }> = {};

    Object.entries(menuData.days).forEach(([dayIndex, day]: [string, any]) => {
      const mealSlots = ['breakfast', 'lunch', 'dinner'];
      mealSlots.forEach(meal => {
        const recipeId = day[meal];
        if (!recipeId || !recipeMap[recipeId]) return;

        const recipe = recipeMap[recipeId];
        const ingredients = recipe.ingredients as Array<{
          name: string;
          quantity: string;
          unit: string;
        }>;

        ingredients.forEach(ing => {
          const key = `${ing.name.toLowerCase().trim()}__${ing.unit.toLowerCase().trim()}`;
          const qty = parseFloat(ing.quantity) || 0;

          if (ingredientMap[key]) {
            ingredientMap[key].quantity += qty;
            if (!ingredientMap[key].recipe_sources.includes(recipe.title)) {
              ingredientMap[key].recipe_sources.push(recipe.title);
            }
          } else {
            ingredientMap[key] = {
              name: ing.name.trim(),
              quantity: qty,
              unit: ing.unit.trim(),
              recipe_sources: [recipe.title],
            };
          }
        });
      });
    });

    // 6. Convert to array and sort by name
    const items = Object.values(ingredientMap)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => ({
        ...item,
        quantity: item.quantity > 0
          ? parseFloat(item.quantity.toFixed(2))
          : item.quantity,
        checked: false,
        aisle: guessAisle(item.name),
      }));

    // 7. Fetch grocery schedule to determine shopping days
    const { data: grocerySchedule } = await supabase
      .from("grocery_schedule")
      .select("day_of_week, order_index")
      .eq("family_id", family_id)
      .order("order_index");

    // Default to Sunday if no schedule set
    const shoppingDays = grocerySchedule && grocerySchedule.length > 0
      ? grocerySchedule.map(s => s.day_of_week)
      : [0];

    // 8. Calculate actual shopping dates for this week
    const weekStart = new Date(menu.week_start_date);
    const shoppingDates = shoppingDays.map(dayOfWeek => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + dayOfWeek);
      return date.toISOString().split('T')[0];
    });

    // 9. For now, put all items on the first shopping day
    // Future: split items by shopping day based on when meals are served
    const primaryShoppingDate = shoppingDates[0];

    // 10. Delete any existing grocery list for this menu and shopping date
    await supabase
      .from("grocery_lists")
      .delete()
      .eq("weekly_menu_id", menu_id)
      .eq("shopping_date", primaryShoppingDate);

    // 11. Save the grocery list
    const { data: savedList, error: saveError } = await supabase
      .from("grocery_lists")
      .insert({
        tenant_id,
        family_id,
        weekly_menu_id: menu_id,
        shopping_date: primaryShoppingDate,
        items,
        status: "draft",
      })
      .select()
      .single();

    if (saveError) throw saveError;

    return new Response(
      JSON.stringify({ success: true, grocery_list: savedList }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Simple aisle guesser based on ingredient name
function guessAisle(name: string): string {
  const n = name.toLowerCase();

  if (/chicken|beef|pork|lamb|turkey|salmon|shrimp|fish|tuna|bacon|sausage/.test(n)) return 'Meat & Seafood';
  if (/milk|cheese|butter|cream|yogurt|egg|mozzarella|parmesan|feta/.test(n)) return 'Dairy & Eggs';
  if (/bread|tortilla|pita|bun|roll|bagel|wrap/.test(n)) return 'Bread & Bakery';
  if (/apple|banana|berry|berries|lemon|lime|orange|tomato|avocado|mango/.test(n)) return 'Produce';
  if (/broccoli|spinach|lettuce|kale|carrot|celery|onion|garlic|pepper|zucchini|cucumber|potato|mushroom|asparagus|cabbage/.test(n)) return 'Produce';
  if (/pasta|rice|noodle|quinoa|oat|flour|bread crumb/.test(n)) return 'Grains & Pasta';
  if (/can|canned|tomato sauce|broth|stock|bean|lentil|chickpea/.test(n)) return 'Canned & Dry Goods';
  if (/olive oil|vegetable oil|coconut oil|sesame oil/.test(n)) return 'Oils & Condiments';
  if (/soy sauce|fish sauce|oyster sauce|hot sauce|salsa|ketchup|mustard|mayo|vinegar/.test(n)) return 'Oils & Condiments';
  if (/salt|pepper|cumin|paprika|turmeric|oregano|basil|thyme|rosemary|cinnamon|ginger|curry|seasoning|spice/.test(n)) return 'Spices & Seasonings';
  if (/sugar|honey|maple syrup|vanilla/.test(n)) return 'Baking';
  if (/coconut milk|almond milk|oat milk/.test(n)) return 'Dairy & Eggs';
  if (/frozen/.test(n)) return 'Frozen';

  return 'Other';
}
