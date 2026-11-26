/**
 * Listener preferences shared by the sites, so all of them use the same key names. Each site keeps
 * its own value in its own store (createStore("<site>")): the setting is per site, never shared
 * (docs/design/ai-audio.md D2).
 */
import type { Store } from "./storage.ts";

/** AI-improved sound on/off. Stored as `goldstein:<site>:ai-audio.v1`; default off. */
export const AI_AUDIO_KEY = "ai-audio.v1";

export const getAiAudio = (s: Store): boolean => s.get<boolean>(AI_AUDIO_KEY, false) === true;

export const setAiAudio = (s: Store, on: boolean): void => s.set(AI_AUDIO_KEY, on);
