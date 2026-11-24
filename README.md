# Advent Calendar

A password-protected, multi-year Advent calendar built with Firebase Hosting and Cloud Functions. This repository contains the application code only. It does not include any personal media, calendar data, passwords, signing keys, or Firebase project configuration.

## Run locally

Use Node.js 22 and the Firebase CLI. From the repository root:

Create `functions/.secret.local` (ignored by Git). Set `CALENDAR_PASSWORD` to a local-only password and `CALENDAR_JWT_KEY` to a separate random value of at least 32 bytes. For example, use `openssl rand -hex 32` to generate the signing key. Do not reuse production secrets locally.

```sh
npm ci --prefix functions
npx firebase-tools emulators:start --project demo-advent-calendar --only hosting,functions
```

Open `http://127.0.0.1:18050/` once the emulators are running.

### Add your own calendar

Store media and captions under `functions/private/data/<year>/`, never under `public/`:

```text
functions/private/data/2025/
  calendar.json
  1.jpg
  1-mobile.jpg  # optional
  1.mp4         # optional
```

Use a four-digit year and unpadded file names (`1.jpg`, not `01.jpg`). The metadata is a JSON object keyed by door number. Example only:

```json
{
  "1": {
    "legend": "Photo caption",
    "video": true,
    "videoLegend": "Video caption",
    "videoAspect": 1.7777777778
  }
}
```

Omit all video fields for a photo-only door. An archived year is useful for checking the interface outside December. Door visibility follows the calendar in the browser; the backend enforces login for media, not a date embargo for viewers who already have a valid session.

## Deploy to your own Firebase project

Create a Firebase project with Hosting and Functions enabled. Set `CALENDAR_PASSWORD` and `CALENDAR_JWT_KEY` with `firebase functions:secrets:set` in that project, using a separate random signing key. Then deploy with the project ID explicitly:

```sh
npx firebase-tools deploy --only functions:app,hosting --project YOUR_PROJECT_ID
```

The app serves calendar data, images, and videos from authenticated Function routes. Keep `functions/private/`, `.secret.local`, and service-account files out of version control. Deploying Functions uploads the private media to **your** Firebase project; deploying Hosting alone does not. Change the year, credits, and source link in `public/config.js` as needed.
