# CineTale v1.10.31 — Scene Shell Restoration RC

Targeted fix for scene-card structural restoration during player-preserving incremental renders.

- Restores missing scene copy (title, dialogue, voice, direction) without remounting a valid video player.
- Restores missing Listen / video / quality / framing controls.
- Refreshes or restores the story-shot timeline on every structural scene refresh.
- Restores media support/status controls if absent.
- Preserves sync-gated speaking-source behavior: raw provider audio remains muted until authoritative approved dialogue synchronization is validated.
- Does not regenerate source video.
