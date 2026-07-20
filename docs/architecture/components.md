# Components

A catalog of the engine's components, one level below the [overview](./overview.md). It describes the target component set and, for each layer, where its components live in the tree.

## UI

The player- and admin-facing surfaces. Routable pages live under `app/` (App Router); the screen components they render live under `components/`.

### Player

| Component        | Path          | Responsibility                                                                                                 |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| My Page          | `components/` | Startup screen and player home — login (top-right) and scenario selection; reviews past results when signed in |
| Title screen     | `components/` | Public landing page (marketing); the app itself opens on My Page                                               |
| Boot             | `components/` | Loading screen that waits for scenario setup to complete                                                       |
| Briefing         | `components/` | Presents the scenario's opening situation and objective to the player                                          |
| Hub              | `components/` | Player's main screen — lists the roles to call, the document folder, and give-up/scoring                       |
| Conversation     | `components/` | Real-time voice dialogue (WebRTC): avatar, transcript, mute, and tool calls such as document generation        |
| Document viewer  | `components/` | Shows initial and generated reference material, distinguishing the two sources                                 |
| Debrief          | `components/` | End-of-session evaluation — answer, score, rank (S–D), strengths, improvements, and a share card               |
| Sign-up          | `components/` | Self-registration, then automatic sign-in                                                                      |
| Sign-in          | `components/` | Authenticated entry via email and password                                                                     |
| Account settings | `components/` | Manage one's own profile and preferences                                                                       |
| Password change  | `components/` | Update one's own password                                                                                      |

### Admin

| Component            | Path          | Responsibility                                               |
| -------------------- | ------------- | ------------------------------------------------------------ |
| Dashboard            | `components/` | Overview of activity and key metrics                         |
| User list            | `components/` | Browse and search accounts                                   |
| User detail          | `components/` | View one account and its activity                            |
| User create/edit     | `components/` | Add or modify an account                                     |
| Scenario list        | `components/` | Browse the scenario catalog                                  |
| Scenario detail      | `components/` | View one scenario's definition                               |
| Scenario create/edit | `components/` | Add or modify a scenario                                     |
| Settings             | `components/` | Configure system settings such as the AI and voice providers |
| Sign-in              | `components/` | Authenticated entry for the administrator                    |
| Account settings     | `components/` | Manage one's own profile and preferences                     |
| Password change      | `components/` | Update one's own password                                    |

## Endpoints

Server entry points the UI calls; each keeps sensitive material on the server. Player endpoints live under `app/api/player/`, admin endpoints under `app/api/admin/`. Authentication endpoints (sign-up, sign-in/out, password change, session validation) are shared by both roles and live under `app/api/auth/`; only each role's OAuth sign-in entry points live under its own path. External webhook endpoints (for example Stripe) live under `app/api/webhooks/` and verify request signatures before mutating state.

### Player

| Endpoint         | Path                               | Responsibility                                                                                                                                                      |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication   | `app/api/auth/`, `app/api/player/` | Sign-up, sign-in/out, password change, and session validation (shared); the player OAuth sign-in entry points; registration validates input and hashes the password |
| Account settings | `app/api/player/`                  | Reads and updates the player's own profile and preferences                                                                                                          |
| Tickets          | `app/api/player/`                  | Returns the player's own ticket balance and grant/consumption history                                                                                               |
| Billing          | `app/api/player/`                  | Starts Stripe Checkout for one-off ticket purchases (unit price) for authenticated players                                                                          |
| Session issuance | `app/api/player/`                  | Mints a short-lived credential and the real-time session config; assembles the system instructions server-side and never sends the hidden truth to the client       |
| Scenario setup   | `app/api/player/`                  | Generates the scenario instance — situation, cast, initial documents, metadata, and the hidden root cause — from the scenario's prompts                             |
| Tool execution   | `app/api/player/`                  | Runs a tool a role invokes during a conversation, such as generating a work document                                                                                |
| Evaluation       | `app/api/player/`                  | Scores the whole session from the conversation log and returns score, rank, and comment                                                                             |
| Result recording | `app/api/player/`                  | Persists a session's outcome — score, feedback, and metadata                                                                                                        |
| Results query    | `app/api/player/`                  | Returns a player's own past results                                                                                                                                 |

### Admin

| Endpoint                | Path                              | Responsibility                                                                                      |
| ----------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Authentication          | `app/api/auth/`, `app/api/admin/` | Sign-in/out, password change, and session validation (shared); the admin OAuth sign-in entry points |
| Account settings        | `app/api/admin/`                  | Reads and updates the administrator's own profile and preferences                                   |
| Ticket administration   | `app/api/admin/`                  | Reads a player's ticket ledger, grants tickets, and revokes active tickets                          |
| Dashboard               | `app/api/admin/`                  | Returns aggregate activity and metrics for administrators                                           |
| User administration     | `app/api/admin/`                  | Lists, views, creates, and edits accounts                                                           |
| Scenario administration | `app/api/admin/`                  | Lists, views, creates, and edits scenarios                                                          |
| Settings                | `app/api/admin/`                  | Reads and updates system settings such as the AI and voice providers                                |

## Providers

The swap boundaries, expressed as interfaces. The engine depends only on these. Providers live under `lib/providers/`.

| Provider        | Path             | Responsibility                                                                              |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `AIProvider`    | `lib/providers/` | Text generation — setup, documents, and scoring                                             |
| `VoiceProvider` | `lib/providers/` | Real-time speech conversation, including tool calls, turn detection, and client-side wiring |
| `AuthProvider`  | `lib/providers/` | Authentication and session identity                                                         |
| `Store`         | `lib/providers/` | Persistence of application data — accounts, scenarios, results, and settings                |

## Adapters

Adapters are swappable, so only the built-ins are defined here; new ones are added by extension. Adapters live under `lib/adapters/`.

| Adapter                  | Path            | Responsibility                                              |
| ------------------------ | --------------- | ----------------------------------------------------------- |
| ChatGPT Adapter          | `lib/adapters/` | Fulfils `AIProvider` via OpenAI Chat Completions            |
| ChatGPT Realtime Adapter | `lib/adapters/` | Fulfils `VoiceProvider` via the OpenAI Realtime API         |
| SQLite Adapter           | `lib/adapters/` | Fulfils `Store` on SQLite                                   |
| PostgresDB Adapter       | `lib/adapters/` | Fulfils `Store` on PostgreSQL                               |
| Auth.js Auth Adapter     | `lib/adapters/` | Fulfils `AuthProvider` via Auth.js (OAuth + email/password) |
