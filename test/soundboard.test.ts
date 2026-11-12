import * as Y from "yjs";
import {
  getBuiltInPresetClips,
  addSoundboardClip,
  updateSoundboardClip,
  deleteSoundboardClip,
  triggerSoundboardClip,
  subscribeToSoundboardClips,
  subscribeToSoundboardTriggers,
} from "../src/features/soundboard/store";
import type { SoundboardClip, SoundboardTrigger } from "../src/features/soundboard/types";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

console.log("-> 1: Preset sounds generator produces 8 built-in retro clips");
const presets = getBuiltInPresetClips();
assert(presets.length === 8, `Expected 8 preset clips, got ${presets.length}`);
assert(presets.some((p) => p.name === "Airhorn" && p.hotkey === "1"), "Airhorn hotkey [1] missing");
assert(presets.some((p) => p.name === "Ba-Dum-Tss" && p.hotkey === "2"), "Ba-Dum-Tss hotkey [2] missing");
assert(presets.some((p) => p.name === "Victory" && p.hotkey === "4"), "Victory hotkey [4] missing");
console.log("ok 1: Preset sounds generator produces 8 built-in retro clips");

console.log("-> 2: Soundboard subscription initializes with presets on empty doc");
const docA = new Y.Doc();
let receivedClipsA: SoundboardClip[] = [];
const unsubA = subscribeToSoundboardClips(docA, (clips) => {
  receivedClipsA = clips;
});

assert(receivedClipsA.length === 8, `Expected initial 8 clips, got ${receivedClipsA.length}`);
console.log("ok 2: Soundboard subscription initializes with presets on empty doc");

console.log("-> 3: Adding a custom sound clip syncs to subscriber");
const customClip = addSoundboardClip(docA, {
  name: "Custom Siren",
  icon: "🚨",
  color: "#d64949",
  hotkey: "9",
  duration: 1.5,
  audioData: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
  createdBy: "Tester",
});

assert(receivedClipsA.length === 9, `Expected 9 clips after adding custom, got ${receivedClipsA.length}`);
assert(receivedClipsA.some((c) => c.id === customClip.id && c.name === "Custom Siren"), "Custom clip not found in state");
console.log("ok 3: Adding a custom sound clip syncs to subscriber");

console.log("-> 4: Updating a sound clip");
updateSoundboardClip(docA, customClip.id, { name: "Mega Siren", hotkey: "8" });
const updated = receivedClipsA.find((c) => c.id === customClip.id);
assert(updated?.name === "Mega Siren", `Expected name "Mega Siren", got ${updated?.name}`);
assert(updated?.hotkey === "8", `Expected hotkey "8", got ${updated?.hotkey}`);
console.log("ok 4: Updating a sound clip");

console.log("-> 5: Deleting a sound clip");
deleteSoundboardClip(docA, customClip.id);
assert(receivedClipsA.length === 8, `Expected 8 clips after deletion, got ${receivedClipsA.length}`);
assert(!receivedClipsA.some((c) => c.id === customClip.id), "Deleted clip still present");
console.log("ok 5: Deleting a sound clip");

console.log("-> 6: Soundboard broadcast trigger syncs across Y.Doc sync");
const docB = new Y.Doc();
let triggerB: SoundboardTrigger | null = null;
const unsubTriggerB = subscribeToSoundboardTriggers(docB, (trig) => {
  triggerB = trig;
});

// Sync docA and docB state
const updateA = Y.encodeStateAsUpdate(docA);
Y.applyUpdate(docB, updateA);

// Trigger a sound on docA
triggerSoundboardClip(docA, presets[0], "GordonFreeman");

// Apply incremental update to docB
const trigUpdate = Y.encodeStateAsUpdate(docA);
Y.applyUpdate(docB, trigUpdate);

assert(triggerB !== null, "Trigger not received on peer docB");
assert(triggerB?.name === "Airhorn", `Expected Airhorn trigger, got ${triggerB?.name}`);
assert(triggerB?.user === "GordonFreeman", `Expected user GordonFreeman, got ${triggerB?.user}`);
console.log("ok 6: Soundboard broadcast trigger syncs across Y.Doc sync");

unsubA();
unsubTriggerB();
console.log("All soundboard tests passed!");
