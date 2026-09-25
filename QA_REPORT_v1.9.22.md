# CineTale v1.9.22 QA Report

## Scope
Focused correction of the Projects interaction regression reported in the live deployment, while preserving the v1.9.21 production stack.

## Confirmed fixes
- Removed all project-card anchor wrappers.
- No underline/link styling is used for project cards.
- Entire project card (except management controls) opens the selected project.
- Direct click listener attached to every rendered project card.
- Enter/Space keyboard activation supported.
- Rename/Duplicate/Archive/Delete stop propagation and remain independent.
- Google OAuth account chooser remains enabled.

## Verification
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- JavaScript syntax: PASS
- Static IDs checked: 177
- DOM references checked: 440
- API routes checked: 16
- Project anchor wrapper absence: PASS
- Direct per-card click wiring: PASS
- Keyboard opening: PASS
- Management-action isolation: PASS
- No project-card text decoration: PASS
- ZIP integrity: PASS

## Live acceptance
1. Open Projects.
2. Click the cover/title/body of Project A; Project A must open in Studio.
3. Return to Projects and click Project B; Project B must open.
4. Click Rename; it must rename without opening the project.
5. Confirm project titles/descriptions are not underlined.
