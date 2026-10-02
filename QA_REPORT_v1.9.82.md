# CineTale v1.9.82 QA / Release Gate

## Release objective
Fix the two live Studio defects reported after v1.9.81: speaking scene players appeared silent because stale/unvalidated source media remained mounted, and Studio took too long to present media because all scene videos competed for full preload and each paused player was programmatically seeked on load.

## Changes verified
- Existing already-paid synchronized assets are now recovered/validated in parallel when Studio opens.
- Once a saved synchronized asset validates, the currently mounted scene player is atomically switched to that synchronized file without remounting the scene card.
- Validated synchronized playback explicitly restores normal native audio (`muted=false`).
- Studio-open recovery does not authorize new legacy lip-sync spending. A fresh paid submission can resume only when `lipSyncAutoPending` was already set by the user's earlier video-generation action.
- Scene video preload changed from `auto` to `metadata`, preventing every scene from competing for a full remote download on Studio entry.
- Removed the automatic first-frame seek (`currentTime≈0.08s`) that forced decode/seek work on every paused player and could contribute to flicker/delayed presentation.
- Existing poster/storyboard art remains available immediately while video metadata loads.
- No technical status text is added over video frames.

## Automated release gate
Working source:
- 47 / 47 regression / smoke / deep-QA scripts passed.
- 71 / 71 JavaScript / MJS syntax checks passed.
- `scripts-v1982-studio-media-recovery-regression.mjs` specifically checks metadata preload, removal of initial seek, parallel saved-sync recovery, mounted-player adoption, audible validated playback, and no-surprise-billing behavior.

## Important limitation / not claimed
This environment cannot reproduce the user's exact deployed Vercel + Firefox + live Google Veo / ElevenLabs / Sync Labs session. Therefore live browser/provider behavior is not claimed as production-proven. The release specifically addresses the code paths that caused the reported silence and delayed media presentation, and the exact packaged copy is re-verified below.

## SQL
No new SQL migration is required for v1.9.82.
