#  Rangrez 3.0 — QR Pass & Entry Gate System

**Every smooth check-in starts with a warm welcome.**
The ** Rangrez 3.0 — QR Pass & Entry Gate System** is a mobile QR-pass and entry-management tool for student events. It helps gate teams welcome attendees, verify passes, and keep entry moving smoothly.

Volunteers get a clear, regularly updated view of arrivals and a quick way to verify entry, leaving more time to focus on the people arriving.

## What it does

- **Scan QR passes** with the device camera and get an immediate entry result.
- **Search the attendee roster** by name, UID, or mobile number; filter everyone by entered or not yet entered.
- **Record manual entry** when a student is found in the roster but cannot present a scannable pass.
- **Register walk-ins** at the gate using their UID and name, with optional contact and student details.
- **Track arrivals** on a live dashboard, including registered, entered, and remaining counts.
- **View gate statistics** in the admin dashboard, including QR check-ins, manual entries, walk-ins, and blocked repeat scans.
- **Keep the roster handy** with a locally cached copy while offline. Entry actions still need an internet connection.

## Built with

- [Expo](https://expo.dev/) and React Native
- Expo Camera and Haptics
- React Navigation
- Supabase REST API and database functions
- AsyncStorage for a cached roster

## Getting started

### Requirements

- Node.js 20 or newer
- npm
- An Android or iOS device/emulator, or a browser for the web build
- A configured Supabase project with the gate app's required database functions

### Install and run

From this directory:

```bash
npm install
npm run start
```

Then follow the Expo CLI prompts to open the app on a device or emulator. You can also start a platform-specific target:

```bash
npm run android
npm run ios
npm run web
```

Camera-based QR scanning requires camera permission and a device or emulator with camera support.

## Backend configuration

For local development, set the Expo variables in `gate-app/.env`. Start with `.env.example` and fill in your project values:

```powershell
Copy-Item .env.example .env
```

- `EXPO_PUBLIC_SUPABASE_URL`: your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_KEY`: a public/anon or publishable key
- `EXPO_PUBLIC_APP_KEY`: the gate app key expected by your backend
- `GATE_ADMIN_CODE`: configure the matching admin code in your backend; the mobile app does not read this variable

Expo automatically loads `EXPO_PUBLIC_` variables from `.env` when running Expo CLI commands. For cloud EAS builds, configure the three `EXPO_PUBLIC_` variables in the EAS environment used by the build; the ignored local `.env` file is not a secure way to deliver values to a remote build.

The backend must provide these RPC functions, with the expected request and response shapes used by the app:

| Function | Purpose |
| --- | --- |
| `get_roster` | Fetch the attendee roster |
| `checkin_qr` | Validate a QR pass and record entry |
| `checkin_manual` | Record entry for a roster attendee |
| `add_walkin` | Register and admit a walk-in |
| `get_stats` | Return the admin dashboard statistics |

The app sends check-in and roster requests to Supabase, so a working internet connection is required for those actions. When the connection is unavailable, the app can still display a previously cached roster, but it cannot verify or record new entries.

> **Security:** Never put a Supabase `service_role` key in this mobile app. `EXPO_PUBLIC_` values are embedded in the app bundle and can be inspected; `.env` keeps them out of source control, but does not make them secret. Use only a public/anon or publishable key and enforce authorization, admin access, and ticket validation in your backend functions. Do not rely on the client-side app key as a secret.

## Using the gate

1. Open **Home** to check connectivity and see the latest arrival count.
2. Open **Scan** and point the camera at a student's QR pass.
3. If scanning is not possible, find the student in **Entries** and choose **Mark entry**.
4. Choose **Walk-in** from Home to register an attendee who is not on the roster.
5. To open the admin dashboard, long-press the **Rangrez 3.0** title on Home and enter the admin code.

The scanner currently accepts QR values beginning with `DN26.`. The backend remains responsible for confirming pass validity and preventing duplicate entry.

## Building an Android APK

The EAS `preview` profile is configured for an internal-distribution APK:

```bash
npx eas-cli@latest build --platform android --profile preview
```

For production builds, use the `production` profile configured in `eas.json`:

```bash
npx eas-cli@latest build --platform android --profile production
```

EAS setup and valid project credentials are required before building.

## A note to our volunteers

Thank you for being the first friendly face students meet at the gate. A quick scan keeps the line moving, but your patience and warm welcome are what make every occasion feel special. Let’s make every arrival feel like they belong. 💛
