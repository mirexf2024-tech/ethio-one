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

## Authentication

- Registration, sign-in, email/SMS OTP verification, session refresh, logout, and email/SMS password recovery screens call the Ethio One API. Users choose the OTP channel in the app.
- API base URL is configured in `app.json`.
- SMSHub KYC has been approved. The server-side SMS adapter is ready; live sending still requires `SMSHUB_API_KEY` in Render.
- Resend's shared testing sender is used temporarily; it is not suitable for public production registration. A verified sending domain is required before sending to all users.
- The SMS API key must remain a Render secret and must never be placed in the mobile app or GitHub. Verify with SMSHub's `/api/test` endpoint before sending a real paid OTP.

Do not put secrets or private API keys in this repository.
