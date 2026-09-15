# CineTale Studio v1.5.5

## Polished Create Flow + Narrator Voice Studio

This build extends the natural ElevenLabs audio layer with creator-facing voice controls while preserving CineTale's Auto-first workflow.


### New in v1.5.5
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
