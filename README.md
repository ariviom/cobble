# Brick Party web

LEGO set piece tracking app. Enter a set number, view the parts inventory, mark owned quantities, compute missing pieces, and export lists compatible with Rebrickable CSV and BrickLink wanted list formats.

## Setup

```bash
npm install
npm run dev
```

## Scripts

| Command                  | Description                          |
| ------------------------ | ------------------------------------ |
| `npm run dev`            | Start development server             |
| `npm run build`          | Production build                     |
| `npm run lint`           | ESLint check                         |
| `npm run format`         | Prettier + ESLint fix                |
| `npm test`               | Run tests (Vitest)                   |
| `npm run generate-types` | Regenerate Supabase TypeScript types |

## Architecture

- **Next.js App Router** with React Server Components
- **Supabase** for auth, Postgres, and Realtime
- **TanStack Query** for server data
- **Zustand** for UI state
- **Dexie/IndexedDB** for local-first persistence
- **Tailwind CSS v4** for styling

### Key Directories

| Directory              | Purpose                           |
| ---------------------- | --------------------------------- |
| `app/api/`             | Route Handlers (thin HTTP layer)  |
| `app/lib/services/`    | Business logic                    |
| `app/lib/localDb/`     | IndexedDB operations              |
| `app/store/`           | Zustand stores                    |
| `app/components/`      | React components                  |
| `supabase/migrations/` | Database migrations               |
| `memory/`              | Project context for AI assistants |

See `CLAUDE.md` for detailed development guidelines.
