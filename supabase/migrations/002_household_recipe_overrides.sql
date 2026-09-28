create table public.recipe_overrides (
  family_id uuid not null references public.family_profiles(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  edits jsonb not null check (jsonb_typeof(edits) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (family_id, recipe_id)
);

create index recipe_overrides_recipe_id_idx on public.recipe_overrides(recipe_id);

alter table public.recipe_overrides enable row level security;
revoke all on public.recipe_overrides from anon, authenticated;
grant select, insert, update, delete on public.recipe_overrides to authenticated;

create policy "Households read their recipe edits" on public.recipe_overrides
  for select to authenticated using (
    exists (select 1 from public.family_profiles f where f.id = family_id and f.user_id = (select auth.uid()))
  );

create policy "Households create recipe edits" on public.recipe_overrides
  for insert to authenticated with check (
    exists (select 1 from public.family_profiles f join public.recipes r on r.id = recipe_id
      where f.id = family_id and f.user_id = (select auth.uid()) and f.tenant_id = r.tenant_id)
  );

create policy "Households update their recipe edits" on public.recipe_overrides
  for update to authenticated using (
    exists (select 1 from public.family_profiles f where f.id = family_id and f.user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.family_profiles f join public.recipes r on r.id = recipe_id
      where f.id = family_id and f.user_id = (select auth.uid()) and f.tenant_id = r.tenant_id)
  );

create policy "Households delete their recipe edits" on public.recipe_overrides
  for delete to authenticated using (
    exists (select 1 from public.family_profiles f where f.id = family_id and f.user_id = (select auth.uid()))
  );
