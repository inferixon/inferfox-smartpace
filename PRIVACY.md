# Privacy Policy

Inferfox SmartPace is a Firefox extension that keeps its settings and learned playback evidence on the user's device.

## Data Stored Locally

Inferfox SmartPace stores the following data in Firefox extension storage:

- local evidence thresholds;
- the local `Ctrl + wheel` step;
- YouTube channel identifiers and display labels;
- recent stable playback-speed samples per channel;
- profile update timestamps.

## Backup Files

When a user explicitly chooses **Export JSON**, SmartPace writes a local JSON backup through the browser download flow. It contains SmartPace profiles and the local wheel-step setting only.

When a user explicitly chooses **Import JSON**, SmartPace validates the selected backup locally before replacing its own local SmartPace data. Backup files are never uploaded or transmitted.

## Data Transmission

Inferfox SmartPace does not send viewing data to the developer and does not use telemetry, analytics, accounts, cloud sync, tracking, or remote services.

The YouTube integration reads the active YouTube page and player state locally to identify the current video and channel. It does not send learned profiles to Inferfox or another service.

## Reset Controls

Users can remove one channel profile or all learned channel profiles from the extension dashboard. Importing a valid SmartPace backup replaces SmartPace profile data and the local wheel-step setting.

## Third-Party Affiliation

Inferfox SmartPace is independent and is not affiliated with YouTube or Google.
