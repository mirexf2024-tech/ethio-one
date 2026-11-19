# Ethio One Mobile

Expo SDK 58 app workspace for Android and iOS.

## Run locally

```bash
cd apps/mobile
npm install
npx expo install --fix
npx expo start
```

Use Expo Go or a development build to preview. Android and iOS share this application code.

## Current scope

- Ethio One branded welcome screen
- Afaan Oromoo, Amharic and English UI language switch
- Ethio ID registration and sign-in form layouts
- Form actions are intentionally preview-only until the authentication API, validation, OTP and account recovery flows are implemented.

API base URL is configured in `app.json`. Do not put secrets or private API keys in this repository.
