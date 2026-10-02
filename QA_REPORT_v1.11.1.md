# CineTale v1.11.1 QA Report

## Release focus
Create-page progressive disclosure and production-cost clarity without removing Global Story Intelligence.

## UX changes validated
- Creative Direction now shows only Visual style, Story language, and optional World context by default.
- Detailed region/community, belief context, festival/tradition, time/place, cultural grounding, multilingual behavior, and sacred-treatment controls remain available under **World & Culture → Edit world details**.
- The dense duplicate Global Story Intelligence panel was removed from the default path.
- Production profiles retain Economy / Balanced / Cinematic and now have an explicit selected-radio visual treatment.
- Primary creation CTA is planning-oriented (`Build episode plan`, `Build short plan`, `Build story plan`, `Build movie plan`) so story planning is not confused with paid media production.
- Desktop hero is shortened so the creation controls arrive sooner.
- Existing field IDs and persistence contracts were preserved so project editing and generation APIs continue to receive the same data.

## Regression / validation results
- 133 / 133 script-level regression/runtime/QA scripts passed.
- 157 / 157 JavaScript/MJS files passed `node --check`.
- `npm run check` passed.
- `npm run smoke` passed.
- `npm run qa:deep` passed.
- Deep QA inspected 199 static IDs, 500 DOM references, 19 API routes, 3 local assets, and 321 files.
- Dedicated v1.11.1 progressive-disclosure regression: 12 / 12 passed.

## Provider-cost safety
No new paid Veo generation or paid lip-sync operation was submitted for this release. Existing durable-media, duplicate-generation prevention, provenance recovery, single-flight dialogue-sync, and player lifecycle protections remain in place.

## Test-environment notes
Deep QA intentionally exercises quota/error/fallback branches and logs simulated Gemini quota/delivery failures and ElevenLabs fallback behavior. Those logs are expected test-path output and do not represent a new release failure.

## Live verification still required
A deployed browser pass is still required for real-provider behavior, responsive visual review, and the exact production workflow under the user's Vercel environment. Static/runtime regression testing cannot prove third-party provider success.
