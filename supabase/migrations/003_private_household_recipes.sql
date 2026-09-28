-- Keep creator publications tenant-wide; personal uploads belong only to their owner.
drop policy if exists recipes_select_creator on public.recipes;
create policy recipes_select_creator on public.recipes for select to authenticated using (
  source = 'creator' and tenant_id in (
    select tenant_id from public.user_profiles where user_id = (select auth.uid()) and role = 'creator'
  )
);

drop policy if exists recipes_select_premium_discovery on public.recipes;
create policy recipes_select_premium_discovery on public.recipes for select to authenticated using (
  source = 'creator' and is_premium = true and tenant_id in (
    select tenant_id from public.family_profiles where user_id = (select auth.uid())
  )
);

drop policy if exists recipes_insert on public.recipes;
create policy recipes_insert on public.recipes for insert to authenticated with check (
  source = 'creator' and tenant_id in (
    select tenant_id from public.user_profiles where user_id = (select auth.uid()) and role = 'creator'
  )
);

drop policy if exists user_insert_own_recipes on public.recipes;
create policy user_insert_own_recipes on public.recipes for insert to authenticated with check (
  source = 'user' and is_premium = false and created_by = (select auth.uid()) and tenant_id in (
    select tenant_id from public.family_profiles where user_id = (select auth.uid())
  )
);

drop policy if exists recipes_update on public.recipes;
create policy recipes_update on public.recipes for update to authenticated using (
  source = 'creator' and tenant_id in (
    select tenant_id from public.user_profiles where user_id = (select auth.uid()) and role = 'creator'
  )
) with check (
  source = 'creator' and tenant_id in (
    select tenant_id from public.user_profiles where user_id = (select auth.uid()) and role = 'creator'
  )
);

create policy user_update_own_recipes on public.recipes for update to authenticated using (
  source = 'user' and created_by = (select auth.uid()) and tenant_id in (
    select tenant_id from public.family_profiles where user_id = (select auth.uid())
  )
) with check (
  source = 'user' and is_premium = false and created_by = (select auth.uid()) and tenant_id in (
    select tenant_id from public.family_profiles where user_id = (select auth.uid())
  )
);

drop policy if exists recipes_delete on public.recipes;
create policy recipes_delete on public.recipes for delete to authenticated using (
  source = 'creator' and tenant_id in (
    select tenant_id from public.user_profiles where user_id = (select auth.uid()) and role = 'creator'
  )
);

create policy user_delete_own_recipes on public.recipes for delete to authenticated using (
  source = 'user' and created_by = (select auth.uid()) and tenant_id in (
    select tenant_id from public.family_profiles where user_id = (select auth.uid())
  )
);
