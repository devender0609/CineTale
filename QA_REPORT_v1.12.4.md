# CineTale v1.12.4 QA Report

Release: **Professional Studio Layout Refinement**

## Scope
- Reworked the approved-story Studio into one continuous workspace instead of a detached left-sidebar/dashboard layout.
- Episode navigation is now horizontal and compact.
- Episode header is smaller, lighter, and editorial rather than a large dark poster.
- Compact continuity/production status is reduced to a slim utility toolbar.
- Guided/Auto scenes show only one active workspace with less visual chrome.
- Guided/Auto hides redundant coverage/final-toggle noise until advanced controls are requested.
- Advanced shot controls are presented as a compact inspector action rather than a large empty area.
- Final production stays visually dormant until meaningful scene progress exists.
- Existing story gating, continuity, multilingual/cultural safeguards, media recovery, dialogue sync, duplicate-generation prevention, and final assembly behavior preserved.

## Validation
- Dedicated v1.12.4 Studio layout regression: **12/12 passed**.
- Full script regression/runtime/QA set: **139/139 passed**.
- JavaScript/MJS syntax checks: **163/163 passed**.
- `npm run check`: passed.
- `npm run smoke`: passed.
- `npm run qa:deep`: passed.
- Deep QA before packaging: **206 static IDs, 520 DOM references, 19 API routes, 3 local assets, 333 files checked**.

## Provider note
No intentional paid Veo or lip-sync generation was submitted for this layout release. Smoke/deep QA exercised fallback and quota paths; expected simulated/provider-limit logs did not fail the suite.

## Release gate
The exact packaged ZIP is extracted and rerun through the same validation before delivery.
