# Playing a playlist as one HLS stream

Status: implemented for bedtime (2026-11-27). Kids and library still play one file per story; `@goldstein/player` supports streams for any site that wants them.

## 1. Why

On a locked phone, the moment between two stories is the risky one. iOS can suspend a page once its audio stops. After that, the next file's `play()` may make no sound, or the lock screen's play button may stop working. WebKit bugs about this have been fixed and broken again across iOS 15–18:
- 173332, 261554 and 221413: the next track doesn't start from `ended` while locked.
- 261858 and 295518 (still open, home-screen app): the same, plus audio that "plays" in silence after the app is reopened.

The old player made exactly that gap at every story. The `#t=start,end` fragment paused the element, then script code swapped `src` and called `play()`.

A single continuous stream has no gap. The browser's media stack plays from one story into the next, and on Safari it also fetches the segments itself. Page JavaScript only has to notice which story is playing, for the title and the sleep timer, and it can do that late.

Android Chrome was mostly fine before. Chrome barely throttles a page that is playing sound. It benefits anyway: a story change is no longer a new load.

## 2. Frame tables (`data/catalog/audio_frames.csv`)

All 2,368 files (1,184 originals and 1,184 AI-cleaned copies) are MPEG-1 Layer III, mono and constant bitrate, with a LAME "Info" frame:

| Copy | Profile | Frame | Padding phase |
|---|---|---|---|
| Original | 96 kbps, 44.1 kHz | 313 or 314 bytes | 1800 |
| Clean | 128 kbps, 48 kHz | 384 bytes | 0 |

So frame `k` (frame 0 is the Info frame, audio starts at frame 1) starts at:

```
first_byte + floor((k * 144000 * bitrate_kbps + phase) / sample_rate)
```

The phase was measured on every frame of sample files. `tools/4-r2/scan_audio_frames.py` reads the ID3 size and header of each file from the public host with a few range requests. It checks that the file size is a whole number of frames and that 3 random predicted frames start with a frame sync, then writes `id, variant, first_byte, frame_count, bitrate_kbps, sample_rate, size_bytes`.
- **When to rerun:** after uploading or re-encoding audio, including new clean copies. It needs no credentials.
- **Stale rows:** the data build uses a row only when its `size_bytes` matches the current file, so a re-encoded file loses HLS until rescanned instead of streaming wrong bytes.
- **New profiles:** a new bitrate or sample rate needs its phase added to `PHASE` in both the script and `packages/playlists/src/hls.ts`, after checking it on whole files.

The public pool (`units.json`) carries the table as `frames: { <id>: { original, clean? } }`.

## 3. The stream (`packages/playlists/src/hls.ts`, `GET /playlists/hls.m3u8`)

The URL lists the stories: `/playlists/hls.m3u8?v=o|c&i=<id>~<start>~<end>_<id>~…`, with seconds to 2 decimals.
- **No state on the server.** The API builds the playlist from the pool (only recordings in it; no KV) and caches it for an hour.
- **It always matches what the client holds.** That holds for a pinned snapshot, a tombstoned edition or an earlier night.

The playlist is RFC 8216 VOD (`EXT-X-ENDLIST`), version 4:
- **Segments** are `EXT-X-BYTERANGE` slices of the files on R2, about 30 s each; a tail under 8 s is merged into the one before. Nothing is re-encoded or copied.
- **Discontinuities:** `EXT-X-DISCONTINUITY` sits between stories, except where the next story continues the same file at the next byte (consecutive spans join seamlessly).
- **Story cuts** fall on frame boundaries, about 26 ms. Story `i` is cut so that it ends within half a frame of `Σ (end_sec − start_sec)` over stories `0..i`. That holds for both copies, so the client computes story times with `hlsChapters(items)`, with no frame tables.
- **ID3 timestamps:** the segments carry none. RFC 8216 §3.4 asks for an ID3 PRIV timestamp on packed audio; hls.js doesn't need one (checked in Chromium). **Not yet confirmed on Safari:** if Safari refuses them, the player falls back to one file per story, and a Worker can prepend a 73-byte tag to each segment (the lab page in this branch's history, `worker/lab.ts`, had the code and a test page for both variants).
- **Join clicks:** a decoder may click faintly where a story is cut out of an episode, because of the MP3 bit reservoir. It's inaudible in practice.

The R2 bucket has a CORS rule (`*`, GET/HEAD, header `range`, exposing `Content-Length, Content-Range, Accept-Ranges`). hls.js needs it; Safari's built-in player doesn't.

## 4. The player (`packages/player/src/stream.ts`, bedtime)

**Engine** (`pickStreamEngine`):
- **Native:** Safari (macOS, iOS, iPadOS and every iOS browser), with `audio.src = <m3u8>`.
- **hls.js:** browsers with Media Source Extensions (Chrome, Edge, Firefox, Android) use `hls.js/light` 1.7.4, a separate chunk loaded only there. It buffers up to 10 minutes ahead, so a phone that throttles the page still has audio queued. hls.js could also run on iOS through ManagedMediaSource, but it isn't used there: that would move segment loading back into page JavaScript, which iOS suspends.
- **None:** the site plays story by story.

**`StreamAudio`** is the `AudioLike` the Player drives. It hands `.m3u8` sources to hls.js and everything else to the element. A stream that fails twice fires `error` on the element.

**Bedtime** (`bedtime-player.ts`):
- **Each story is a Track.** Its `url` is the stream (`clean_url` is the clean stream, when every story has a clean copy) and its `start_sec`/`end_sec` are the story's times on the stream. The Player is otherwise unchanged.
- **Next and previous** are seeks.
- **A story ending** is noticed on `timeupdate`, with no change of source and no seek (`Player.goTo` skips a seek when the playhead is already there). If several stories passed without a `timeupdate` (a throttled locked phone), the player follows the playhead (`Player.follow`, `trackAt`) rather than seeking back.
- **"Stop after this story"** (the iOS sleep timer) pauses at the boundary. The stream will have played a moment of the next story, so the player seeks back to that story's start. The 4-minute hard stop still applies.
- **AI-improved sound** swaps between the two streams at the same position.
- **Fallback:** any stream failure (an `error` event, or nothing playing after 8 s) switches to one file per story, at the same story and position, for the rest of the visit. Failures include no built-in HLS and no hls.js, a 404 because a recording has no frame table, or the network.
- **The session snapshot is unchanged:** playlist, story index, position in the story.

The service worker never caches `/playlists/hls.m3u8`; audio isn't cached either.

## 5. Testing on devices

Lock the phone during a story and wait past at least two story boundaries. Check both a Safari tab and the home-screen app on iPhone, plus Chrome on Android. The lock screen should show each new title (it may lag on iOS), and next/previous should work from the lock screen.
