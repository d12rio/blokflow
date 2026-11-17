# Workflow Board for Storyblok

A kanban board for Storyblok's workflow stages, as a **Space Plugin** that opens in the sidebar of a Storyblok space. Each column is a stage of a workflow, each card is a story in that stage. Move cards between stages, filter to what's assigned to you, and open any story to edit its basics and read its workflow stage comments without leaving the board.

Built with Next.js 16 and [ui-sdk](https://ui-sdk.dev), deployed on Cloudflare Workers with [OpenNext](https://opennext.js.org/cloudflare). There's no database: everything it shows and changes lives in Storyblok.

## Features

**The board**
- One column per workflow stage, in the workflow's order. A workflow picker appears when the space has more than one.
- **Lazy, paged loading per stage.** Each column loads its first 25 stories, newest first, and loads the next page when you scroll near its end (or press *Load more*). Column counts show each stage's full total.
- **Search** asks Storyblok per stage, so it finds stories that aren't loaded yet. Press `/` to focus it.
- **Assigned to me** shows only the stories assigned to you. The board loads all of them up front, so the filter is complete however far a column has been scrolled. The choice is remembered per person.
- Cards show the story's name, slug, content type, draft or published state, due date (yellow when close, red when overdue) and assignees.

**Moving stories**
- Drag a card to another column, use the keyboard (focus a card's grip handle, press Space, use ← →, press Space), or use the card's ⋯ → *Move to* menu.
- Every stage accepts a drop. Which transitions are allowed is Storyblok's call: a refused move snaps back and shows Storyblok's reason.
- Moving only changes the workflow stage. Nothing is ever published.

**The story modal** (click a card)
- Edit the **name**, **slug**, **workflow stage**, **due date**, **assignees** and **tags**. Each change saves to Storyblok as you make it, as a draft.
- See every assignee (not just you), the status, content type, and the created, updated and published dates.
- Read the story's **workflow stage comments**, with authors and @mentions.
- *Open in Storyblok* takes you to the story in the editor.

**Settings and look**
- Board settings, saved per space for everyone: the workflow to open with, columns to hide, and column width (compact, comfortable or wide).
- Light and dark themes. Inside Storyblok the board follows Storyblok's theme; outside it, the system setting.

## How it works

Storyblok opens the plugin in an iframe at `/?space_id=…&user_id=…`. [`@storyblok/app-extension-auth`](https://www.npmjs.com/package/@storyblok/app-extension-auth) runs the OAuth flow and keeps the session in a signed, partitioned cookie. Everything else is server components (reads) and server actions (writes) calling the [Management API](https://www.storyblok.com/docs/api/management) with the signed-in person's token, so the board can only see and do what that person can.

| What | Management API |
| --- | --- |
| Workflows and stages | `GET /workflows`, `GET /workflow_stages?in_workflow=…` |
| A column's page | `GET /stories?in_workflow_stages=<stage>&sort_by=updated_at:desc&per_page=25&page=…`, plus `search=` while searching |
| Stories assigned to you | `GET /stories?in_workflow_stages=…&mine=true` |
| Names and avatars | `GET /collaborators` |
| Moving, due date, assignees | `POST /workflow_stage_changes`. In Storyblok, stage, due date and assignees are one change. |
| Name, slug, tags | `GET`, then `PUT /stories/:id` with the story's content sent back unchanged. Never published. |
| Story modal | `GET /stories/:id` (all assignees, dates) and `GET /comments?with_story=…` |
| Board settings | `GET /app_provisions`, `PUT /app_provisions/:app_id` (`space_level_settings`) |

Requests back off and retry when Storyblok's rate limit answers 429, and the first page of each stage loads three stages at a time.

### Good to know

- **Assignees aren't in Storyblok's story list.** Only a single story (`GET /stories/:id`) has them. The board uses the list's `mine=true` filter to know which stories are yours, so cards show your avatar on your stories; the modal loads everyone.
- **Field-level discussions aren't shown.** Storyblok doesn't let a plugin's token read them (the endpoint answers 401).
- **Moves send only the new stage.** Depending on the workflow, Storyblok may clear the due date or assignees on a stage change. The modal always sends stage, due date and assignees together, so edits there keep the others.

## Requirements

- Node.js 20 or newer
- A Storyblok account that can create extensions (Organization or Partner Portal → Extensions)
- For local development inside Storyblok, a public HTTPS URL to your machine, for example [ngrok](https://ngrok.com)
- For deploying, a Cloudflare account

## Set up

### 1. Create the extension in Storyblok

1. Organization (or Partner Portal) → **Extensions** → **New Extension**, type **Sidebar**.
2. **General:** note the slug, for example `your-org@workflow-kanban`.
3. **OAuth 2.0 and Pages:** set *Index to your page* to your app's URL and *Redirection endpoint* to `<URL>/api/connect/callback`. Copy the **Client Identifier** and **Client Secret**.
4. **Details:** turn on **Enable settings on space level**; the board keeps its settings there.
5. Install the extension into a space with its install link, then open it from the space's sidebar under **Apps**. The first sign-in may bounce once through `/401`; that's expected.

### 2. Run it locally

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3124
ngrok http 3124              # in another terminal; use its https URL in the extension and in .env.local
```

`/preview` shows the board with demo data and fake saves, for working on the UI without Storyblok. It's only available in development.

### Environment variables

| Variable | What it is |
| --- | --- |
| `STORYBLOK_PLUGIN_CLIENT_IDENTIFIER` | The extension's OAuth client id |
| `STORYBLOK_PLUGIN_CLIENT_SECRET` | The extension's OAuth client secret. It also signs the session cookie, so keep it secret. |
| `STORYBLOK_PLUGIN_BASE_URL` | The public `https://` URL the plugin is served from, without a trailing slash |
| `STORYBLOK_SPACE_PLUGIN_SLUG` | The extension's slug, used to find its space-level settings |

## Deploy to Cloudflare Workers

The app runs on Workers through OpenNext. `wrangler.jsonc` names the Worker `storyblok-workflow-kanban` and sets the plugin slug as a plain variable; the other three values are secrets.

```bash
npx wrangler login                                        # once; opens Cloudflare in your browser
npx wrangler secret put STORYBLOK_PLUGIN_CLIENT_IDENTIFIER
npx wrangler secret put STORYBLOK_PLUGIN_CLIENT_SECRET
npx wrangler secret put STORYBLOK_PLUGIN_BASE_URL         # e.g. https://storyblok-workflow-kanban.<subdomain>.workers.dev
npm run deploy                                            # builds with OpenNext and deploys
```

Then point the extension's *Index to your page* and *Redirection endpoint* (`<URL>/api/connect/callback`) at the Worker's URL. If your extension has a different slug, change `STORYBLOK_SPACE_PLUGIN_SLUG` in `wrangler.jsonc`.

To try the Workers build locally first, put the three secrets in `.dev.vars` (git ignores it) and run `npm run preview`. The base URL has to start with `https://`, even locally, or the sign-in refuses to start.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server on port 3124 |
| `npm test` | Unit tests (Vitest) for the parsing and board logic in `src/lib` |
| `npm run lint`, `npx tsc --noEmit` | Lint and typecheck |
| `npm run build` | Next.js production build |
| `npm run preview` | Build with OpenNext and run it in the local Workers runtime |
| `npm run deploy` | Build with OpenNext and deploy to Cloudflare |

### Project structure

```
src/
  app/
    page.tsx              Session check and first load: workflows, stages, first page per stage, your stories
    actions.ts            Server actions: move, edit, load a page, load story details, save settings
    preview/              Dev-only board with demo data
    401/                  Finishes the first OAuth consent back inside Storyblok
  pages/api/connect/      OAuth endpoints (@storyblok/app-extension-auth)
  components/
    kanban.tsx            The board: columns, paging, search, filters, moves
    board/                A ui-sdk primitive on createTransfer for pointer and keyboard moves
    story-card.tsx        A card
    story-dialog.tsx      The story modal and its editors
    multi-picker.tsx      Multi-select with chips, for assignees and tags
    settings-dialog.tsx   Board settings
  lib/
    board.ts, columns.ts  Parsing Storyblok data, building columns, paging (tested)
    story-details.ts      Story details and comment rich text (tested)
    story-edit.ts         Slugs, tags and due dates (tested)
    settings.ts           Space-level settings, normalized on read (tested)
    storyblok/            Management API client, session, URLs, error messages
```

UI controls are [ui-sdk](https://ui-sdk.dev) components, styled with plain CSS on top of its `web.css` and Storyblok's design tokens (`src/app/globals.css`).
