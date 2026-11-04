// tools/tweaks-stub.js — stands in for tweaks-panel.jsx in the deployed site.
// The Tweaks panel only opens inside the design tool (it waits for a message
// from that host), so visitors never see it — but they downloaded all 26 KB of
// it. The build swaps in this stub: the same globals, with the saved defaults
// and nothing rendered. Local previews (app.html without a build) keep the
// real panel.
(function () {
  function useTweaks(defaults) { return [defaults, function () {}]; }
  function none() { return null; }
  Object.assign(window, {
    useTweaks: useTweaks, TweaksPanel: none, TweakSection: none, TweakRow: none,
    TweakSlider: none, TweakToggle: none, TweakRadio: none, TweakSelect: none,
    TweakText: none, TweakNumber: none, TweakColor: none, TweakButton: none,
  });
})();
