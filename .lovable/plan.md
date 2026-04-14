

# Native Mobile App with Capacitor

## What this does
Wraps your existing MeterScan web app into a native iOS and Android app using Capacitor. Your app will run as a real native app on phones/tablets, which is ideal for field technicians.

## Steps

### 1. Install Capacitor dependencies
Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, and `@capacitor/android` to the project.

### 2. Initialize Capacitor
Run `npx cap init` and create `capacitor.config.ts` with:
- App ID: `app.lovable.c2a865928b53415abba81112fd1155ce`
- App Name: `meter-magic-excel`
- Live-reload server URL pointing to the sandbox preview for development

### 3. Set Vite base path
Set `base: './'` in `vite.config.ts` so assets load correctly in the native shell.

### 4. What you need to do on your machine
After I make the code changes, you will need to:
1. Export the project to GitHub via the "Export to GitHub" button
2. Clone it locally and run `npm install`
3. Run `npx cap add ios` and/or `npx cap add android`
4. Run `npm run build && npx cap sync`
5. For **iOS**: Open in Xcode with `npx cap open ios` (requires a Mac)
6. For **Android**: Open in Android Studio with `npx cap open android`
7. Run on a device or emulator from the IDE

For more details, see the Lovable docs: https://docs.lovable.dev/tips-tricks/self-hosting

## Important notes
- iOS builds require a Mac with Xcode installed
- Android builds require Android Studio
- During development, the app live-reloads from the Lovable preview URL
- For production, run `npm run build && npx cap sync` to bundle everything locally

