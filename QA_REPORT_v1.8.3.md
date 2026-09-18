# CineTale v1.8.3 QA Report

## Why this build exists
Live QA showed the project could reach Veo Fast request/day or request/minute limits while other video capacity remained available. The automatic final-production flow also submitted missing scenes too quickly for low-tier provider limits.

## Changes verified
- Draft/Fast one-click route defaults to `veo-3.1-lite-generate-preview`.
- Balanced retains Veo Fast and may fall back to Lite on quota/rate errors.
- Cinematic retains the premium route and does not silently downgrade.
- Auto-production submission scheduler allows at most two starts in a rolling 60-second window and exposes a visible waiting status.
- 429/quota errors are classified as `VIDEO_QUOTA` by the server.
- Completed scene clips remain persisted and are not regenerated on resume.
- Fallback use is persisted as an internal scene route and surfaced only as “Efficient fallback” to creators.
- Existing final assembly, approved voice mixing, download/share, auth, Library, mobile responsiveness and manual scene controls remain intact.

## Validation completed
- Package/JSON check: PASS
- Full smoke suite: PASS
- JS/MJS syntax scan: PASS
- API/lib import scan: PASS
- Mocked quota fallback request: PASS
- Merge marker scan: PASS
- Duplicate HTML ID scan: PASS
- Local asset reference scan: PASS
- ZIP integrity: PASS
