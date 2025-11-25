alter table public.user_preferences
  add column if not exists theme_color text;

alter table public.user_preferences
  drop constraint if exists user_preferences_theme_color_check;

alter table public.user_preferences
  add constraint user_preferences_theme_color_check
  check (
    theme_color is null
    or theme_color in ('blue', 'yellow', 'purple', 'red', 'green')
  );

