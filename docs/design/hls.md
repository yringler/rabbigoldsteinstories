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
- **When to rerun:** after uploading or re-encoding audio, including new clean copies. It needs no credentials. A file that fails this run (often a network error) keeps its previous row, and the script lists it; rerun to refresh it.
- **Stale rows:** the data build uses a row only when its `size_bytes` matches the current file, so a re-encoded file loses HLS until rescanned instead of streaming wrong bytes. A file whose current size is unknown (no `media.size_bytes`, or a clean manifest row without a size) can't be checked, so its row isn't used either; the build log lists both cases.
- **New profiles:** a new bitrate or sample rate needs its phase added to `PHASE` in both the script and `packages/playlists/src/hls.ts`, after checking it on whole files.

The public pool (`units.json`) carries the table as `frames: { <id>: { original, clean? } }`.

## 3. The stream (`packages/playlists/src/hls.ts`, `GET /playlists/hls.m3u8`)

The URL lists the stories: `/playlists/hls.m3u8?v=o|c&i=<id>~<start>~<end>_<id>~…`, with seconds to 2 decimals.
- **No state on the server.** The API builds the playlist from the pool (only recordings in it; no KV). It's cached like an edition (5 minutes, stale for 10 more), so an exclusion stops the stream within minutes too.
- **It always matches what the client holds.** That holds for a pinned snapshot, a tombstoned edition or an earlier night.

The playlist is RFC 8216 VOD (`EXT-X-ENDLIST`), version 4:
- **Segments** are `EXT-X-BYTERANGE` slices of the files on R2, about 30 s each; a tail under 8 s is merged into the one before. Nothing is re-encoded or copied.
- **Discontinuities:** `EXT-X-DISCONTINUITY` sits between stories, except where the next story continues the same file at the next byte (consecutive spans join seamlessly).
- **Story cuts** fall on frame boundaries, about 26 ms. A story that runs more than one frame past its file's end gets no stream (404), since the stories after it would have to make up the difference. Story `i` is cut so that it ends within half a frame of `Σ (end_sec − start_sec)` over stories `0..i`. That holds for both copies, so the client computes story times with `hlsChapters(items)`, with no frame tables.
- **Mixed copies (`v=c`):** the clean stream uses the clean copy and its frame table for each story that has one, and the original for a story that doesn't. Each story is cut on its own file's frame grid, so the boundaries above still hold.
- **Only live tracks:** every item must be a current track of the pool (its `start_sec` or `intro_start_sec` to `end_sec`) in a unit that `overrides.json` doesn't exclude, the same rule as `tombstone()`. Otherwise the stream is a 404 and the client plays story by story.
- **ID3 timestamps (check this first on an iPhone):** the segments carry none, although RFC 8216 §3.4 requires an ID3 PRIV timestamp (`com.apple.streaming.transportStreamTimestamp`) on every packed-audio segment. hls.js doesn't need one (checked in Chromium). **Safari is not yet confirmed.** If it refuses untagged segments, every iPhone silently falls back to one file per story, so the stream brings no benefit there. The fix is a Worker that serves the segments and prepends a 73-byte tag to each one (the lab page in this branch's history, `worker/lab.ts`, had the code and a test page for both variants); it isn't built, because it would put every audio byte through a Worker.
- **Join clicks:** a decoder may click faintly where a story is cut out of an episode, because of the MP3 bit reservoir. It's inaudible in practice.

The R2 bucket has a CORS rule (`*`, GET/HEAD, header `range`, exposing `Content-Length, Content-Range, Accept-Ranges`). hls.js needs it; Safari's built-in player doesn't.

## 4. The player (`packages/player/src/stream.ts`, bedtime)

**Engine** (`pickStreamEngine`):
- **Native:** Safari (macOS, iOS, iPadOS and every iOS browser), with `audio.src = <m3u8>`.
- **hls.js:** browsers with Media Source Extensions (Chrome, Edge, Firefox, Android) use `hls.js/light` 1.7.4, a separate chunk loaded only there. It buffers up to 10 minutes ahead, so a phone that throttles the page still has audio queued. hls.js could also run on iOS through ManagedMediaSource, but it isn't used there: that would move segment loading back into page JavaScript, which iOS suspends.
- **None:** the site plays story by story.

**`StreamAudio`** is the `AudioLike` the Player drives. It hands `.m3u8` sources to hls.js and everything else to the element. Its error rules with hls.js:
- **A playlist that fails to load** (`manifestLoadError`, `manifestLoadTimeOut`, `manifestParsingError`, `levelLoadError`, `levelLoadTimeOut`) fails at once. hls.js has already retried it, and a 404 won't heal.
- **Any other fatal error** gets one recovery: `recoverMediaError()` for a media error, `startLoad()` at the playhead for a network one. After 30 s of playback the recovery is forgotten, so a blip hours later recovers again. A second error before that fails the stream.
- **The element's own `error`** (an MSE decode error) counts as a media error. While hls.js is attached, `handlesErrors` is true and the Player and bedtime ignore element errors; StreamAudio's listener is added first and lets the event through once it gives up.
- **One fault reported twice:** the element and hls.js can both report the same fault, milliseconds apart. An element error within 1 s of any recovery, and an hls.js media error within 1 s of a recovery that the element's error started, are ignored. Two hls.js media errors in a row are not: hls.js reports each fault once.
- **On failure** it sets `streamFailed`, fires `error` on the element, and keeps the last good playhead in `lastStreamTime`. That is the last seek or the last time that played, since both destroying hls.js and a media recovery reset the element's time to 0.

**Bedtime** (`bedtime-player.ts`):
- **Each story is a Track.** Its `url` is the stream (`clean_url` is the clean stream, when at least one story has a clean copy; the API mixes copies per story) and its `start_sec`/`end_sec` are the story's times on the stream. A clean stream that fails is remembered by URL, so no later story loads it again.
- **Next and previous** are seeks.
- **A story ending** is noticed on `timeupdate`, with no change of source and no seek (`Player.goTo` skips a seek when the playhead is already there). If several stories passed without a `timeupdate` (a throttled locked phone), the player follows the playhead (`Player.follow`, `trackAt`) rather than seeking back. Once the stream has played, a new story is no new load: a later stall waits and never triggers the 8 s fallback, and a jump within a playing stream shows "playing" at once.
- **The end of the stream** (`ended`, or paused within 0.5 s of its duration) ends the playlist and saves the session as finished, even if the index still lags.
- **"Stop after this story"** (the iOS sleep timer) pauses at the boundary. The stream will have played a moment of the next story, so the player seeks back to that story's start. The 4-minute hard stop still applies.
- **AI-improved sound** swaps between the two streams at the same position. When the clean stream fails under hls.js, the Player falls back to the original stream at `lastStreamTime` (the element's time and the Player's own last time can both read 0 by then).
- **Lock-screen seeking:** the Player reports the position state itself (`Player.updatePositionState`, on every site), relative to the story, and `seekto` takes the same story-relative time. Sites report none of their own: a site that reported none would leave the browser on the element's (stream's) time.
- **Fallback:** any stream failure (an `error` event that StreamAudio doesn't handle, or nothing playing after 8 s from a load) switches to one file per story, at the same story and position, for the rest of the visit. The story is the one under the playhead (`trackAt`), not the current index, which can lag on a locked phone; after hls.js gives up, the position comes from `StreamAudio.lastStreamTime`. A playlist the API won't serve (404) falls back at once, with no 8 s wait. Failures include no built-in HLS and no hls.js, a 404 because a recording has no frame table, or the network.
- **The session snapshot is unchanged:** playlist, story index, position in the story.

The service worker never caches `/playlists/hls.m3u8`; audio isn't cached either.

## 5. Testing on devices

On an iPhone, first check that the stream plays at all (the ID3 question in §3): if the player falls back to files at once, the segments need the ID3 tag. Then lock the phone during a story and wait past at least two story boundaries. Check both a Safari tab and the home-screen app on iPhone, plus Chrome on Android. The lock screen should show each new title (it may lag on iOS), and next/previous should work from the lock screen.
