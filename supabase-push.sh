#!/bin/bash
# Wrapper script for supabase db push using pooler
set -a
source .env.local
set +a
npx supabase db push --db-url "$SUPABASE_DB_URL"
