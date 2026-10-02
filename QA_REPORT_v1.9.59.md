# CineTale v1.9.59 QA Report

## Scope
Balanced Scene Card / Empty-Space Removal

The Scene Studio card was restructured so the left media column no longer ends after the 16:9 video while the right content continues downward. The media column now owns the existing Cinematic coverage and Include in final controls beneath the video. The action/quality row remains full-width beneath both columns.

## Key behavior
- Video keeps its native/intrinsic aspect ratio and remains uncropped (`object-fit: contain`).
- Scene media is wrapped in `.scene-media-column`.
- Existing Cinematic coverage and Include in final controls now render in `.scene-media-support` under the video.
- Those controls were removed from the right copy column; no duplicated UI was introduced.
- Desktop scene card uses a balanced 43% media / remaining copy layout.
- At <=1050 px the scene card stacks to one column and the media support controls use a compact 2-column row.
- At <=680 px support controls stack to one column.
- Scene action buttons and video-quality/framing controls remain full-width under the scene content.
- Sync Labs pipeline revision intentionally remains `v1.9.56-production-sync-hardening`; existing synchronized assets are not invalidated by this UI release.

## Release validation
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS (177 static IDs, 451 DOM references, 19 API routes, 100 files)
- scene audio regression: PASS
- approved voice mix regression: PASS
- lip-sync regression: PASS
- stable player lifecycle regression: PASS
- lip-sync status resilience: PASS
- lip-sync adoption/resume: PASS
- carried-forward v1.9.48-v1.9.58 regressions: PASS
- new v1.9.59 balanced scene-card regression: PASS
- full JS/MJS/API syntax sweep: PASS

The Gemini quota and ElevenLabs fallback messages produced during the smoke suite are intentional mocked failure-path coverage, not failed tests.

## Live limitation
This environment cannot open the user's deployed Vercel/Firefox session, so the exact final pixel appearance in that live browser is not claimed as visually verified. The DOM structure and responsive CSS for the reported empty-space condition are directly regression-tested.
