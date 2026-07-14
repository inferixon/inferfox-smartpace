# Inferfox SmartPace

Inferfox SmartPace is a local-first Firefox extension in early development. Its goal is to learn a stable YouTube playback pace per channel and reduce repeated manual speed corrections.

Instead of treating every speed change as a preference, SmartPace is designed to derive one stable signal from a meaningful viewing session. A channel prediction becomes eligible for automatic use only after enough valid local evidence exists.

Current support target: desktop Firefox 142 or newer.

Inferfox SmartPace is independent and is not affiliated with YouTube or Google.

## Current Foundation

- Pure speed-profile model with bounded normalization.
- Median prediction from recent session evidence.
- Readiness and confidence derived from sample count.
- Firefox local-storage schema boundary.
- Options dashboard for Learn/Auto mode, global default, profile inspection, and resets.
- Toolbar popup that opens the dashboard.
- No accounts, telemetry, analytics, cloud sync, or remote executable code.

## Planned MVP Behavior

- `Ctrl + wheel` playback-rate control on eligible YouTube videos.
- One stable speed sample per valid viewing session.
- Up to 10 recent samples per channel.
- Automatic median application after 3 valid samples in Auto mode.
- Learn mode that records evidence without changing the starting speed.
- Conservative exclusion of Shorts, live streams, and explicitly identified music content.
- Bounded handling of YouTube SPA navigation and player replacement.

YouTube session observation and automatic speed application are not implemented yet. The current repository is a public, testable product foundation rather than a completed release.

## Install For Foundation Testing

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on...**.
3. Select `manifest.json` from this folder.
4. Open the toolbar popup and then the dashboard.

The current build validates local dashboard and profile-model behavior only. It does not yet control YouTube playback.

## Data Handling

Inferfox SmartPace stores settings and channel speed evidence only in Firefox extension storage on the user's device.

It does not send viewing data to the developer and does not use telemetry, analytics, accounts, cloud sync, tracking, or remote policy services.

See [PRIVACY.md](PRIVACY.md).

## Development Checks

```powershell
Get-Content -Raw manifest.json | ConvertFrom-Json | Out-Null
Get-ChildItem src,tests -Filter *.js -Recurse | ForEach-Object { node --check $_.FullName }
node tests/model.test.js
```

Before an AMO upload, after YouTube integration exists:

```powershell
$root = Get-Location
npx --yes web-ext lint --source-dir $root --warnings-as-errors
```

## License

MIT. See [LICENSE](LICENSE).
