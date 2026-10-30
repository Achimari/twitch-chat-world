# Chat World cartoon sound pack v1

Listen to **preview.mp3** for a 19.2-second sampler. The sampler has 17 highlights; the pack has 32 individual effects.

Exported from this project's existing `public/audio.js` definitions using Chrome OfflineAudioContext. These are synthetic cartoon/chiptune effects with no sampled speech or commercial recordings. Export noise is seeded. Individual clips have peak/RMS gain limits and short edge fades; perceived volume still varies between effects.

## Files

- Individual WAV effects: 48 kHz, mono, 16-bit PCM.
- `preview.mp3` and `preview.wav`: sampler with 0.65-second gaps.
- `manifest.json`: sound IDs, durations, measured levels, source hash, and sampler cue times.

## Preview order

| Starts | Effect |
|---|---|
| 0.30s | jump |
| 1.10s | boing |
| 2.13s | slap |
| 2.97s | fart |
| 4.12s | whoosh |
| 5.15s | rocket |
| 6.60s | sneeze |
| 7.61s | zap |
| 8.51s | boom |
| 9.75s | sparkle |
| 10.67s | beam |
| 12.58s | coin |
| 13.42s | squeak |
| 14.32s | stinger |
| 15.59s | win |
| 16.72s | cash |
| 17.75s | fail |

## Use

Listen in a normal audio player or import individual WAV files into OBS/a soundboard. The app already synthesizes corresponding cues. This export does not change the app's playback path. Future integration should replace a matching synthesized cue, retain the shared audio controls, and avoid playing both versions together.

`win`, `cash`, `coin`, `squeak`, `go`, and `tick` suit race/prediction events. `beam`, `hide`, `alarm`, and `stinger` suit UFO events. These are sound effects rather than recorded voices or background music.

Files are checked for valid PCM, non-silent samples, clipped peaks, fade boundaries, and correspondence with the sound registry. OBS playback and subjective listening have not been verified.
