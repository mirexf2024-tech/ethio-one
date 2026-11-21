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

The API foundation, PostgreSQL module registry, multilingual public website dashboard, and mobile welcome / Ethio ID account screens are in place. The mobile app is connected to the live API for email registration, email OTP verification, sign-in, password reset, refresh-token sessions, sign-out, profile, roles and notifications. This does not mean the entire platform is production-complete: identity verification beyond contact verification is not implemented; phone OTP is not enabled in the current mobile registration flow; wallet and payment operations are not implemented; and the 19 service tiles are currently a service directory/preview rather than completed service experiences. All 19 platform modules remain marked planned in the production registry. See [Service Readiness](server/SERVICE-READINESS.md) for the module-by-module status.

## Safety

Never commit API secrets, database passwords, OTPs, signing credentials or personal identity documents. Keep the legacy Ethio Call project and its database separate from Ethio One.
