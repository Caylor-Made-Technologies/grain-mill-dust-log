# Mill Dust Log

A phone-friendly housekeeping log for combustible-dust inspections in flour mills and similar food plants.

- Area checklist with due / overdue status (every shift, daily, weekly, monthly)
- Record what was found, what was done, how it was cleaned, a note, and a photo
- Heavy buildup must be cleaned or flagged; flagged items stay open until resolved
- Entries can't be edited after saving (audit-friendly)
- Report with coverage by area and CSV copy for spreadsheets
- Works offline once loaded; data stays on the device (localStorage + IndexedDB for photos)

## Run it
Open `dust-log/index.html` in a browser. No build step.

## Notes
- The starter areas are generic examples. Rename them to match your plant.
- Don't commit real plant data, procedures, or photos to this repo.
- Dust thresholds and cleaning methods should follow your plant's written program and applicable standards (e.g. NFPA 61 / 652), not this app.

## Next steps
- Installable PWA (manifest + service worker)
- Accounts and syncing so several operators share one log
- QR codes per area
