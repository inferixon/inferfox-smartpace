# Contributing

Thanks for improving Inferfox SmartPace.

## Scope

Useful contributions include:

- Firefox and WebExtension compatibility fixes;
- YouTube SPA and player-lifecycle handling;
- stable viewing-session evidence logic;
- playback-rate control and accessibility improvements;
- dashboard clarity and responsive behavior;
- AMO review-readiness and documentation fixes.

## Rules

- Do not add telemetry, analytics, accounts, cloud sync, or remote executable code.
- Keep permissions minimal and tied to an implemented runtime path.
- Keep derived prediction and confidence values out of storage source truth.
- Do not treat every playback-rate change as a separate learning sample.
- Avoid `innerHTML` for channel or page-controlled content.
- Do not use YouTube, Google, Mozilla, or Firefox logos in assets.
- Preserve the shared Inferfox dashboard scheme: white surfaces, neutral borders, black primary actions, restrained blue accent, and tokenized CSS.

## Checks

Run before opening a pull request:

```powershell
$root = Get-Location
Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json | Out-Null
Get-ChildItem -LiteralPath (Join-Path $root 'src') -Filter *.js -File | ForEach-Object {
  node --check $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "node --check failed: $($_.FullName)" }
}
node (Join-Path $root 'tests\model.test.js')
```

After YouTube integration is added, manual QA should cover:

- eligible watch-page playback control;
- Learn versus Auto behavior;
- evidence thresholds and median prediction;
- Shorts, live, and music exclusions;
- YouTube SPA navigation and player replacement;
- per-channel and global resets.
