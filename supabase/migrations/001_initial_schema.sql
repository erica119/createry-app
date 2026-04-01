-- =============================================================================
-- Migration 001: Initial Schema
-- White-label meal planning app
-- Every table has tenant_id. RLS enforces all tenant isolation.
-- Superadmin access is handled via service role only (Option B).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- TENANTS
-- Represents one creator's branded app instance.
-- ---------------------------------------------------------------------------
create table public.tenants (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,                        -- creator's brand name
  subdomain           text not null unique,                 -- e.g. "sarah" → sarah.app.com
  owner_id            uuid not null references auth.users(id) on delete restrict,
  stripe_account_id   text,                                 -- Stripe Express account ID (set after onboarding)
  stripe_customer_id  text,                                 -- Stripe customer ID for SaaS subscription
  subscription_status text not null default 'trialing'      -- trialing | active | past_due | canceled
                        check (subscription_status in ('trialing','active','past_due','canceled')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- USER PROFILES
-- One row per authenticated user, scoped to a tenant.
-- A user can exist across multiple tenants (same auth.users row, different profiles).
-- ---------------------------------------------------------------------------
create table public.user_profiles (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'user'
                check (role in ('creator','user')),         -- 'creator' = the tenant owner
  display_name text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, user_id)                               -- one profile per tenant per user
);

-- ---------------------------------------------------------------------------
-- FAMILY PROFILES
-- One household per user, within a tenant.
-- ---------------------------------------------------------------------------
create table public.family_profiles (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  family_name text not null default 'My Family',
  adults      int not null default 2 check (adults >= 0),
  children    int not null default 0 check (children >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, user_id)                               -- one family profile per user per tenant
);

-- ---------------------------------------------------------------------------
-- DIETARY CONSTRAINTS
-- Many rows per family (one per constraint type).
-- ---------------------------------------------------------------------------
create table public.dietary_constraints (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  family_id       uuid not null references public.family_profiles(id) on delete cascade,
  constraint_type text not null
                    check (constraint_type in (
                      'allergy','intolerance','preference',
                      'religious','lifestyle'
                    )),
  value           text not null,                            -- e.g. "gluten", "peanuts", "vegetarian"
  severity        text not null default 'preference'
                    check (severity in ('allergy','intolerance','preference')),
  applies_to      text not null default 'everyone',         -- "everyone" | "adults" | "children" | member name
  notes           text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MEAL PREFERENCES
-- Per-family preferences used to weight menu generation.
-- ---------------------------------------------------------------------------
create table public.meal_preferences (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  family_id       uuid not null references public.family_profiles(id) on delete cascade,
  preference_type text not null
                    check (preference_type in (
                      'cuisine_like','cuisine_dislike',
                      'ingredient_like','ingredient_dislike',
                      'cook_time_max_minutes',
                      'complexity'                          -- simple | moderate | complex
                    )),
  value           text not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- WEEKLY SCHEDULE
-- Which days each family eats at home + preferred meal slots.
-- One row per day per family.
-- ---------------------------------------------------------------------------
create table public.weekly_schedule (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  family_id       uuid not null references public.family_profiles(id) on delete cascade,
  day_of_week     int not null check (day_of_week between 0 and 6),  -- 0=Sun, 6=Sat
  is_home         boolean not null default true,
  breakfast       boolean not null default false,
  lunch           boolean not null default false,
  dinner          boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (family_id, day_of_week)
);

-- ---------------------------------------------------------------------------
-- GROCERY SCHEDULE
-- Which days the family shops + preferred store order.
-- ---------------------------------------------------------------------------
create table public.grocery_schedule (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  family_id       uuid not null references public.family_profiles(id) on delete cascade,
  day_of_week     int not null check (day_of_week between 0 and 6),
  order_index     int not null default 0,                   -- if multiple shopping days, which comes first
  notes           text,
  created_at      timestamptz not null default now(),
  unique (family_id, day_of_week)
);

-- ---------------------------------------------------------------------------
-- RECIPES
-- Tenant-scoped. Added by creators or end users.
-- ---------------------------------------------------------------------------
create table public.recipes (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  created_by        uuid not null references auth.users(id) on delete restrict,
  title             text not null,
  description       text,
  ingredients       jsonb not null default '[]',            -- [{ name, quantity, unit }]
  instructions      text not null,
  prep_time_minutes int check (prep_time_minutes >= 0),
  cook_time_minutes int check (cook_time_minutes >= 0),
  servings          int check (servings > 0),
  cuisine_tags      text[] not null default '{}',           -- ["italian","pasta"]
  meal_type         text[] not null default '{}',           -- ["dinner","lunch"]
  dietary_tags      text[] not null default '{}',           -- ["gluten-free","vegetarian"]
  complexity        text not null default 'moderate'
                      check (complexity in ('simple','moderate','complex')),
  is_premium        boolean not null default false,         -- locked behind Stripe purchase
  source_url        text,
  image_url         text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PREMIUM CONTENT
-- Recipe packs / cookbooks available for purchase within a tenant.
-- ---------------------------------------------------------------------------
create table public.premium_content (
  id                    uuid primary key default uuid_generate_v4(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  title                 text not null,
  description           text,
  stripe_price_id       text not null,                      -- Stripe Price ID
  price_cents           int not null check (price_cents > 0),
  currency              text not null default 'usd',
  content_type          text not null default 'recipe_pack'
                          check (content_type in ('recipe_pack','cookbook')),
  recipe_ids            uuid[] not null default '{}',       -- recipes unlocked on purchase
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- USER PURCHASES
-- Records of completed Stripe purchases. RLS grants recipe access.
-- ---------------------------------------------------------------------------
create table public.user_purchases (
  id                      uuid primary key default uuid_generate_v4(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  premium_content_id      uuid not null references public.premium_content(id) on delete restrict,
  stripe_payment_intent_id text not null unique,
  stripe_checkout_session_id text,
  amount_cents            int not null,
  currency                text not null default 'usd',
  status                  text not null default 'pending'
                            check (status in ('pending','completed','refunded')),
  purchased_at            timestamptz,
  created_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- WEEKLY MENUS
-- One menu per family per week. Populated by generate-weekly-menu Edge Function.
-- ---------------------------------------------------------------------------
create table public.weekly_menus (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  family_id       uuid not null references public.family_profiles(id) on delete cascade,
  week_start_date date not null,                            -- always a Sunday
  status          text not null default 'pending_approval'
                    check (status in ('pending_approval','approved','archived')),
  menu_data       jsonb not null default '{}',
  -- Structure of menu_data:
  -- {
  --   "days": {
  --     "0": { "breakfast": recipe_id|null, "lunch": recipe_id|null, "dinner": recipe_id|null },
  --     ...
  --     "6": { ... }
  --   }
  -- }
  generation_metadata jsonb,                               -- token counts, model used, etc.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (family_id, week_start_date)
);

-- ---------------------------------------------------------------------------
-- GROCERY LISTS
-- Generated from an approved weekly menu.
-- ---------------------------------------------------------------------------
create table public.grocery_lists (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  family_id       uuid not null references public.family_profiles(id) on delete cascade,
  weekly_menu_id  uuid not null references public.weekly_menus(id) on delete cascade,
  shopping_date   date not null,
  items           jsonb not null default '[]',
  -- Structure of items:
  -- [{ name, quantity, unit, recipe_sources: [recipe_id], aisle, checked: bool }]
  instacart_cart_url text,                                  -- null until Instacart key available
  status          text not null default 'draft'
                    check (status in ('draft','sent_to_instacart','emailed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Tenant lookups (subdomain routing)
create index idx_tenants_subdomain on public.tenants(subdomain);
create index idx_tenants_owner_id on public.tenants(owner_id);

-- User profile lookups
create index idx_user_profiles_tenant_user on public.user_profiles(tenant_id, user_id);

-- Family profile lookups
create index idx_family_profiles_tenant_user on public.family_profiles(tenant_id, user_id);

-- Recipe filtering (the hot path for menu generation)
create index idx_recipes_tenant_id on public.recipes(tenant_id);
create index idx_recipes_dietary_tags on public.recipes using gin(dietary_tags);
create index idx_recipes_cuisine_tags on public.recipes using gin(cuisine_tags);
create index idx_recipes_meal_type on public.recipes using gin(meal_type);
create index idx_recipes_cook_time on public.recipes(tenant_id, cook_time_minutes)
  where is_active = true;

-- Weekly menu lookups
create index idx_weekly_menus_family_week on public.weekly_menus(family_id, week_start_date);
create index idx_weekly_menus_tenant_status on public.weekly_menus(tenant_id, status);

-- Grocery lists
create index idx_grocery_lists_family on public.grocery_lists(family_id);
create index idx_grocery_lists_menu on public.grocery_lists(weekly_menu_id);

-- User purchases (for RLS recipe unlock checks)
create index idx_user_purchases_tenant_user on public.user_purchases(tenant_id, user_id);
create index idx_user_purchases_content on public.user_purchases(premium_content_id)
  where status = 'completed';

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.family_profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.premium_content
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.weekly_menus
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.grocery_lists
  for each row execute function public.set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Philosophy:
--   - RLS is ON for every table, no exceptions.
--   - Superadmin access happens via service role key only (bypasses RLS by design).
--   - All client-side calls are tenant-scoped via JWT claim app.tenant_id.
--   - Helper function resolves current user's tenant_id from JWT.
-- =============================================================================

alter table public.tenants           enable row level security;
alter table public.user_profiles     enable row level security;
alter table public.family_profiles   enable row level security;
alter table public.dietary_constraints enable row level security;
alter table public.meal_preferences  enable row level security;
alter table public.weekly_schedule   enable row level security;
alter table public.grocery_schedule  enable row level security;
alter table public.recipes           enable row level security;
alter table public.premium_content   enable row level security;
alter table public.user_purchases    enable row level security;
alter table public.weekly_menus      enable row level security;
alter table public.grocery_lists     enable row level security;

-- ---------------------------------------------------------------------------
-- HELPER: resolve tenant_id from JWT custom claim
-- Edge Functions set app.tenant_id in the JWT when they create sessions.
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'app_tenant_id',
    ''
  )::uuid
$$;

-- ---------------------------------------------------------------------------
-- TENANTS policies
-- A user can read their own tenant row (they are the owner).
-- Mutation only via service role (Edge Functions).
-- ---------------------------------------------------------------------------
create policy "tenant_owner_select"
  on public.tenants for select
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- USER PROFILES policies
-- ---------------------------------------------------------------------------
create policy "user_profiles_select_own_tenant"
  on public.user_profiles for select
  using (tenant_id = public.current_tenant_id());

create policy "user_profiles_insert_own"
  on public.user_profiles for insert
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = auth.uid()
  );

create policy "user_profiles_update_own"
  on public.user_profiles for update
  using (tenant_id = public.current_tenant_id() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- FAMILY PROFILES policies
-- ---------------------------------------------------------------------------
create policy "family_profiles_select"
  on public.family_profiles for select
  using (tenant_id = public.current_tenant_id() and user_id = auth.uid());

create policy "family_profiles_insert"
  on public.family_profiles for insert
  with check (tenant_id = public.current_tenant_id() and user_id = auth.uid());

create policy "family_profiles_update"
  on public.family_profiles for update
  using (tenant_id = public.current_tenant_id() and user_id = auth.uid());

create policy "family_profiles_delete"
  on public.family_profiles for delete
  using (tenant_id = public.current_tenant_id() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- DIETARY CONSTRAINTS, MEAL PREFERENCES, WEEKLY SCHEDULE, GROCERY SCHEDULE
-- Owned by the family, so we join through family_profiles to verify ownership.
-- ---------------------------------------------------------------------------

-- dietary_constraints
create policy "dietary_constraints_select"
  on public.dietary_constraints for select
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "dietary_constraints_insert"
  on public.dietary_constraints for insert
  with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "dietary_constraints_update"
  on public.dietary_constraints for update
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "dietary_constraints_delete"
  on public.dietary_constraints for delete
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

-- meal_preferences (same pattern)
create policy "meal_preferences_select"
  on public.meal_preferences for select
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "meal_preferences_insert"
  on public.meal_preferences for insert
  with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "meal_preferences_update"
  on public.meal_preferences for update
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "meal_preferences_delete"
  on public.meal_preferences for delete
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

-- weekly_schedule (same pattern)
create policy "weekly_schedule_select"
  on public.weekly_schedule for select
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "weekly_schedule_insert"
  on public.weekly_schedule for insert
  with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "weekly_schedule_update"
  on public.weekly_schedule for update
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "weekly_schedule_delete"
  on public.weekly_schedule for delete
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

-- grocery_schedule (same pattern)
create policy "grocery_schedule_select"
  on public.grocery_schedule for select
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "grocery_schedule_insert"
  on public.grocery_schedule for insert
  with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "grocery_schedule_update"
  on public.grocery_schedule for update
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "grocery_schedule_delete"
  on public.grocery_schedule for delete
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RECIPES policies
-- All users in the tenant can read non-premium recipes.
-- Premium recipes require a completed purchase.
-- Only creators (role='creator') can insert/update/delete.
-- End users can also insert their own recipes (created_by = auth.uid()).
-- ---------------------------------------------------------------------------

create policy "recipes_select_free"
  on public.recipes for select
  using (
    tenant_id = public.current_tenant_id()
    and is_active = true
    and (
      -- Free recipe: anyone in tenant can see it
      is_premium = false
      or
      -- Premium recipe: user has purchased it
      exists (
        select 1
        from public.user_purchases up
        join public.premium_content pc on pc.id = up.premium_content_id
        where up.user_id = auth.uid()
          and up.tenant_id = public.current_tenant_id()
          and up.status = 'completed'
          and recipes.id = any(pc.recipe_ids)
      )
      or
      -- Creator can always see all recipes in their tenant
      exists (
        select 1 from public.user_profiles p
        where p.user_id = auth.uid()
          and p.tenant_id = public.current_tenant_id()
          and p.role = 'creator'
      )
    )
  );

create policy "recipes_insert"
  on public.recipes for insert
  with check (
    tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
  );

create policy "recipes_update"
  on public.recipes for update
  using (
    tenant_id = public.current_tenant_id()
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.user_profiles p
        where p.user_id = auth.uid()
          and p.tenant_id = public.current_tenant_id()
          and p.role = 'creator'
      )
    )
  );

create policy "recipes_delete"
  on public.recipes for delete
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.user_profiles p
      where p.user_id = auth.uid()
        and p.tenant_id = public.current_tenant_id()
        and p.role = 'creator'
    )
  );

-- ---------------------------------------------------------------------------
-- PREMIUM CONTENT policies
-- All users in tenant can see active premium content (to browse/purchase).
-- Only creators can manage it.
-- ---------------------------------------------------------------------------
create policy "premium_content_select"
  on public.premium_content for select
  using (tenant_id = public.current_tenant_id() and is_active = true);

create policy "premium_content_creator_all"
  on public.premium_content for all
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.user_profiles p
      where p.user_id = auth.uid()
        and p.tenant_id = public.current_tenant_id()
        and p.role = 'creator'
    )
  );

-- ---------------------------------------------------------------------------
-- USER PURCHASES policies
-- Users can see their own purchases. Inserts via Edge Function (service role).
-- ---------------------------------------------------------------------------
create policy "user_purchases_select_own"
  on public.user_purchases for select
  using (tenant_id = public.current_tenant_id() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- WEEKLY MENUS policies
-- Users can see and update (approve swaps) their own family's menus.
-- Inserts via Edge Function (service role).
-- ---------------------------------------------------------------------------
create policy "weekly_menus_select"
  on public.weekly_menus for select
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "weekly_menus_update_approval"
  on public.weekly_menus for update
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

-- Creator can see all menus in their tenant (for support/analytics)
create policy "weekly_menus_creator_select"
  on public.weekly_menus for select
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.user_profiles p
      where p.user_id = auth.uid()
        and p.tenant_id = public.current_tenant_id()
        and p.role = 'creator'
    )
  );

-- ---------------------------------------------------------------------------
-- GROCERY LISTS policies
-- Same ownership pattern as weekly_menus.
-- ---------------------------------------------------------------------------
create policy "grocery_lists_select"
  on public.grocery_lists for select
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

create policy "grocery_lists_update"
  on public.grocery_lists for update
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.family_profiles fp
      where fp.id = family_id and fp.user_id = auth.uid()
    )
  );

-- =============================================================================
-- COMMENTS / NOTES FOR FUTURE MIGRATIONS
-- =============================================================================
-- 002: Add recipe_history table (tracks which recipes were served, per family,
--      for the "last 3 weeks" repeat-avoidance logic in menu generation).
-- 003: Add instacart_sessions table once IDP key is confirmed.
-- 004: Add gmail_tokens table when Gmail OAuth scope is requested.
-- =============================================================================
