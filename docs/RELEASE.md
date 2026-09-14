# Release Guide

This document describes how to distribute Tukka to testers via **TestFlight** (iOS) and **Google Play Internal Testing** (Android), using **EAS Build** for artifact creation.

Testers install the app once from an invite email and receive automatic update notifications for every new release.

---

## Phase 0 — Accounts to create (once)

Estimated total: ~30 min of active work, plus 24–48h of waiting for Apple to activate.

1. **Apple Developer Program** — $99/yr — <https://developer.apple.com/programs/enroll>
   - Enroll as **Individual** unless you have a registered company (Organization requires a D-U-N-S number).
   - Activation takes 24–48h.
2. **Google Play Console** — $25 one-time — <https://play.google.com/console/signup>
   - Choose **Personal** account type (no D-U-N-S needed).
   - Activates in ~15 min.
3. **Expo account** — free — <https://expo.dev/signup>
   - Required for EAS Build.

You can start Phase 1 while Apple's approval is pending.

---

## Phase 1 — Local + project setup (once)

### 1.1 Install and log in

```bash
npm install -g eas-cli
eas login
```

### 1.2 Initialize EAS on the project

```bash
eas init
```

Adds `extra.eas.projectId` to `app.json` linking it to your Expo account.

### 1.3 Create `eas.json`

At the repo root:

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development"
    },
    "preview": {
      "distribution": "internal",
      "environment": "preview",
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true,
      "environment": "production"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "APP_STORE_CONNECT_APP_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

`eas.json` must exist before `eas build:version:set` — since EAS CLI 12+ the command writes `appVersionSource` into that file and errors out if it's missing.

The Apple ID and Team ID are deliberately not in `eas.json`, which is committed. EAS
prompts for them on first run, or you can set `EXPO_APPLE_ID` in your shell to skip
the prompt. `ascAppId` stays because it is the public App Store number and keeping it
lets EAS skip the app-creation step.

### 1.4 Configure remote versioning

```bash
eas build:version:set
```

Pick **remote** for both platforms when prompted. EAS will manage the build number so you don't have to bump it by hand.

### 1.5 Update `package.json` scripts

```json
"build:ios": "eas build --platform ios --profile production",
"build:android": "eas build --platform android --profile production",
"submit:ios": "eas submit --platform ios --latest",
"submit:android": "eas submit --platform android --latest"
```

### 1.6 Ignore secrets

Add to `.gitignore`:

```
play-service-account.json
```

### 1.7 Set EAS environment variables

`.env` is gitignored, so EAS cloud builds never see it. Without these values the JS bundle throws on launch and Android testers see an instant crash.

Push the public app keys from your local `.env` into every EAS environment the build profiles use:

```bash
# production ← production profile (Play / TestFlight)
# preview    ← preview APK/IPA install links
# development ← EAS dev clients
eas env:push --path .env --environment production --force
eas env:push --path .env --environment preview --force
eas env:push --path .env --environment development --force
```

Confirm they landed:

```bash
eas env:list production
eas env:list preview
```

Required for the app to boot: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Optional: `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`, `EXPO_PUBLIC_UNSPLASH_ACCESS_KEY`. Do not put `EXPO_PUBLIC_DEV_EMAIL` / `EXPO_PUBLIC_DEV_PASSWORD` on `production` or `preview`.

---

## Phase 2 — iOS / TestFlight (once)

### 2.1 Create the app record in App Store Connect

- Go to <https://appstoreconnect.apple.com> → **My Apps** → **+** → **New App**.
- **Platform**: iOS
- **Bundle ID**: `com.tukka.app` (must match `app.json`)
- **Name**: `Tukka`
- **SKU**: any unique string, e.g. `tukka-001`

### 2.2 First build + submit

```bash
npm run build:ios:prod       # ~15-25 min, runs on EAS cloud
npm run submit:ios      # uploads to App Store Connect
```

- First run: EAS asks to generate signing credentials — accept, it handles the certificate and provisioning profile.
- You'll enter your Apple ID and an **app-specific password** (create one at <https://account.apple.com/account/manage> → App-Specific Passwords).

### 2.3 Set up the TestFlight external testing group

In App Store Connect → your app → **TestFlight** tab:

1. Wait for the uploaded build to finish processing (~10 min, you'll get an email).
2. Fill in **Test Information** (email, description, feedback URL) — one-time.
3. **External Testing** → **+** → create a group, e.g. "Beta Testers".
4. Add tester emails.
5. Add the build to the group → **Submit for Beta App Review**.

The first external build waits ~24h for Beta App Review. Subsequent builds go through in minutes with no review.

### 2.4 Tester onboarding (iOS)

Each tester receives an email inviting them to test Tukka. They:

1. Install **TestFlight** from the App Store.
2. Tap the redeem link in the email → **Install**.

From then on, TestFlight auto-updates or shows an update badge on every new release, plus a push notification.

---

## Phase 3 — Android / Play Internal Testing (once)

### 3.1 Create the app in Play Console

- <https://play.google.com/console> → **Create app**
- **App name**: `Tukka`
- **Default language**, **App or Game**: App
- **Free or paid**: Free

Fill the initial questionnaire (ads declaration, content rating, target audience, data safety). ~30 min, tedious but mandatory.

### 3.2 Create a service account for `eas submit`

Follow <https://docs.expo.dev/submit/android/#creating-a-google-service-account-key>. Summary:

1. Play Console → **Setup** → **API access** → link a Google Cloud project → create a service account.
2. In Google Cloud, grant the service account the **Service Account User** role.
3. Download the JSON key → save at the repo root as `play-service-account.json`.
4. Confirm `play-service-account.json` is in `.gitignore` (from step 1.6).
5. Back in Play Console → **API access** → **Grant access** for the service account → **Admin (all permissions)**, or at minimum **Release manager** on the Internal testing track.

### 3.3 First build + first manual upload

The very first build must be uploaded manually — Play Console won't accept API submissions until an artifact exists in the track.

```bash
npm run build:android:prod        # produces an AAB
```

- Download the AAB from the EAS build page.
- Play Console → **Testing** → **Internal testing** → **Create new release** → upload the AAB → save & roll out.

### 3.4 Set up the tester list

**Internal testing** → **Testers** tab:

1. Create an email list, add tester emails.
2. Copy the **opt-in URL** at the bottom of the page.
3. Email that URL to your testers.

### 3.5 From now on, submit via CLI

```bash
npm run submit:android
```

Uses the service account to push new builds straight to the Internal testing track — no manual upload.

### 3.6 Tester onboarding (Android)

Each tester:

1. Opens the opt-in URL on their Android phone.
2. Taps **Become a tester** → **Download it on Google Play** → install.

From then on, updates arrive automatically through the Play Store like any normal app.

---

## Phase 4 — The release loop (every new version)

Whenever you want to ship an update:

```bash
npm run build:ios:prod && npm run submit:ios
npm run build:android:prod && npm run submit:android
```

- Build numbers auto-increment (thanks to Phase 1.3).
- Bump the marketing version in `app.json` (`"version": "1.0.1"`) only when you want testers to see a new user-facing version number.
- TestFlight and Play Store notify testers automatically.

### Optional — OTA updates for JS-only changes

For fixes that don't touch native code (no new native modules, no `app.json` native config changes), skip the rebuild entirely:

```bash
npx expo install expo-updates
eas update:configure          # one-time
eas update --branch production --message "fix login bug"
```

Testers get the new JS bundle the next time they open the app — no reinstall, no email.

---

## Phase 5 — Skipping Beta App Review (iOS)

Beta App Review can drag on for 24h+ on the first submission, and occasionally on subsequent ones (new permissions, marketing version bumps, significant "What to Test" changes). Two options let you get a build on a device **today**, no review required.

### Option A — Internal TestFlight (fastest)

Internal testers **skip Beta App Review entirely** — the build is available as soon as it finishes processing (~10 min after `eas submit`).

Trade-off: each tester must be added as a user in your App Store Connect team. Cap: 100 internal testers.

1. App Store Connect → **Users and Access** → **+** → invite the tester's Apple ID email.
2. Role: **App Manager** or **Developer**. Assign them to the Tukka app.
3. Tester accepts the invite email → signs in to App Store Connect once.
4. App Store Connect → your app → **TestFlight** → **Internal Testing** → **+** → create a group (e.g. "Core Team") → add the tester → add the build.
5. Tester gets a TestFlight invite immediately and installs like any other TestFlight build.

Best for: yourself on a second device, cofounder, a handful of close testers who don't mind being on the ASC team.

### Option B — Ad-hoc `preview` build (no ASC access needed)

Produces a signed `.ipa` that installs directly on **registered devices only** (up to 100 unique iOS devices per membership year). No TestFlight, no Apple review, no ASC user.

Trade-off: you need each tester's **device UDID** upfront, registered through EAS.

1. Register each tester's device:

   ```bash
   eas device:create
   ```

   EAS prints a registration URL + QR code. The tester opens it in Safari on their iPhone, taps **Register**, and reboots. One link can register many devices.

2. Build with the `preview` profile (already defined in `eas.json`):

   ```bash
   npm run build:ios     # eas build --platform ios --profile preview
   ```

3. When the build finishes, EAS shows an **install URL** and QR code on the build page. Send the URL to your testers — they open it in Safari on the registered device and tap **Install**.

Best for: a non-technical tester who can scan a QR code but shouldn't be on your App Store Connect team.

### When to use which

| Situation                                            | Use                              |
| ---------------------------------------------------- | -------------------------------- |
| You need to test on your own second device right now | Internal TestFlight              |
| A cofounder or close teammate needs the build today  | Internal TestFlight              |
| A friend / early user without an Apple dev account   | Ad-hoc `preview` build           |
| Wider beta group (>20 people, no device registration) | External TestFlight (Phase 2.3) |

Android has no equivalent problem — Play Internal Testing has no review. `npm run submit:android` puts the build in testers' Play Store within minutes.

---

## Troubleshooting

| Symptom                                                   | Fix                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Android install from the tester link opens then closes    | The release bundle is missing `EXPO_PUBLIC_SUPABASE_*`. Run `eas env:list production` — if empty, follow §1.7, then rebuild and resubmit. |
| `eas submit` iOS asks for password every time             | Save the app-specific password in your login keychain or set `EXPO_APPLE_APP_SPECIFIC_PASSWORD` in your shell env. |
| Play Console rejects the AAB: "Version code already used" | Ensure `autoIncrement: true` is set in the `production` profile in `eas.json` and versioning is `remote`.          |
| iOS build fails on credentials                            | Run `eas credentials` and let EAS regenerate the certificate + provisioning profile.                               |
| TestFlight build stuck "Processing" for >1h               | Contact Apple support — usually resolves itself, occasionally the upload needs to be re-submitted.                 |
