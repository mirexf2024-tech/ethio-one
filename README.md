# Ethio One

**One ID · Many Services** — an Ethiopia-first digital services platform.

## Repository layout

- `index.html` — public landing page (kept separate from the mobile app).
- `server/` — Node.js API foundation and PostgreSQL schema.
- `apps/mobile/` — Expo / React Native Android and iOS application.
- `.github/workflows/mobile-ci.yml` — mobile dependency and TypeScript validation.
- `.github/workflows/api-ci.yml` — API syntax and integration tests.

## Mobile app setup

```bash
cd apps/mobile
npm install
npx expo install --fix
npx expo start
```

To create an Android preview APK with EAS Build:

```bash
npx eas-cli build --platform android --profile preview
```

## Current implementation status

The API foundation, PostgreSQL module registry, multilingual public website dashboard, and initial mobile welcome / Ethio ID screens are in place. API health and safe degraded-mode integration tests run in CI. The mobile registration and sign-in screens are UI previews only. Registration includes client-side field checks, but does not create an account; sign-in does not authenticate. Country, region, and city are currently free-text inputs. Authentication, OTP, identity verification, wallet operations and the 18 service modules must be implemented and tested before production use.

## Safety

Never commit API secrets, database passwords, OTPs, signing credentials or personal identity documents. Keep the legacy Ethio Call project and its database separate from Ethio One.
