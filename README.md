# PulsePilot

PulsePilot is a mobile-first Expo/React Native app paired with a local Node API. The current build reads a real exported health profile CSV, searches USDA and Indian food datasets, stores real meal logs, accepts uploaded medical records, and generates health-aware meal recommendations from parsed record data.

## What is in this repo

- A mobile app built with Expo Router.
- A local API server in `server/` built with Node's standard library.
- Profile loading from `HealthProfile_export.csv`.
- USDA foundation foods and Indian food datasets in search.
- Meal logging backed by `data/meal-logs.json`.
- Medical record parsing backed by a free-first extraction chain and stored in `data/medical-records.json`.
- Health-aware meal recommendations grounded in saved profile data, parsed medical updates, and local food datasets.
- A free-first AI provider chain: local parsing first, Hugging Face second, optional Ollama third, OpenAI fallback last.

## Core product angles

- Real values only: no random scores, fake streaks, or invented macros.
- Backend-computed meal logs using real USDA and Indian nutrition data.
- Medical record uploads are parsed into structured diagnoses, medications, vitals, and labs under the current user ID.
- Meal recommendations are generated from those saved health updates rather than generic prompt-only suggestions.
- The backend prefers free resources before paid ones.
- Empty states where workout or long-term insight backends do not exist yet.
- A clean foundation for a future production API and database.

## Screens shipped

- Onboarding wired to the imported profile
- Home dashboard based on saved meal logs
- Nutrition search and logging against USDA and Indian food data
- Profile screen based on the profile export plus medical record upload/parsing
- AI-assisted meal recommendations based on saved health updates
- Honest empty states for areas without real backend data yet

## Run locally

1. Install dependencies with `npm install`.
2. Optional: set a Hugging Face token if you want free OCR plus model-based medical extraction on harder documents:
   `export HF_TOKEN=your_huggingface_token`
3. Optional: run Ollama locally if you want another free local model fallback.
4. Optional: set your OpenAI key only if you want paid fallback parsing and recommendation support:
   `export OPENAI_API_KEY=your_key_here`
5. Start the API in one terminal with `npm run server`.
6. Start Expo in another terminal with `npm run start`.
7. If needed, set `EXPO_PUBLIC_API_BASE_URL` for a physical device.

Indian food support:

- `indian_food1.zip` is used for Indian dish nutrient records.
- `Indian_food2.zip` is used for regional Indian meal records.
- `Indian_foods3.zip` is recipe-oriented, so it is not used for macro calculations yet.

Medical record support:

- Upload PDF, image, or text medical records from the Profile tab.
- The backend stores the file locally in `data/uploads/`.
- Parsed values are saved into `data/medical-records.json` under the current profile ID.
- Meal recommendations use the imported profile, saved medical records, and local food catalogs.

Free-first provider order:

- Default order is `local -> huggingface -> ollama -> openai`
- `local`:
  - text files are parsed with local extraction rules
  - recommendations are generated with local rule-based ranking
- `huggingface`:
  - used only if `HF_TOKEN` or `HUGGINGFACE_API_KEY` is set
  - can OCR scanned PDFs and images, then structure extracted medical values
  - this is the preferred free hosted extraction stage
- `ollama`:
  - used only if available and enabled
  - set `ENABLE_OLLAMA=false` to disable it
- `openai`:
  - used only if `OPENAI_API_KEY` is set
  - this is the paid fallback layer

Useful environment variables:

- `AI_PROVIDER_ORDER=local,huggingface,ollama,openai`
- `HF_TOKEN=...`
- `HUGGINGFACE_API_KEY=...`
- `HUGGINGFACE_PROVIDER=auto`
- `HUGGINGFACE_OCR_MODEL=microsoft/trocr-base-printed`
- `HUGGINGFACE_MEDICAL_MODEL=Qwen/Qwen2.5-7B-Instruct`
- `ENABLE_OLLAMA=true`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `OLLAMA_MEDICAL_MODEL=llama3.1:8b`
- `OLLAMA_RECOMMENDER_MODEL=llama3.1:8b`
- `OPENAI_API_KEY=...`
- `OPENAI_MEDICAL_PARSER_MODEL=gpt-4.1-mini`
- `OPENAI_RECOMMENDER_MODEL=gpt-4.1-mini`

Important note on document types:

- `text/plain` files work with the local parser today.
- scanned PDFs and images now try macOS OCR and Hugging Face OCR first.
- difficult scans may still need Ollama or OpenAI fallback for higher-quality extraction.
- if no fallback provider is configured, those richer document types will not parse successfully.

If you need to expose the API to a phone on your Wi-Fi, start the server with:

- `HOST=0.0.0.0 npm run server`

For iOS Simulator on your Mac:

- `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000 npm run start`

For Android Emulator:

- `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000 npm run start`

For a physical phone on the same Wi‑Fi:

- `EXPO_PUBLIC_API_BASE_URL=http://YOUR_MAC_LAN_IP:4000 npm run start`

## Suggested next build phases

1. Move from file storage to Postgres.
2. Add authentication and multi-user data isolation.
3. Add workout, check-in, and progress APIs.
4. Add barcode scanning and richer regional food data.
5. Add clinician review flows and explicit medical safety approvals.
6. Add subscriptions, analytics, and release pipelines.

## Publishing checklist

- Create production app icons and splash assets.
- Configure Apple and Google developer accounts.
- Add privacy policy, terms, and medical disclaimer.
- Replace file storage with secured production APIs and a database.
- Add telemetry, QA passes, and store listing assets.

## Repo structure

- `app/`: Expo Router screens
- `components/`: reusable UI pieces
- `lib/`: frontend API client and shared types
- `server/`: local backend
- `data/`: persisted meal logs, uploads, and parsed medical records
