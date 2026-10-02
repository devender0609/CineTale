
## Packaged ZIP verification

The release ZIP was extracted into a fresh directory and verified independently from the working source.

- Packaged-copy `scripts-*.mjs`: **48 / 48 passed**
- Packaged-copy JavaScript/MJS syntax: **72 / 72 passed**
- ZIP integrity: **no compressed-data errors**
- Packaged-copy Chromium stable-player test: **passed**
  - 3 players mounted
  - invalid saved URL recovered to a playable confirmed fallback (`readyState=4`)
  - exact Scene 1 player survived an ordinary Studio update
  - **0 additional `loadstart` events** during the update
  - playback continued while another scene's setting changed
  - **0 additional media loads** during that unrelated update
- Packaged-copy validated synchronized-speaking test: **passed**
  - synchronized player loaded (`readyState=4`, 6.0 s)
  - player was unmuted before playback
  - exact synchronized player remained mounted across Studio update
  - playback continued and `currentTime` advanced
  - player remained unmuted after update

The package contains no test MP4 fixtures; browser QA used external copies of the user's previously supplied CineTale MP4 files.
