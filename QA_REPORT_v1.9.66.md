# CineTale v1.9.66 QA report

## Root cause fixed
The prior Preview Sequence builds were read-only with respect to provider calls, but **closing Preview still forced a full `renderStudio()` remount**. That remount re-evaluated scene synchronization state and could remount a speaking scene as sync-gated/non-clickable, even though its synchronized asset had just been playable. This is why Preview could appear to "break" Scene 2/5 after closing.

## v1.9.66 correction
- Preview Sequence remains fully read-only and does not call lip-sync generation.
- Closing Preview does **not** remount Studio.
- Normal scene players remain mounted, preserving their current validated synchronized source and clickability.
- Preview lock is still released correctly.
- No new Sync Labs job is created by Preview.
- Existing global language/cultural-context work from v1.9.65 is preserved.

## Validation
All 31 `scripts-*.mjs` checks passed after updating carry-forward tests to the v1.9.66 cache/version contract, including smoke, deep QA, audio, lip-sync, player lifecycle, Sync Labs resilience/adoption, responsive layout, Scene 2 migration, sync-gated playback, multi-scene preview, read-only preview state, multilingual/cultural intelligence, and the new no-remount Preview regression.

Deep QA: 178 static IDs, 457 DOM references, 19 API routes, 115 files checked.
