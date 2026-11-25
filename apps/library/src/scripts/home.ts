/** Home page: tonight's playlists strip (hidden when the files are unavailable). */
export async function init(): Promise<void> {
  const { initStrip } = await import("./tonight.ts");
  await initStrip();
}
