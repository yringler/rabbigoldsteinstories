import { createStore } from "@goldstein/player";

/** This site's localStorage namespace: keys are `goldstein:bedtime:<key>`; never throws. */
export const store = createStore("bedtime");
