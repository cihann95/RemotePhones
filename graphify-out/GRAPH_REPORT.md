# Graph Report - phone-farm-backup  (2026-05-20)

## Corpus Check
- 20 files · ~17,556 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 306 nodes · 459 edges · 20 communities (11 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b364f115`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]

## God Nodes (most connected - your core abstractions)
1. `AutostartManager` - 26 edges
2. `NotificationManager` - 19 edges
3. `ADBManager` - 18 edges
4. `DeviceStore` - 18 edges
5. `ScrcpyManager` - 14 edges
6. `TailscaleManager` - 14 edges
7. `ParsecManager` - 12 edges
8. `DeviceMonitor` - 10 edges
9. `renderDeviceCards()` - 8 edges
10. `logPaths()` - 7 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (20 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (37): activeDevices, closeDeviceEdit(), closeSettings(), devices, elements, escapeHtml(), getBatteryIcon(), groups (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (26): { app }, { execFile, spawn, exec }, fs, path, { app }, Store, Store, ADBManager (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (7): { exec, execSync, spawn }, fs, https, os, path, { shell }, TailscaleManager

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (6): { app }, fs, path, ScrcpyManager, { spawn }, Store

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (6): { exec, spawn }, fs, https, os, ParsecManager, path

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (10): activateLicense(), { app }, checkLicense(), fs, getProductFilePath(), getStatusCodeName(), initializeLexActivator(), licenseStatus (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (12): checkLicenseStatus(), elements, handleActivate(), handleDeactivate(), hideMessages(), init(), setLoading(), showActivatedState() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (10): { app }, fs, getAdbPath(), getAppDataPath(), getProductDataPath(), getScrcpyPath(), getToolsPath(), isDev() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.36
Nodes (5): checkStatus(), els, installParsec(), installTailscale(), loginTailscale()

## Knowledge Gaps
- **61 isolated node(s):** `{ contextBridge, ipcRenderer }`, `{ execFile, spawn, exec }`, `path`, `fs`, `{ app }` (+56 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AutostartManager` connect `Community 2` to `Community 1`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **Why does `NotificationManager` connect `Community 5` to `Community 1`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `DeviceStore` connect `Community 6` to `Community 1`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **What connects `{ contextBridge, ipcRenderer }`, `{ execFile, spawn, exec }`, `path` to the rest of the system?**
  _61 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._