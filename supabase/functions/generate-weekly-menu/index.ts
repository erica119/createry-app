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
    const { family_id, tenant_id, week_start_date, feedback } = await req.json();

    if (!family_id || !tenant_id || !week_start_date) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: family_id, tenant_id, week_start_date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: family, error: familyError } = await supabase
      .from("family_profiles")
      .select("*")
      .eq("id", family_id)
      .single();

    if (familyError || !family) {
      return new Response(
        JSON.stringify({ error: "Family profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: constraints } = await supabase
      .from("dietary_constraints")
      .select("*")
      .eq("family_id", family_id);

    const { data: preferences } = await supabase
      .from("meal_preferences")
      .select("*")
      .eq("family_id", family_id);

    const { data: familyMembers } = await supabase
      .from("family_members")
      .select("name, age_range, dietary_restrictions, notes")
      .eq("family_id", family_id)
      .order("created_at");

    const { data: schedule } = await supabase
      .from("weekly_schedule")
      .select("*")
      .eq("family_id", family_id)
      .order("day_of_week");

    const { data: recurringAnchors } = await supabase
      .from("recurring_meal_anchors")
      .select("day_of_week, meal_type, recipe_id")
      .eq("family_id", family_id)
      .eq("tenant_id", tenant_id);

    const allergyValues = (constraints || [])
      .filter(c => c.severity === "allergy" || c.severity === "intolerance")
      .map(c => c.value);

    const lifestyleDiets = (constraints || [])
      .filter(c => c.constraint_type === "lifestyle" || c.constraint_type === "preference" || c.constraint_type === "religious")
      .map(c => c.value);

    const cookTimePref = (preferences || []).find(p => p.preference_type === "cook_time_max_minutes");
    const maxCookTime = cookTimePref ? parseInt(cookTimePref.value) : 999;

    const complexityPref = (preferences || []).find(p => p.preference_type === "complexity");
    const preferredComplexity = complexityPref?.value || "moderate";

    let recipeQuery = supabase
      .from("recipes")
      .select("id, title, description, ingredients, cook_time_minutes, prep_time_minutes, cuisine_tags, meal_type, dietary_tags, complexity, servings")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .eq("is_premium", false);

    if (maxCookTime < 999) {
      recipeQuery = recipeQuery.lte("cook_time_minutes", maxCookTime);
    }

    const { data: allRecipes } = await recipeQuery.limit(60);

    const dietTagMap: Record<string, string> = {
      vegetarian: "vegetarian",
      vegan: "vegan",
      pescatarian: "pescatarian",
      keto: "keto",
      paleo: "paleo",
      gluten_free: "gluten-free",
      gluten: "gluten-free",
      dairy: "dairy-free",
    };

    const safeRecipes = (allRecipes || []).filter(recipe => {
      const recipeTags = (recipe.dietary_tags || []).map((t: string) => t.toLowerCase());
      const ingredientsStr = JSON.stringify(recipe.ingredients).toLowerCase();
      const titleStr = recipe.title.toLowerCase();

      const hasAllergen = allergyValues.some(allergen =>
        titleStr.includes(allergen.toLowerCase()) ||
        ingredientsStr.includes(allergen.toLowerCase())
      );
      if (hasAllergen) return false;

      for (const diet of lifestyleDiets) {
        const requiredTag = dietTagMap[diet];
        if (requiredTag && !recipeTags.includes(requiredTag)) return false;
      }

      return true;
    });

    const { data: favData } = await supabase
      .from("recipe_favorites")
      .select("recipe_id")
      .eq("user_id", family.user_id);
    const favoriteIds = new Set<string>((favData || []).map((f: any) => f.recipe_id));

    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const { data: recentMenus } = await supabase
      .from("weekly_menus")
      .select("menu_data, week_start_date")
      .eq("family_id", family_id)
      .gte("week_start_date", threeWeeksAgo.toISOString().split("T")[0])
      .order("week_start_date", { ascending: false })
      .limit(3);

    const recentRecipeIds = new Set<string>();
    (recentMenus || []).forEach(menu => {
      const menuDate = new Date(menu.week_start_date);
      const isTwoWeekWindow = menuDate >= twoWeeksAgo;
      const days = menu.menu_data?.days || {};
      Object.values(days).forEach((day: any) => {
        ['breakfast', 'lunch', 'dinner'].forEach(meal => {
          const recipeId = day[meal];
          if (!recipeId) return;
          if (favoriteIds.has(recipeId) && isTwoWeekWindow) recentRecipeIds.add(recipeId);
          if (!favoriteIds.has(recipeId)) recentRecipeIds.add(recipeId);
        });
      });
    });

    const scheduleDescription = (schedule || [])
      .filter(d => d.is_home)
      .map(d => {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const meals = [];
        if (d.breakfast) meals.push("breakfast");
        if (d.lunch) meals.push("lunch");
        if (d.dinner) meals.push("dinner");
        return `${days[d.day_of_week]}: ${meals.join(", ")}`;
      })
      .join("\n");

    const likedCuisines = (preferences || [])
      .filter(p => p.preference_type === "cuisine_like")
      .map(p => p.value)
      .join(", ");

    const dislikedCuisines = (preferences || [])
      .filter(p => p.preference_type === "cuisine_dislike")
      .map(p => p.value)
      .join(", ");

    const compactRecipes = safeRecipes.map(r => ({
      id: r.id,
      title: r.title,
      meal_type: r.meal_type,
      cook_time: r.cook_time_minutes,
      complexity: r.complexity,
      cuisine: r.cuisine_tags,
      recent: recentRecipeIds.has(r.id),
      favorite: favoriteIds.has(r.id),
    }));

    const prompt = `You are a meal planning assistant. Generate a weekly meal plan for a family.

FAMILY INFO:
- Adults: ${family.adults}, Children: ${family.children}
- Family name: ${family.family_name}
${familyMembers && familyMembers.length > 0 ? `
INDIVIDUAL FAMILY MEMBERS (personalize meals to suit everyone):
${familyMembers.map(m => {
  const restrictions = m.dietary_restrictions && m.dietary_restrictions.length > 0
    ? ` | Dietary restrictions: ${m.dietary_restrictions.join(", ")}`
    : "";
  const notes = m.notes ? ` | Notes: ${m.notes}` : "";
  return `- ${m.name} (${m.age_range})${restrictions}${notes}`;
}).join("\n")}
` : ""}

COOKING SCHEDULE (days and meals that need planning):
${scheduleDescription || "Dinner every day"}

DIETARY RESTRICTIONS:
Allergies/intolerances (NEVER include these ingredients): ${allergyValues.length ? allergyValues.join(", ") : "None"}
Lifestyle diets (ALL recipes must comply): ${lifestyleDiets.length ? lifestyleDiets.join(", ") : "None"}

PREFERENCES:
- Liked cuisines: ${likedCuisines || "No preference"}
- Disliked cuisines: ${dislikedCuisines || "None"}
- Max cook time: ${maxCookTime === 999 ? "No limit" : maxCookTime + " minutes"}
- Preferred complexity: ${preferredComplexity}

AVAILABLE RECIPES (${compactRecipes.length} total):
${JSON.stringify(compactRecipes)}

INSTRUCTIONS:
1. Create a meal plan for the week starting ${week_start_date}${feedback ? `\n\nUSER FEEDBACK FOR THIS REGENERATION: ${feedback}\nPlease take this feedback into account when selecting recipes.` : ''}
2. Only use recipes from the AVAILABLE RECIPES list
3. Prefer recipes NOT marked as "recent: true" to avoid repetition
4. Prioritize recipes marked as "favorite: true" — these are the user's favorites and should appear more often when not recent
5. Match meal_type appropriately (breakfast recipes for breakfast slots, etc)
6. Consider family preferences for cuisine and complexity
7. Return ONLY valid JSON, no prose

Return this exact JSON structure:
{
  "days": {
    "0": {"breakfast": "recipe_id_or_null", "lunch": "recipe_id_or_null", "dinner": "recipe_id_or_null"},
    "1": {"breakfast": "recipe_id_or_null", "lunch": "recipe_id_or_null", "dinner": "recipe_id_or_null"},
    "2": {"breakfast": "recipe_id_or_null", "lunch": "recipe_id_or_null", "dinner": "recipe_id_or_null"},
    "3": {"breakfast": "recipe_id_or_null", "lunch": "recipe_id_or_null", "dinner": "recipe_id_or_null"},
    "4": {"breakfast": "recipe_id_or_null", "lunch": "recipe_id_or_null", "dinner": "recipe_id_or_null"},
    "5": {"breakfast": "recipe_id_or_null", "lunch": "recipe_id_or_null", "dinner": "recipe_id_or_null"},
    "6": {"breakfast": "recipe_id_or_null", "lunch": "recipe_id_or_null", "dinner": "recipe_id_or_null"}
  }
}

Where day 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
Only include recipe IDs for meals in the cooking schedule. Use null for meals not being planned.
Use actual recipe IDs from the list, not titles.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const error = await anthropicResponse.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const anthropicData = await anthropicResponse.json();
    const menuText = anthropicData.content[0].text;

    let menuData;
    try {
      menuData = JSON.parse(menuText);
    } catch {
      const jsonMatch = menuText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        menuData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Claude returned invalid JSON");
      }
    }

    // Recurring meal anchors are deterministic household rules, not AI suggestions.
    // Apply them after generation so regeneration/feedback cannot accidentally drop them.
    const safeRecipeIds = new Set<string>(safeRecipes.map((r: any) => r.id));
    const scheduleByDay = new Map<number, any>((schedule || []).map((d: any) => [d.day_of_week, d]));
    if (!menuData.days) menuData.days = {};

    for (const anchor of (recurringAnchors || [])) {
      const scheduledDay = scheduleByDay.get(anchor.day_of_week);
      const slotIsEnabled = scheduledDay?.is_home && scheduledDay?.[anchor.meal_type] === true;
      if (!slotIsEnabled || !safeRecipeIds.has(anchor.recipe_id)) continue;

      const dayKey = String(anchor.day_of_week);
      if (!menuData.days[dayKey]) {
        menuData.days[dayKey] = { breakfast: null, lunch: null, dinner: null };
      }
      menuData.days[dayKey][anchor.meal_type] = anchor.recipe_id;
    }

    const { data: savedMenu, error: saveError } = await supabase
      .from("weekly_menus")
      .upsert({
        tenant_id,
        family_id,
        week_start_date,
        status: "pending_approval",
        menu_data: menuData,
        generation_metadata: {
          model: "claude-haiku-4-5",
          input_tokens: anthropicData.usage?.input_tokens,
          output_tokens: anthropicData.usage?.output_tokens,
          recipes_considered: safeRecipes.length,
          recurring_anchors_applied: (recurringAnchors || []).length,
          generated_at: new Date().toISOString(),
        },
      }, { onConflict: "family_id,week_start_date" })
      .select()
      .single();

    if (saveError) throw saveError;

    return new Response(
      JSON.stringify({ success: true, menu: savedMenu }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
