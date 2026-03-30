# Backend Roadmap

## Recommended production stack

- Mobile app: Expo / React Native
- API: Next.js route handlers or NestJS
- Database: Postgres
- Auth: Clerk or Supabase Auth
- Analytics: PostHog or Mixpanel
- Payments: RevenueCat + Stripe
- AI layer: OpenAI for recommendations, summaries, and coach chat

## Core entities

- users
- health_profiles
- goals
- meals
- food_entries
- workouts
- workout_sessions
- daily_checkins
- coach_messages
- subscriptions

## First API set

- `POST /auth/login`
- `GET /me`
- `PATCH /me/health-profile`
- `GET /dashboard`
- `POST /meals`
- `GET /meals`
- `POST /workouts/sessions`
- `GET /insights/weekly`
- `POST /coach/chat`

## Important launch concerns

- Medical claims and disclaimer review
- Food database licensing
- Sensitive health data encryption
- Consent flows for wearable and lab integrations
- Region-specific compliance for India, US, and EU expansion
