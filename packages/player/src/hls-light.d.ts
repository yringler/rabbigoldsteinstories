// hls.js ships no types for its "light" build (no subtitles, alternate audio or DRM: the same API).
declare module "hls.js/light" {
  import Hls from "hls.js";
  export default Hls;
}
