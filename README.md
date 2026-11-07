# Ishara

Interpreter dispatch agent for UAE Sign Language. A Deaf resident forwards an appointment message, reviews the inferred details, and approves before the agent contacts interpreters. The agent offers the slot to qualified interpreters in waves, confirms in English and Arabic, briefs the interpreter, keeps a pre-warmed backup, and replaces the interpreter automatically if they cancel.

## Run locally

```bash
# API, from the repository root (fictional-data demo, rules-based)
cd api
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -m pytest
DEMO_MODE=1 LLM_PROVIDER=none .venv/bin/python -m uvicorn --factory ishara.main:create_app --reload --host 127.0.0.1 --port 8001

# Web, in a second terminal from the repository root (Node.js 24)
cd web
npm ci
ISHARA_API_URL=http://127.0.0.1:8001 npm run dev -- --hostname 127.0.0.1 --port 3001
```

Open http://127.0.0.1:3001. These commands explicitly connect the frontend on `3001` to the API on `8001`, avoiding other local projects. Run each server in its own terminal and leave both running. The API command works without activating the virtual environment. The frontend command overrides a stale `ISHARA_API_URL` in `web/.env.local`; without an override, the proxy defaults to port `8000`. Development output goes to `web/.next-dev`; production builds use `web/.next`, so building does not overwrite the running development server's chunks.

Verify both servers with `curl -fsS http://127.0.0.1:8001/api/health` and `curl -fsS http://127.0.0.1:3001/api/health`; both should return `{"ok":true}`. If the frontend says the service is unavailable, check that the API is running on the same port as `ISHARA_API_URL`. `npm run start` requires a successful `npm run build` first; use `npm run dev` for local editing. Stop the server before reinstalling dependencies or removing its build output. Do not run two development servers against the same `web/.next-dev` directory.

`.env.example` documents settings; the API reads process environment variables, rather than loading that file automatically. For local production-style operator sign-in, set `DEMO_MODE=0`, a random `ISHARA_OPERATOR_KEY` of at least 32 characters, and `OPERATOR_COOKIE_SECURE=0` only for local HTTP. Public deployments keep secure cookies enabled.

## Language, appearance and Dana

The shared display controls switch the interface between English and Arabic, including right-to-left reading order. They also offer light, dark or device-controlled appearance, three text sizes, high contrast, reduced motion, and text-first mode. Preferences are saved on the current browser. Incoming appointment text, names, free-text notes and operator audit messages retain their source language; the language switch does not claim to translate them.

**Dana / دانة** is the resident's small animated guide. Her written messages explain whether the request is being read, awaiting review, matching, confirmed, being replaced, escalated or completed. The visual is decorative and hidden from assistive technology; text-first mode hides it and reduced-motion settings suppress animation. Dana's animation is not sign language and does not replace a qualified interpreter.

## Request review and coordinator queue

The home page is the resident's request form. Submitting opens a private request page for review; after confirmation, the resident follows matching and arrival updates there. Coordinator is a staff workspace in Menu, available after operator sign-in or in explicit demo mode. Residents do not need that workspace to request an interpreter. Help, privacy information and display settings are in Menu.

After parsing, requests remain in `reviewing` until the resident confirms the place, Dubai date/time, duration, domain and sign language. The private requester link allows corrections and approval; no interpreter receives an offer before approval. Telegram also requires the requester to confirm the parsed appointment and accepts private chats only; groups and channels cannot create or act on requests.

Operator sign-in uses an HttpOnly session cookie. Request lists, interpreter invites, metrics, the full activity stream and the coordinator queue require operator access outside explicit demo mode. Requester and interpreter live streams use their private link token and send refresh signals scoped to that role. Keep invite links private: possession of a link grants that role's access.

When local matching is exhausted, a durable escalation appears in the operator's coordinator queue. A coordinator can acknowledge it with a note, and the requester sees whether it is still awaiting acknowledgment. This is an in-app work queue, not an email, SMS or promise that somebody has been notified. A real pilot needs a staffed queue and a response procedure.

## Arrival updates, remote support and signed confirmation

- The assigned interpreter can share a 5, 10 or 15 minute arrival estimate, or report arrival, from their invite page or the demo console. The requester's private page updates through the existing live stream and polling. Estimates are interpreter-reported, without GPS tracking. An elapsed estimate asks for a new update; it never claims the interpreter has arrived. Cancelling clears the old interpreter's estimate.
- When all local matches are exhausted, the requester can open [CDA Sanad Relay](https://www.cda.gov.ae/en/sanad-relay-center). The default portal is `https://sanadrelay.cda.gov.ae/`; set `REMOTE_INTERPRETER_URL` in the API environment to another approved HTTPS service, or leave it empty to disable the handoff. This opens the external service; it does not book an interpreter or bypass provider registration and availability. No appointment information or private tokens are sent in the link. Provider sign-in and an actual call still need acceptance testing.
- Set `CONFIRMATION_VIDEO_URL` in the API environment to a reviewed, licensed Emirati Sign Language video. A path such as `/sign/confirmed.mp4` is served from `web/public/sign/confirmed.mp4`; an HTTPS video URL also works. Playback uses native controls, never autoplays, and retains a written alternative if the recording cannot load. No confirmation recording is bundled: the official material found online describes other services, not an Ishara booking.

The generic confirmation recording must sign this exact message: **“An interpreter has been confirmed for your appointment. Read their name and your appointment details on this page.”** It confirms booking status only; names, dates and places remain in the written confirmation. Have Emirati Sign Language users review the recording and its meaning before enabling it. Keep the signer’s full signing space visible. The player shows a text equivalent in English or Arabic.

Restart the API after changing these environment variables. On an existing database, startup adds the arrivals table without replacing requests.

## DeafBlind accessibility verification

The requester page has a saved **Text-first mode** that turns off video, flashing and vibration while retaining written updates. Arrival announcements change by the minute, rather than every second. The staff message uses a native modal dialog for keyboard focus containment, Escape to close, and focus return. Network failures leave a visible stale-data warning.

Software checks do not establish Braille display compatibility. Real hardware testing has not been completed. Run these checks with DeafBlind participants and record the display model, firmware, screen reader/version, browser, OS, language and pass/fail result:

| Setup | Checks |
| --- | --- |
| NVDA + a refreshable Braille display on Windows, with Chrome and Firefox | Navigate headings and controls using display keys; read status, appointment, confirmation and ETA; receive an update without losing focus. |
| VoiceOver + a paired Braille display on iOS, with Safari | Read and activate controls; enable text-first mode; verify it survives reload; open and dismiss the staff message; verify focus returns. |
| English and Arabic, including the participant's preferred Braille translation table | Verify language changes, reading order, names, Dubai dates/times and minute values with the participant. |

Exercise confirmation, 5-minute ETA, revised ETA, elapsed estimate, explicit arrival, interpreter cancellation/replacement, no local match, failed video and network loss. Ensure no essential information depends on video, colour, sound, vibration or visual position. Verify the external Sanad Relay journey separately; a video service is not a substitute for tactile interpreting or accessible text support for every DeafBlind user.

API regressions: `api/.venv/bin/python -m pytest api/tests -q`. Web compilation and types: `cd web && npm run build`.

## Language model (optional)

Everything works with `LLM_PROVIDER=none`. To let a model read messy messages and write plain-language summaries:

```bash
ollama pull qwen2.5:7b-instruct
LLM_PROVIDER=ollama LLM_MODEL=qwen2.5:7b-instruct uvicorn --factory ishara.main:create_app --port 8000
```

Optional hosted model: use an OpenAI-compatible endpoint and set `LLM_PROVIDER=openai`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`. Check that provider's data handling and usage terms before enabling it. The model never decides who gets the job; matching is deterministic. At most two model parsing jobs run per API process; additional requests use the rules immediately and still require resident review. This bounds concurrent work, not monthly provider spend. Leave `LLM_PROVIDER=none` for the zero-cost, offline parsing path.

## Deploy

The frontend and API deploy separately. The current API needs a long-running process, one worker and persistent SQLite storage; its offer-expiry timer and Telegram polling run inside that process. Do not deploy this API as a Vercel Function or increase its replica count. [Vercel Functions have execution-duration limits](https://vercel.com/docs/functions/configuring-functions/duration); converting the API to that model would require separate durable scheduling and database work.

### Vercel frontend

Import [Pranav63/Ishara](https://github.com/Pranav63/Ishara) and set:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root Directory | `web` |
| Node.js | `24.x` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | Next.js default |
| Environment variable | `ISHARA_API_URL=https://your-public-api-origin` |

Set the [Root Directory in project settings](https://vercel.com/docs/builds/configure-a-build). Put `ISHARA_API_URL` in the required Production/Preview environments, then redeploy: [environment changes apply to new deployments](https://vercel.com/docs/environment-variables). The rewrite is resolved at build time. Leave `NEXT_PUBLIC_API_URL` unset so requests and operator cookies stay on the frontend's origin. Never expose operator, Telegram or model keys through `NEXT_PUBLIC_*`.

Without `ISHARA_API_URL` on Vercel, the frontend can build but booking and live updates remain unavailable. A frontend deployment alone is not a working dispatch service.

### Persistent API host

Build with the API directory as the Docker context:

```bash
docker build -t ishara-api ./api
```

Use a single always-running container, mount persistent storage at `/data`, expose the container's `PORT` (default `8000`) behind HTTPS, and use `/api/health` as its health check. Set these API environment variables:

| Variable | Production value |
| --- | --- |
| `DEMO_MODE` | `0` |
| `ISHARA_OPERATOR_KEY` | A unique secret of at least 32 characters, stored in the host's secret settings |
| `OPERATOR_COOKIE_SECURE` | `1` |
| `ISHARA_DB` | `/data/ishara.db` |
| `ALLOWED_ORIGINS` | Exact frontend origins, comma-separated; no wildcard |
| `LLM_PROVIDER` | `none` initially; model use is optional |

The app refuses production startup without an operator key. A new production database has no interpreter roster: production does not provision the fictional demo people. Reviewed onboarding is still needed before real dispatch. SQLite schema additions run at startup; back up the database before deployments and test restoring it. Keep demo and production databases separate; switching off demo mode does not erase existing data. Use a staging API and database for Vercel previews instead of connecting them to residents' production data. Configure the HTTPS proxy to allow streaming responses and disable buffering for `/api/stream`; clients also refresh through polling.

For Railway, connect the GitHub repository, select Root Directory `/api`, and set the Railway Config File to `/api/railway.json`. The checked-in configuration selects the Dockerfile, one instance, `/api/health`, and an always-running process. Attach a persistent volume at `/data` before deploying. [Railway's config-file path is relative to the repository, independently of the service root](https://docs.railway.com/deployments/monorepo).

Railway Hobby includes $5 of monthly resource usage, but its [minimum nonzero compute hard limit is $10](https://docs.railway.com/cli/usage). A $5 alert is not a $5 spending cap. Compute limits apply to the whole workspace and can stop other projects; Railway Agent has a separate spending limit that can be set to $0 without disabling Ishara. Obtain approval for the actual budget before starting billed services. A hard limit is a shutdown threshold, not a guarantee that taxes or retained storage cannot add to the bill. Do not enable sleeping while relying on offer expiry and Telegram polling.

### Release checks

GitHub Actions runs API regressions on Python 3.12 and a clean frontend installation/build on Node.js 24 for pushes to `main` and pull requests. After deployment, verify `/api/health` through the frontend origin, operator login/logout, private requester and interpreter links, approval before dispatch, arrival updates, cancellation/replacement, and coordinator acknowledgment. Verify that an unauthenticated visitor cannot open operator data or the global stream. Exercise a stream reconnect; a disconnect must not lose the visible appointment state.

## Data handling

Pattern-based redaction removes recognized Emirates IDs, phone numbers, email addresses and long numbers from appointment messages and visit notes before storage or model processing. It does not anonymize names, free-text medical/legal details, or every possible identifier. Appointment data and private link tokens remain sensitive. Interpreters in `seed.py` are fictional and must be replaced through a reviewed onboarding process before real dispatch.

For a real pilot, select approved hosting and model processing locations, define consent and retention/deletion procedures, protect backups, add monitoring and abuse controls, and test with local Deaf and DeafBlind participants. Production operator protection and scoped streams reduce exposure; they do not establish a security or accessibility certification. Reviewed signing videos, an actual remote-provider call and physical Braille-display tests remain separate acceptance checks.
