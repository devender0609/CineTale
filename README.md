# CineTale Studio v1.9.3


## v1.9.3 portrait setup and cast-control update

- **Generate portrait** now opens a Portrait Setup review before any image-generation request is sent.
- Creators can confirm or change portrait style, inferred appearance, and culture/background context before spending quota.
- Project style remains the recommended default, while photorealistic/cinematic, 3D, 2D, storybook, anime, watercolor, graphic novel, clay, devotional, sacred-cinematic, and custom styles are available.
- Existing portraits use the same setup for **Generate alternative**, preserving identity continuity by supplying the locked portrait as a reference when supported.
- Successful portrait generation persists the approved appearance/style and keeps Identity Lock enabled.
- **Generate all portraits** now asks for confirmation and makes quota use explicit before sequential generation.

## v1.9.1 video reliability hotfix
- Single-scene **Generate video clip** now uses the same quota-aware quality fallback as automatic final production.
- Direct Gemini/Veo REST requests retry transient `429`, `408`, `425`, and `5xx` responses with bounded exponential backoff and jitter.
- Short provider `Retry-After` windows are respected; longer cooldowns are returned to the browser instead of hammering the provider.
- Standard/Draft scene requests can fall back to `veo-3.1-lite-generate-preview` when the requested Veo route is quota-limited. Premium remains on the requested premium route.
- Persistent provider throttling now produces a creator-facing cooldown while preserving the scene, storyboard art, cast and all completed work.

- **Complete story first:** idea-mode generation now returns a full audience-readable narrative (`storyText`) before cast, storyboard, audio, image, or video production. Story, Short and Movie must have a complete ending; Episode receives a complete first-episode narrative with a satisfying mini-arc.
- **Story Review in Studio:** the full narrative is shown in a dedicated review panel with word count, language, audience and runtime context. Creators can read the whole story instead of seeing only a synopsis and scene cards.
- **Approve before spending:** new v1.9.0 projects keep paid production actions locked until the full story is approved. This applies to character art, storyboard art, TTS/audio preview, scene video, automatic final production and final rendering.
- **Edit + rebuild safely:** creators can edit the complete story and rebuild the cast/scene plan from that source so production metadata stays aligned with the approved narrative. Existing generated assets trigger a destructive-change warning before rebuilding.
- **Legacy compatibility:** projects created before v1.9.0 remain usable. They are clearly labeled as legacy projects and can optionally generate a full Story Review without silently blocking existing work.
- **Series continuity:** newly generated Episode 2+ units also require a complete `storyText` and enter the same review/approval workflow before production.
- **Cleaner quota language:** backend/provider-limit jargon stays out of normal creator-facing pacing copy. Automatic production continues to use safe request pacing and efficient fallback behavior.

### v1.9.0 validation
- `npm run check`
- `npm run smoke`
- `npm run qa:deep`
- `node --check` on every JavaScript/module file
- all API/lib modules imported successfully
- full-story planner regression tests, next-episode story regression, story-approval gate assertions
- duplicate HTML ID, DOM-reference, route-reference, missing-local-asset, merge-marker and CSS-integrity scans
- ZIP integrity test before delivery

## v1.8.3 — Quota-Aware Video Production

- **Fast automatic production now uses Veo 3.1 Lite by default** for lower cost and better quota headroom. Balanced uses Fast; Cinematic keeps the full-quality route.
- Automatic final production **paces video submissions to a maximum of two starts per rolling minute** instead of firing every scene almost simultaneously. The UI explains when it is waiting to protect provider limits.
- Fast and Balanced automatic production can **fall back to the efficient Lite route** when the preferred route is quota/rate limited. Cinematic does not silently downgrade.
- Completed clips are never regenerated merely because a later scene hits quota. Missing work remains resumable.
- Video quota/rate errors are classified and shown with creator-friendly recovery guidance instead of only appearing in developer logs.
- Final Assembly records when an efficient fallback was used without exposing provider/model names in the normal creator UI.
- Manual scene quality controls remain unchanged, so creators can still deliberately choose Draft / Standard / Premium per scene.

### v1.8.3 validation
- `npm run check`
- `npm run smoke`
- `node --check` on every JavaScript/module file
- all API/lib modules imported successfully
- mocked quota fallback test: Fast quota error → Lite queue success
- duplicate HTML ID, merge-marker and local-asset scans
- ZIP integrity test

## v1.8.2 — Resilient Final Production + Deep QA

- One-click final production is now **resumable** instead of all-or-nothing. Completed scene clips stay saved if the provider is slow, the browser navigates away, or one scene fails.
- Missing selected scene videos are **submitted up front**, then checked with bounded parallel polling so long final-production jobs do not wait for one clip to finish before the next even starts.
- Transient status failures (rate limit, gateway, temporary provider/network errors) use bounded retry/backoff instead of immediately aborting the whole final.
- Final Assembly shows clearer **READY / RENDERING / RETRY / SKIPPED** states and can resume only the missing work.
- Added a visible **Pause** control for automatic production. Pausing keeps completed clips and lets the creator resume later.
- Automatic-production job state is persisted with the project and can recover after normal Studio rerenders/navigation. Cross-tab duplicate-job protection now uses a short heartbeat-style stale lock rather than a long dead lock.
- Final rendering now **preloads scene video and approved ElevenLabs voice assets before MediaRecorder starts**, preventing blank/idle recording time while assets are still loading.
- Final render progress separates asset preparation from actual scene recording and keeps the status visible while rendering.
- Final-video render failures keep the prepared clips and move the project into a recoverable “needs attention” state rather than losing work.
- Scene action typography remains unified and responsive; automatic-production controls also stack cleanly on phone widths.

### v1.8.2 validation
- `npm run check`
- `npm run smoke`
- `node --check` on every `.js` / `.mjs` file
- duplicate HTML ID scan
- missing local asset scan
- referenced API route scan
- button/select handler coverage scan
- merge-marker scan
- ZIP integrity test


## v1.8.1 — One-click final production

- Optional **Include in final** toggle on every scene; skipped scenes are not required for final video.
- **Create final video automatically** lets a creator avoid scene-by-scene generation. CineTale generates only missing selected clips, preserves existing work, applies approved voices, prepares final assembly and renders one final file.
- Fast / Balanced / Cinematic automatic production quality.
- Project-level duplicate-run protection for automatic final production.
- Final-video social handoff for YouTube, Instagram/Reels, TikTok and Facebook, plus native share and download.
- Manual scene production remains available for creators who want control.

# CineTale Studio v1.8.0

## Final Video + Production Polish

### New in v1.8.0
- Unified **Generate art**, **Listen**, and **Generate video clip** typography, height, weight and alignment across desktop/tablet/mobile.
- Added a true **Render full video** step after Final Assembly. CineTale records all generated scene clips into one downloadable final video file in scene order.
- Final rendering mixes the generated scene audio with the approved CineTale/ElevenLabs narrator and character voice tracks. If approved speech runs longer than the short generated scene clip, the visual clip loops while speech completes instead of cutting dialogue off.
- Final videos are stored locally in IndexedDB so the completed file can be reopened from the same browser after refresh.
- Added **Download final video** and **Share final video**. On supported phones/tablets, Share uses the native file share sheet so installed social apps can receive the rendered video. Unsupported browsers fall back to download.
- MP4 is selected when the browser supports MediaRecorder MP4/H.264; otherwise CineTale uses a WebM fallback rather than failing the render.
- Final rendered videos now appear in **Library > Media** alongside storyboard art, scene clips and assembly manifests.
- Regenerating a scene clip invalidates the previous final render state so creators are not shown a stale cut as current.
- Final rendering is bound to the project that started it, so navigating elsewhere cannot accidentally attach the completed file to another project.

### Current rendering model
The final file uses the scene clips that have actually been generated. Story/Short/Episode/Movie all use the same final-render path. The final runtime therefore reflects generated clip coverage plus approved spoken audio, rather than pretending a 20-minute movie exists when only a few short Veo clips have been generated.

### Accounts
Email/password Supabase sign-in, Google OAuth, password recovery, guest mode and session restore remain included. Projects are still browser-local; account identity does not falsely imply cloud project sync.


## World-Aware Voice Filters + Smart Creative Inference

This build extends the natural ElevenLabs audio layer with creator-facing voice controls while preserving CineTale's Auto-first workflow.



### New in v1.6.4
- Fixed Veo 3.1 Lite video request compatibility by removing the unsupported `numberOfVideos` parameter from initial text/image-to-video generation. Veo returns one video per request by design.
- Kept duration, resolution, aspect ratio, person-generation and continuity controls unchanged.
- Added regression coverage so initial Veo requests cannot accidentally reintroduce `numberOfVideos`.


- Full-app QA pass across Create, Projects, Cast, Studio, Library, settings, story/episode/short/movie flows, audio, images, and navigation.
- Genre and language pickers are alphabetized automatically; voice filter menus are alphabetized except age, which keeps a natural Child → Teen → Young adult → Adult → Mature sequence.
- Voice zero-match states now show up to four clearly labeled closest alternatives instead of leaving a blank result area.
- Improved small-text contrast in light mode while keeping the existing CineTale palette.

- Voice filters now narrow results exactly instead of silently restoring unrelated voices.
- Voice language codes such as `en` and `hi` are rendered as English and Hindi.
- Added Tone / style filtering plus active filter chips and clear controls.
- Zero-match states now offer explicit broadening choices instead of overriding the user’s filters.
- Previewed voices highlight while playing; locked voices remain visibly selected in Voice Studio.
- Use & lock updates the current voice in place so creators can compare voices without the modal disappearing.
- Voice Studio filters now always offer meaningful Accent/Region, Age feel, Voice presentation, Use case and Language options instead of collapsing to only “All” when provider metadata is sparse.
- ElevenLabs voice metadata is normalized and conservatively inferred from provider labels/descriptions so filtering is more useful across different voice libraries.
- If a requested filter has no exact match, CineTale keeps the filtered result empty and offers explicit ways to broaden only the language/region or clear all filters; it never silently restores unrelated voices.
- Studio Manage menu has stronger layering, contrast and spacing so it remains readable above the production workflow.
- Story planning now uses an explicit Creative Intelligence rule: infer coherent defaults from the full project context when instructions are incomplete, while preserving creator choices and avoiding unsupported cultural/religious specifics.
- Accent inference is guarded: CineTale must not assign an accent merely from a name, ethnicity, religion or appearance.

### New in v1.5.6
- Cleaner, more colorful Create flow with stronger visual hierarchy and shorter helper copy.
- Story source, voice input, format selection, creative direction and optional controls are easier to scan without adding more steps.
- **Narrator Voice Studio** is now available from Studio > Manage and from Edit performance.
- Preview, select, lock or reset a narrator voice independently from character voices.
- Narrator performance, pace and custom direction persist across the project.
- Narration playback now uses narrator performance settings plus scene-specific narration direction.
- Existing character Voice Studio, Eleven v3 dialogue, speech transcription, image reliability, cultural safeguards and format-aware workflows remain intact.

### New in v1.5.4
- **Voice Studio** on every recurring character, redesigned with clearer color, selection states and larger preview/lock controls.
- Scene voice controls are now highlighted as interactive audio cards instead of subtle metadata chips.
- Selected and suggested voice states are visually distinct, with polished voice identity tiles.
- **Auto voice** remains the default; CineTale can assign a suitable persistent voice on first listen.
- Preview available ElevenLabs voices before choosing one.
- **Use & lock** keeps an approved voice attached to the character across scenes and future episodes.
- **Reset to Auto** returns voice choice to CineTale.
- Simple creative performance presets: Natural, Warm, Calm, Energetic, Dramatic, Mysterious, Playful, Intimate.
- Pace controls: Natural, Relaxed, Quick.
- Optional free-text delivery direction for precise performance notes.
- Editable preview line before assigning a voice.
- Scene cards show the active character voice/performance state and provide a direct entry into Voice Studio.
- **Edit dialogue** is now **Edit performance**, combining dialogue, narration, scene delivery and per-character voice access in one place.
- Existing Eleven v3, Text to Dialogue, narrator voice, multilingual fallback, speech-to-text, cultural fidelity, identity continuity and format-aware workflows remain intact.

## Environment
Required for natural voice generation:
- `ELEVENLABS_API_KEY`

Optional:
- `ELEVENLABS_DEFAULT_VOICE_ID`
- `ELEVENLABS_NARRATOR_VOICE_ID`
- `ELEVENLABS_TTS_MODEL` (defaults to `eleven_v3`)

## Validation
Run:
```bash
npm run check
npm run smoke
```


## v1.5.6 additions
- Explicit **Add / Edit / Remove** recurring-cast controls. Removing a cast member does not silently rewrite existing scene text.
- **Sacred Figure Representation** project control: Auto, Symbolic / unseen, Sacred icon / idol, Visible divine character, and Traditional mythological depiction.
- Character editor can override entity type, sacred identity, representation mode and canonical visual cues for a specific figure.
- Sacred image prompts preserve recognizable high-level iconography while avoiding generic humanization, caricature and unrelated cross-cultural symbols.
- Voice Studio now exposes the full connected ElevenLabs catalog (up to the provider response limit) with search plus Accent / Region, Age feel, Voice presentation and Use case filters.
- Character and narrator Voice Studios accept optional regional/accent direction while keeping accent separate from ethnicity, name or appearance.
- CineTale still recommends voices automatically, but creators can browse and preview many more options before locking.


## v1.6.1
- Studio Manage menu now expands within the header instead of overlapping the production workflow.
- Scene audio shows immediate preparation/generation feedback on first Listen.
- Generated TTS and dialogue audio are cached in the current browser session, so repeat Listen playback avoids another provider round trip and does not consume a second generation request.
- Concurrent duplicate audio requests are deduplicated.
- First-time natural voice generation can still take provider/network time; CineTale now communicates that state instead of appearing frozen.


## Live video generation (v1.6.1)
CineTale can generate per-scene video clips through Google Veo 3.1 using the existing `GEMINI_API_KEY`. Live video remains protected by `ENABLE_LIVE_VIDEO`; set it to `true` in Vercel when ready to spend video credits. Draft defaults to Veo 3.1 Lite at 720p/4s, Standard to Veo 3.1 Fast at 720p/6s, and Premium to Veo 3.1 at 1080p/8s. Short projects use 9:16; other formats use 16:9. When the known cast includes a minor, CineTale uses text-continuity video generation rather than image-to-video because Veo image-conditioned person generation is adult-only. Adult-only scenes can use the generated storyboard as a first-frame continuity reference. Veo-generated dialogue is intentionally suppressed because approved ElevenLabs character/narrator audio is handled separately.

- Fixed Veo `durationSeconds` request type: CineTale now sends a numeric value (4/6/8) instead of a string.


## v1.6.4 video responsiveness
- Draft uses Veo 3.1 Fast at 720p / 4s for speed-oriented previews.
- Video jobs submit immediately and render in the background; the Studio is no longer blocked while waiting.
- Pending jobs resume status polling after Studio rerenders/navigation within the same browser session.
- Adaptive polling checks every 5s initially, then backs off to 8s.
- Duplicate rendering requests are blocked while an operation is active.
- The UI makes the distinction between provider render time and app responsiveness explicit.

## v1.6.5 — Final Assembly Prep
- Adds a scene-order Final Assembly panel to Studio.
- Shows exact clip readiness and prevents final prep until all scene clips are available.
- Adds continuous multi-scene sequence preview without spending new generation credits.
- Locks a final assembly manifest containing scene order, clip URLs, planned timing, voice summary and continuity/canon notes.
- Adds generated video clips and prepared final assemblies to Library.
- Regenerating/replacing a scene clip invalidates the previous assembly so users cannot accidentally export stale ordering.

Note: this build prepares and previews the final sequence. It does not yet transcode all remote clips and mixed audio into one downloadable MP4; that requires the dedicated final render/export service planned next.


## v1.7.1 QA and account polish
- Adds Continue with Google using the configured Supabase Google provider.
- Adds inline account errors/success states, password visibility, password-reset request and recovery password update.
- Restores OAuth sessions from the Supabase callback hash and refreshes expired sessions when possible.
- Hardens scene action/quality layout so controls stay inside scene cards across desktop, tablet and phone widths.
- Keeps final assembly explicit: scene-sequence preparation is supported; a true single-file MP4 render/export still requires the dedicated render backend.

## v1.9.3 Safe video framing
- Added per-scene Framing control: Safe framing (default), Auto, Medium shot, Close-up, and Wide shot.
- Video prompts now protect full faces, headroom, side margins, important hands, and story-critical props from accidental provider crop/zoom drift.
- Two-character scenes explicitly preserve both principal characters in frame unless the creator selects a tighter composition.
- Existing scenes without a framing value automatically use Safe framing.
