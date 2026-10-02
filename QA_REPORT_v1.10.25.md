# CineTale v1.10.25 QA Report

## Release focus
Navigation visibility and saved-media discoverability after existing-project shot migration.

This release addresses the live finding that the selected Studio navigation item could become visually hidden and that existing clips appeared to have disappeared after upgrading an older project to the multi-shot timeline.

## Implemented safeguards
- Active top navigation now has its own high-contrast gradient background and no longer depends solely on the sliding indicator being visible.
- The navigation indicator is kept inside the navigation stacking context instead of being placed behind it.
- Production workflow steps are now keyboard- and pointer-accessible.
- Clicking **Video** jumps directly to Scene production / saved clips.
- Clicking **Final** jumps directly to Final Assembly.
- Clicking **Story** jumps to Story Review; Cast opens the Characters view; Storyboard/Audio also route to the scene-production workspace.
- The v1.10.24 existing-project shot migration remains intact and its migration marker advances to v1.10.25.
- Existing `videoUrl`, durable source-storage, synchronized-storage, generation, and lip-sync state are not cleared by this UI/navigation release.
- The Story shot plan remains visible under each scene and existing valid media remains mapped to its matching shot identity.

## Verification
- JavaScript/MJS syntax: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: 85/85 PASS
- New v1.10.25 navigation/media-visibility regression: PASS
- Existing-project multi-shot migration regression: PASS
- Deep QA: 188 static IDs, 464 DOM references, 19 API routes, 3 local assets, 227 files checked

## Live-provider limitation
No paid Veo, ElevenLabs, or Sync Labs generation was executed from this environment. This release does not claim a new provider/media-generation behavior; it protects and exposes already-saved media and improves navigation into the production workspace. Live acceptance is to deploy, open the same project, verify the active Studio tab remains visible, click Video, and confirm the existing scene clips/shot plans are present.
