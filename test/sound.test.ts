import assert from "node:assert/strict";
import { soundEngine } from "../src/audio/soundEngine";

function runTests() {
  // 1. Initial configuration
  const config = soundEngine.getConfig();
  assert.equal(typeof config.enabled, "boolean");
  assert.ok(config.volume >= 0 && config.volume <= 1);
  assert.ok(typeof config.pack === "string");

  // 2. Setters & clamping
  soundEngine.setEnabled(false);
  assert.equal(soundEngine.getConfig().enabled, false);

  soundEngine.setEnabled(true);
  assert.equal(soundEngine.getConfig().enabled, true);

  soundEngine.setVolume(0.75);
  assert.equal(soundEngine.getConfig().volume, 0.75);

  soundEngine.setVolume(1.5); // should clamp to 1.0
  assert.equal(soundEngine.getConfig().volume, 1.0);

  soundEngine.setVolume(-0.2); // should clamp to 0.0
  assert.equal(soundEngine.getConfig().volume, 0.0);

  soundEngine.setVolume(0.5);

  // 3. Theme Preset -> Sound Pack resolution
  soundEngine.setSoundPack("auto");

  soundEngine.setActiveThemePreset("vgui");
  assert.equal(soundEngine.resolveEffectivePack(), "vgui");

  soundEngine.setActiveThemePreset("frutiger-glacier");
  assert.equal(soundEngine.resolveEffectivePack(), "frutiger");

  soundEngine.setActiveThemePreset("frutiger-aqua");
  assert.equal(soundEngine.resolveEffectivePack(), "frutiger");

  soundEngine.setActiveThemePreset("windows-xp");
  assert.equal(soundEngine.resolveEffectivePack(), "windows-xp");

  soundEngine.setActiveThemePreset("mac-os9");
  assert.equal(soundEngine.resolveEffectivePack(), "mac-os9");

  soundEngine.setActiveThemePreset("win95");
  assert.equal(soundEngine.resolveEffectivePack(), "win95");

  soundEngine.setActiveThemePreset("dos-tui");
  assert.equal(soundEngine.resolveEffectivePack(), "dos");

  // Manual override
  soundEngine.setSoundPack("vgui");
  assert.equal(soundEngine.resolveEffectivePack(), "vgui");

  // 4. Safe invocation without window / AudioContext in Node
  soundEngine.play("click");
  soundEngine.play("create");
  soundEngine.play("ping");
  soundEngine.play("hover");

  console.log("ok  sound engine unit tests passed");
}

runTests();
