-- Add category column to user_feedback for filtering/sorting
alter table public.user_feedback
  add column category text not null default 'general'
  constraint category_values check (category in ('bug', 'feature_request', 'question', 'general'));

-- Index for filtering by category
create index user_feedback_category_idx on public.user_feedback(category);
