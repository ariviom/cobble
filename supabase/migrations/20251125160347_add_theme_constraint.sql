alter table public.user_preferences
  drop constraint if exists user_preferences_theme_check;

alter table public.user_preferences
  add constraint user_preferences_theme_check
  check (
    theme is null
    or theme in ('light', 'dark', 'system')
  );



