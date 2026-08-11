NodeMC
=====

A modular Node-based Minecraft-like server whose gameplay systems live in plugins.
The core now owns only lifecycle and shared state. World generation/rendering,
connections, commands, chat routing, and mobs are independently loadable modules in `plugins/`.

Quick start
----------

1. Install (optional): npm install
2. Start: npm start

The terminal dashboard uses timestamped, severity-colored logs and exposes a small
operator console when started in an interactive terminal. Type `help` to see the
available commands: `status`, `players`, `plugins`, `clear`, and `stop`.

Plugin API
----------
Plugins can be a JavaScript file or a directory containing `index.js`. They export an object with:
- `name`, `version`, and an optional `dependencies` array
- onEnable(api) - called when plugin is loaded
- onDisable(api) - called when unloaded

Plugins are dependency-sorted before they are enabled. Missing and circular dependencies
stop startup rather than leaving a partially configured server. Disable runs in reverse
dependency order, every managed resource is automatically removed, and asynchronous
plugin initialization is awaited before the server becomes ready.

API passed to plugins:
- events: central EventBus
- registerEvent(event, handler): auto-managed listener
- registerCommand(name, options): auto-managed server command
- registerService(name, value), getService(name): communication between plugins
- dataDirectory: stable plugin-specific storage path
- logger: plugin-scoped logger
- server: server instance

Events (examples)
- playerJoin (player)
- playerLeave (player)
- playerChat ({player, message, cancelled})
- tick ()
- chatBroadcast ({message, color, timestamp})
- mobSpawn (mob)

Bundled plugins
---------------
- `worldGenerator.js`: deterministic terrain generation.
- `world.js`: asynchronously generates and pre-encodes every startup chunk, logging
  percentage progress. Connections are not opened until this reaches 100%.
- `connections.js`: protocol lifecycle, player state, chunk streaming, and ticking.
- `commands.js`: command registry and Brigadier tree sent to clients for completion.
- `chat.js`: validation, broadcasts, and command routing.
- `mobs.js`: bounded passive-mob spawning near online players.
- `nodeAssistant.js`: dependency-free, rate-limited gameplay guidance when chat
  messages address `Node` (for example, `Node, how do I build a house?`).
- `scoreboard.js`: the NodeMC Nexus sidebar and lightweight coordinate/biome HUD.
- `time.js`: configurable accelerated daylight (`timeScale`) with low-frequency updates.
- `performance.js`: lightweight TPS, event-loop lag, memory, and busy-state monitoring
  through `/serverusage`.
- `permissions.js`: persistent guest/builder/moderator/admin/owner access levels with
  `/permissions`, `/permission`, and `/op` controls. The first player becomes owner.
- `loot.js`: rare generated chests that grant useful survival gear once.
- `survival.js`: event-driven combat, animal health, and attack-aware NPC reactions.
- `weather.js`: low-frequency vanilla rain and clear-weather transitions.

World behavior
--------------
The initial world radius defaults to six chunks, larger than the player view distance.
When a player changes chunks, the world plugin generates an additional safety margin
before sending cached packets, so clients do not reach a visible edge. Existing world
seed, spawn, and time metadata are retained and newly generated terrain is added to the
in-memory chunk map. The deterministic generator creates unbounded warped continents,
rivers, mountain chains, ten climate-driven biomes, layered stone and ores, caves,
vegetation, and rare structures. It samples climate once per column and only visits the
vertical range that can contain blocks, keeping generation lightweight without a fixed
island boundary. Improved timber cottages, uncommon visible loot chests, and vendor
villagers are included. World spawn also contains a rendered crop farm, composter, and farmer.
Passive mobs use low-frequency behavior decisions to idle, wander, form herds, avoid
terrain hazards, and flee nearby players or attackers while remaining lightweight.
Killed animals provide their common resources with a small rare-drop chance. Movement queues
generate and encode terrain ahead of each player's direction of travel, coalescing rapid
updates so exploration remains seamless without duplicating work. If generation ever
loses the race, a temporary movement barrier holds the player on loaded ground while
the missing area is prepared. Players who fall into
the void are restored to their last grounded position, and the on-screen NodeMC Nexus
sidebar tracks location, biome, explored distance, online players, and rescues.

Commands use the client Brigadier tree for tab completion. Close misspellings within
two edits are also corrected automatically, such as `/statsu` resolving to `/status`.

Contributing
------------
Open issues and PRs. New gameplay and protocol features should be implemented as plugins rather than added to the server kernel.
