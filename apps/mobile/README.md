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

- Registration, sign-in, email OTP verification, session refresh, logout, and password recovery screens call the Ethio One API.
- API base URL is configured in `app.json`.
- Email OTP is the only enabled verification channel while SMSHub account KYC is pending.
- Resend's shared testing sender is used temporarily; it is not suitable for public production registration. A verified sending domain is required before sending to all users.
- SMS verification can be enabled after SMSHub approval and end-to-end delivery tests.

Do not put secrets or private API keys in this repository.
