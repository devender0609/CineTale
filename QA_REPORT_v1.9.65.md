# CineTale v1.9.65 QA Report

## Release scope
- Preview Sequence clickability/state hardening.
- Global/open-ended language support foundation.
- Expanded world-language presets plus custom language/dialect/community-language entry.
- Cultural/place/tradition context propagated through story, character, image and video generation prompts.
- No change to paid Sync Labs generation policy: Preview remains read-only and must not create lip-sync jobs.

## Important behavior
- Preview Sequence acquires a read-only lock that pauses Studio background lip-sync warmup for that project/unit.
- Closing Preview clears the lock and re-renders Studio so validated synchronized videos regain normal controls immediately.
- Existing synchronized scene state is not invalidated by Preview.
- Language input is open-ended: a language does not need to be in the preset list; custom values remain supported.
- Unknown/custom speech language is not forced to English. Provider auto-detection/fallback can be used when no mapped locale/code exists.
- Cultural context is creator-controlled and is used as context, not as a stereotype template. Prompts instruct the model to stay general instead of inventing uncertain sacred, historical or community-specific facts.

## Validation performed
- `npm run check` — PASS
- Main smoke suite — PASS
- All existing `scripts-*.mjs` regression suites — PASS
- v1.9.65 multilingual/cultural intelligence + preview clickability regression — PASS
- JS/MJS parse/execution regressions — PASS through suite

## Live-provider limitation
This environment does not have the user's production Vercel/Sync Labs/ElevenLabs browser session, so live paid provider behavior was not executed. The release preserves the existing live-provider interfaces and tests them through the established mocked/regression contracts. Provider support and pronunciation quality vary by language/voice/model; CineTale therefore accepts open-ended languages but should surface provider capability rather than pretending every provider has equal quality in every language.
