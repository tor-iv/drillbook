# Tally for iPhone + Apple Watch

Native SwiftUI companions to the drillbook server. The phone is the daily
driver (Today, Chat, Food, Coach, Setup + HealthKit sync + nudges); the watch
is for quick logging (tap counters, dictate to the coach) and a complication
showing what's still open. Both talk to the server directly with a device
token minted from the PIN (`POST /api/auth/device`).

## Layout

- `project.yml` — XcodeGen spec. `Tally.xcodeproj` is generated and gitignored:
  `brew install xcodegen && cd apple && xcodegen generate`.
- `TallyKit/` — shared Swift package: API client (`TallyAPI` actor), wire
  models (field names = server JSON), Keychain token store, offline tap queue,
  and the notebook theme (bundled Staatliches + Permanent Marker, OFL/Apache).
- `Tally/` — iOS app. `Health/HealthSync.swift` posts the Health Auto Export
  payload shape to `/api/health-sync`; `Notifications/Nudges.swift` pulls
  `/api/nudge/latest` from a BGAppRefreshTask and posts local notifications.
- `TallyWatch/` — watchOS app; receives the token over WatchConnectivity and
  caches DayStatus into the App Group for the complication.
- `TallyWatchWidgets/` — WidgetKit complication (circular + rectangular).

## One-time machine setup (needs sudo, once per Xcode update)

Xcode 26.6 ships without its platform components installed, and CoreSimulator
lags behind until first launch runs. Until then every `xcodebuild` and `simctl`
call fails with "iOS 26.5 is not installed" / "CoreSimulator is out of date".

```sh
sudo xcodebuild -runFirstLaunch
xcodebuild -downloadPlatform iOS
xcodebuild -downloadPlatform watchOS
```

## One-time signing setup (free Apple ID)

1. `open apple/Tally.xcodeproj`, Xcode → Settings → Accounts → add the Apple ID.
2. Select the Tally target → Signing & Capabilities → Team = your personal team.
   Xcode fills `DEVELOPMENT_TEAM`; copy that ID into `project.yml` so
   `xcodegen generate` keeps it.
3. Plug in the iPhone, trust the computer, run once from Xcode. On the phone:
   Settings → General → VPN & Device Management → trust the developer app.
4. The paired Watch installs alongside (Watch app → Tally → Install if not).

## Every week: re-sign (free accounts expire after 7 days)

```sh
cd apple && xcodegen generate
xcodebuild -project Tally.xcodeproj -scheme Tally \
  -destination "id=<iPhone UDID>" -allowProvisioningUpdates build install
```
`xcrun devicectl list devices` prints the UDID. A paid developer account
removes this chore (TestFlight builds last 90 days) and unlocks APNs.

## Build + type-check from the CLI

```sh
# simulator (after first-launch setup)
xcodebuild -project Tally.xcodeproj -scheme Tally -destination 'platform=iOS Simulator,name=iPhone 17' build
xcodebuild -project Tally.xcodeproj -scheme TallyWatch -destination 'platform=watchOS Simulator,name=Apple Watch Series 11 (46mm)' build
# compiler-only check that needs no simulator (what CI/agents can always run)
IOS=$(xcrun --sdk iphoneos --show-sdk-path)
swiftc -emit-module -module-name TallyKit -emit-module-path /tmp/tk/TallyKit.swiftmodule -sdk "$IOS" -target arm64-apple-ios17.0 -parse-as-library $(find TallyKit/Sources -name '*.swift')
swiftc -typecheck -sdk "$IOS" -target arm64-apple-ios17.0 -I /tmp/tk -parse-as-library $(find Tally -name '*.swift')
```

Dev builds: set the server in the Login screen's "Server" disclosure (DEBUG
only) to `http://<Mac LAN IP>:3000`; the Info.plist allows local networking.

## What only a physical device can prove

HealthKit has no data on the simulator, dictation needs a real watch, and
background refresh timing is iOS's call. After the first install: Setup →
Allow → Sync now, then check `/api/health-sync` logged today's metrics.
