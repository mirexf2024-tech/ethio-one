# Ethio One

**One ID · Many Services** — an Ethiopia-first digital services platform.

## Repository layout

- `index.html` — public landing page (kept separate from the mobile app).
- `server/` — Node.js API foundation and PostgreSQL schema.
- `apps/mobile/` — Expo / React Native Android and iOS application.
- `.github/workflows/mobile-ci.yml` — mobile dependency and TypeScript validation.

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

The API foundation, PostgreSQL module registry and initial mobile welcome / Ethio ID screens are in place. The mobile registration and sign-in screens are UI previews only. Authentication, OTP, identity verification, wallet operations and the 16 service modules must be implemented and tested before production use.

## Safety

Never commit API secrets, database passwords, OTPs, signing credentials or personal identity documents. Keep the legacy Ethio Call project and its database separate from Ethio One.
