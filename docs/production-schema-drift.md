# Production schema drift (2026-09-28)

Project: `xtgbmmiaareidjxsooqh`. This is an inventory of the live public schema, not an executable baseline.

## What is checked in

`supabase/migrations/` contains only `001_initial_schema.sql`, `002_household_recipe_overrides.sql`, and `003_private_household_recipes.sql`. The initial file creates 12 public tables; the second creates `recipe_overrides`; the third changes recipe policies.

## What production records

Supabase's migration history contains these five versioned migrations, whose SQL files are absent from this repository:

| Version | Name |
| --- | --- |
| 20260924194535 | enable_recipe_packs_row_level_security |
| 20260925180442 | harden_creator_recipe_update_policy |
| 20260925184256 | add_recurring_meal_anchors |
| 20260928014844 | add_creator_recipe_video_url |
| 20260928022236 | grant_service_read_for_recipe_and_auth_flows |

The last migration granted `service_role` SELECT on `family_profiles`, `user_profiles`, `recipes`, `recipe_overrides`, and `weekly_menus`. The shopping-list API had returned a 500 because its service-role reads of recipe overrides lacked table privileges. A subsequent real retry created a 66-item list and Instacart link.

Production currently has 22 public tables.

| In initial schema | Added or maintained outside initial schema |
| --- | --- |
| tenants, user_profiles, family_profiles, dietary_constraints, meal_preferences, weekly_schedule, grocery_schedule, recipes, premium_content, user_purchases, weekly_menus, grocery_lists | creator_payouts, creator_subscriptions, family_members, platform_admins, push_subscriptions, recipe_favorites, recipe_overrides, recipe_packs, recurring_meal_anchors, user_subscriptions |

The initial schema creates **12** tables; `002` adds the thirteenth. Nine production tables are not created by the checked-in migrations.

Production also contains columns absent from the original table definitions (for example `recipes.video_url`, `recipes.source`, `family_profiles.ai_consent_acknowledged_at`, and `tenants` branding, Stripe, and consent fields). Rebuilding from this repository alone would not recreate production. Do not use `001` as an exact schema snapshot or re-run it against production.

## Recovery

1. Pull a schema-only snapshot from the linked production project into a **new empty local database** using the Supabase CLI; include tables, constraints, indexes, functions, policies, grants, and extension declarations. Keep data and secrets out of Git.
2. Diff that snapshot against the checked-in migration sequence and reconstruct missing, ordered migration SQL, including the five versions above. Check the migration history before deciding whether to baseline or repair version records. Do not mark migrations applied solely to silence the CLI.
3. Replay from empty, run app build and representative creator/household flows, then compare schema and grants against production. Verify especially recipe isolation, shopping generation, replan, and Stripe webhook writes.
4. Adopt a single migration directory and require each future production DDL change to be committed and replayed before deploy.

This audit makes drift visible; it does not claim the migration history is repaired.
