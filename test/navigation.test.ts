import * as Y from "yjs";
import {
  SceneBridge,
  parseWaypoints,
  serializeWaypoints,
  type Waypoint,
} from "../src/crdt/scene";

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => console.log(`ok  ${name}`))
        .catch((err) => {
          console.error(`FAIL: ${name}`, err);
          process.exit(1);
        });
    }
    console.log(`ok  ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`, err);
    process.exit(1);
  }
}

async function main() {
  console.log("-> 1: parseWaypoints and serializeWaypoints helper functions");
  runTest("Waypoint serialization handles malformed & valid JSON", () => {
    if (Object.keys(parseWaypoints(null)).length !== 0) throw new Error("null should return empty object");
    if (Object.keys(parseWaypoints("invalid-json")).length !== 0) throw new Error("invalid json should return empty object");

    const sample: Record<string, Waypoint> = {
      "1": {
        id: "1",
        name: "Architecture Lane",
        scrollX: 450,
        scrollY: -200,
        zoom: 0.85,
        created: 1700000000000,
      },
    };

    const serialized = serializeWaypoints(sample);
    const roundtrip = parseWaypoints(serialized);
    if (!roundtrip["1"] || roundtrip["1"].name !== "Architecture Lane") {
      throw new Error("Failed to roundtrip valid waypoints record");
    }
    if (roundtrip["1"].scrollX !== 450 || roundtrip["1"].zoom !== 0.85) {
      throw new Error("Corrupted coordinates or zoom on roundtrip");
    }
  });

  console.log("-> 2: SceneBridge waypoints CRDT storage, CRUD & observeWaypoints");
  runTest("SceneBridge saves, gets, and deletes waypoints", () => {
    const doc = new Y.Doc();
    const identity = { id: "user-1", name: "Alice" };
    const bridge = new SceneBridge(doc, identity);

    if (Object.keys(bridge.getWaypoints()).length !== 0) {
      throw new Error("New doc should have empty waypoints");
    }

    const wp1: Waypoint = {
      id: "1",
      name: "Sprint 14 Board",
      scrollX: 100,
      scrollY: 250,
      zoom: 1.0,
      created: Date.now(),
    };

    bridge.setWaypoint("1", wp1);
    const read1 = bridge.getWaypoints();
    if (!read1["1"] || read1["1"].name !== "Sprint 14 Board") {
      throw new Error("Failed to read back saved waypoint '1'");
    }

    const wp2: Waypoint = {
      id: "2",
      name: "Design System",
      scrollX: -500,
      scrollY: 800,
      zoom: 0.5,
      created: Date.now(),
    };
    bridge.setWaypoint("2", wp2);
    const read2 = bridge.getWaypoints();
    if (Object.keys(read2).length !== 2 || !read2["2"]) {
      throw new Error("Expected 2 waypoints");
    }

    bridge.deleteWaypoint("1");
    const read3 = bridge.getWaypoints();
    if (read3["1"] || !read3["2"]) {
      throw new Error("Waypoint 1 should be deleted and waypoint 2 retained");
    }
  });

  console.log("-> 3: Two-peer CRDT waypoints synchronization");
  runTest("Waypoints propagate from Doc A to Doc B across Yjs transaction sync", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const bridgeA = new SceneBridge(docA, { id: "user-a", name: "Alice" });
    const bridgeB = new SceneBridge(docB, { id: "user-b", name: "Bob" });

    // Sync bridge from A to B
    docA.on("update", (update) => {
      Y.applyUpdate(docB, update);
    });
    docB.on("update", (update) => {
      Y.applyUpdate(docA, update);
    });

    let observedWaypointsOnB: Record<string, Waypoint> | null = null;
    bridgeB.observeWaypoints((wps) => {
      observedWaypointsOnB = wps;
    });

    bridgeA.setWaypoint("3", {
      id: "3",
      name: "Database Schema",
      scrollX: 1200,
      scrollY: -340,
      zoom: 1.25,
      created: 1700000005000,
    });

    if (!observedWaypointsOnB || !observedWaypointsOnB["3"]) {
      throw new Error("Doc B observer was not triggered with updated waypoints");
    }
    if (observedWaypointsOnB["3"].name !== "Database Schema") {
      throw new Error("Waypoint data on Doc B does not match Doc A");
    }

    const readFromB = bridgeB.getWaypoints();
    if (!readFromB["3"] || readFromB["3"].scrollX !== 1200) {
      throw new Error("Direct read from bridgeB failed to return synced waypoint");
    }
  });

  console.log("\nAll Navigation, Radar Minimap & Spatial Waypoints tests passed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
