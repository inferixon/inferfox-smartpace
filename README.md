# Inferfox SmartPace

Inferfox SmartPace is a local-first Firefox extension that learns a stable YouTube playback pace per channel and reduces repeated manual speed corrections.

Instead of treating every speed change as a preference, SmartPace is designed to derive one stable signal from a meaningful viewing session. A channel prediction becomes eligible for automatic use only after enough valid local evidence exists.

Current support target: desktop Firefox 142 or newer.

Inferfox SmartPace is independent and is not affiliated with YouTube or Google.

## Current Behavior

- Pure speed-profile model with bounded normalization.
- Median prediction from recent session evidence.
- Readiness and confidence derived from sample count.
- Firefox local-storage schema boundary.
- `Ctrl + wheel` playback-rate control in bounded `0.1x` steps by default.
- A temporary on-video speed overlay while `Ctrl` is held over the video.
- A local Options setting to tune the wheel step from `0.05x` to `1.0x`.
- One duration-weighted stable sample per manually adjusted video.
- Silent median application after 3 valid videos from a channel.
- Unknown and unready channels remain untouched.
- Options dashboard for profile inspection and resets.
- Toolbar popup that opens the dashboard.
- No accounts, telemetry, analytics, cloud sync, or remote executable code.
- Up to 10 recent samples per channel.
- Shorts and live pages remain untouched.
- YouTube SPA navigation and player replacement are reconciled without an infinite playback-rate fight.
- No confirmation prompts, operational switches, or global fallback speed.

## Install For Local Testing

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on...**.
3. Select `manifest.json` from this folder.
4. Open an ordinary YouTube `/watch` video.
5. Hold `Ctrl` and use the mouse wheel to adjust playback speed.
6. Optionally open the dashboard to tune the wheel step.
7. Keep the chosen speed for at least 20 seconds and watch for at least 30 seconds after the first correction.
8. Open the dashboard to inspect the learned sample.

## Data Handling

Inferfox SmartPace stores settings and channel speed evidence only in Firefox extension storage on the user's device.

It does not send viewing data to the developer and does not use telemetry, analytics, accounts, cloud sync, tracking, or remote policy services.

See [PRIVACY.md](PRIVACY.md).

## Third-Party Font

The on-video speed overlay bundles Orbitron Bold under the SIL Open Font License 1.1. See [assets/fonts/Orbitron-OFL.txt](assets/fonts/Orbitron-OFL.txt).

## Development Checks

```powershell
Get-Content -Raw manifest.json | ConvertFrom-Json | Out-Null
Get-ChildItem src,tests -Filter *.js -Recurse | ForEach-Object { node --check $_.FullName }
Get-ChildItem tests -Filter *.test.js | ForEach-Object { node $_.FullName }
```

Before an AMO upload:

```powershell
$root = Get-Location
npx --yes web-ext lint --source-dir $root --warnings-as-errors
```

## License

MIT. See [LICENSE](LICENSE).
