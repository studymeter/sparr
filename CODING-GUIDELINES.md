# CODING-GUIDELINES.md

The **canonical source** for coding conventions. Loaded from `CLAUDE.md` via `@CODING-GUIDELINES.md`, and followed by both AI and humans.
The guiding principle is _The Art of Readable Code_ — **code that others can understand in the shortest possible time** comes first.
Machine-checkable items are enforced by ESLint (`.eslintrc.json`) and verified by `npm run lint` / CI.

---

## 1. Naming conventions (choosing the case)

**camelCase is the default**; use PascalCase / snake_case only where required. **When in doubt, camelCase.**
Strictly follow the "when to use" column below.

| Case                 | Purpose                | When to use (what it applies to)                                                                                                         | Example                                                                |
| -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **camelCase**        | Default                | Variables, functions, methods, function parameters, properties of your own objects, React hooks, non-component file names                | `callLogs` / `assemblePrompt()` / `useCallState()` / `openai.ts`       |
| **PascalCase**       | Types and parts        | React components (and their same-named files), types/interfaces/type aliases, enums (name and members), classes, generic type parameters | `CallScreen.tsx` / `type RootCause` / `interface CallLog` / `<TProps>` |
| **snake_case**       | External boundary only | **Only when copying an external API's (e.g. OpenAI's) JSON fields verbatim.** Never in your own code                                     | `input_audio_transcription` / `audio_format` (OpenAI Realtime payload) |
| **UPPER_SNAKE_CASE** | Constants / env vars   | Environment variable names, module-level true constants                                                                                  | `OPENAI_API_KEY` / `MAX_RETRIES` / `DOC_DELAY_MS`                      |

### When snake_case is allowed (strictly)

- ✅ Field names of objects **sent to / received from** an external API (e.g. OpenAI). Don't fight the wire format.
- ✅ Table / column names if a DB is introduced later (**limited to that layer**).
- ❌ Anywhere else (your own variables, functions, or your own type properties).
- **Always convert at the boundary**: map external snake_case into your own camelCase types right where you receive it (in `app/api/**` or `lib/openai.ts`), and **do not carry snake_case into the app internals**.

```ts
// Boundary (OpenAI response) — received as snake_case
type RealtimeEventDto = {
  audio_format: string;
  input_audio_transcription: { text: string };
};

// Own domain — converted to camelCase before going inside
type RealtimeEvent = { audioFormat: string; transcript: string };
function toRealtimeEvent(dto: RealtimeEventDto): RealtimeEvent {
  return {
    audioFormat: dto.audio_format,
    transcript: dto.input_audio_transcription.text,
  };
}
```

> Note: string-literal union values (e.g. `'unaware' | 'partial' | 'hiding'`) are **data, not identifiers**.
> They are outside the scope of the naming cases, and may stay lowercase as they already are.

### File names

- React components: `PascalCase.tsx` (matching the component name). e.g. `Hub.tsx` / `CallScreen.tsx`
- Other TS (lib / util / hook / prompt): `camelCase.ts`. e.g. `commonBase.ts` / `assemble.ts`
- Next.js reserved files follow the framework: `page.tsx` / `route.ts` / `layout.tsx`

### Other naming

- Booleans start with `is` / `has` / `can` / `should` / `did` (`isHiding`, `hasDocument`).
- Don't mix synonymous verbs (standardize on `fetch` for retrieval, etc.). Keep vocabulary consistent.
- Generic names (`tmp` / `data` / `val` / `foo` / `retval`) only when they are genuinely generic.
- Encode units and scope in the name (`delayMs`, `maxRetries`). The wider a variable's scope, the more descriptive it should be.

---

## 2. Comments

- Don't write what the code already says. Write **"why it was done this way"** (intent, background, trade-offs).
- Make gotchas, assumptions, and non-obvious constraints explicit.
- Prefix unfinished work with `TODO:`, risky workarounds with `HACK:`, and cautions with `NOTE:`.

---

## 3. Control flow and functions

- Keep nesting shallow. Flatten deep `if`s with **guard clauses and early returns**.
- Break down complex conditions/expressions by naming **explanatory variables**.
- Prefer positive conditions and a readable ordering.
- **One function, one responsibility.** Keep functions short and split huge ones. Keep parameters few (bundle into an object if there are many).

```ts
// Bad: deeply nested             // Good: guard clauses
if (user) {
  if (!user) return null;
  if (user.active) {
    if (!user.active) return null;
    return doWork(user);
    return doWork(user);
  }
}
```

---

## 4. Consistency and TypeScript

- Match the existing style, naming, and structure. **Follow the output of Prettier / ESLint** (don't fight it with personal preference).
- Avoid `any`; express intent with types. Use `unknown` plus narrowing.
- Turn magic numbers/strings into constants in `lib/constants.ts` etc. (UPPER_SNAKE_CASE).
- Write similar things in similar shapes.

---

## 5. Don't overdo it

- **Don't abstract too early or over-generalize** under the excuse of readability (the same as the design principle of "don't round things off").
- Write it plainly first, and tidy up only **once duplication or complexity actually becomes a problem**.

---

## 6. What is machine-enforced (ESLint)

Naming case, the `any` ban, complexity, function length, nesting depth, identifier length, etc. are checked mechanically by `.eslintrc.json`.
**Following lint satisfies most of these guidelines.** What can't be checked mechanically — writing the "why", splitting responsibilities, the right amount of abstraction — is a matter of human and AI judgment.
