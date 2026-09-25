# CineTale v1.9.28 — Projects / Video Compatibility / Toolbar Polish QA

## Scope
Only three areas were changed from the v1.9.27 working tree:
1. Projects opening restored to the proven v1.9.17 native `.project-open` button pattern, while retaining quota-safe navigation from newer builds.
2. Scene/library video playback compatibility improved by removing a hard-coded `video/mp4` source type and making `/api/video-file` sniff MP4 vs WebM container bytes when upstream MIME is generic.
3. Projects Search / Show / Sort toolbar received visual polish only; search/filter/sort behavior is unchanged.

No intentional changes were made to story generation, cast, consent, cloud sync, image generation/persistence, voice, dialogue-first video generation, final assembly, auth flow, or provider settings.

## Verification performed
- `node --check app.js` — PASS
- `node --check api/video-file.js` — PASS
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- Deep QA: 177 static IDs, 440 DOM references, 16 API routes, 3 local assets, 42 files — PASS
- Project native button structure present — PASS
- Direct `[data-project]` click wiring present after each Projects render — PASS
- Quota-safe `openProject()` navigates before deferred bulk save — PASS
- No anchor/link project wrapper — PASS
- No hard-coded scene `<source type="video/mp4">` — PASS
- Scene video lazy loading (`preload="none"`) — PASS
- `/api/video-file` byte-range behavior — PASS
- `/api/video-file` WebM sniff from `application/octet-stream` — PASS
- Projects toolbar polished focus/mobile/dark-mode CSS present — PASS

## Important live limitation
The production Google/Veo video asset itself and the user's Firefox browser could not be exercised with the user's production credentials from this environment. The proxy/MIME logic and client markup were tested locally/simulated, but final Firefox playback must still be confirmed after deployment with one real clip.

## Recommended acceptance test after deployment
1. Settings → System Health: confirm `App build: v1.9.28`.
2. Projects → click project A → back → click project B.
3. Open a previously generated clip and press Play once.
4. Confirm Search / Show / Sort look polished and still filter/sort correctly.
