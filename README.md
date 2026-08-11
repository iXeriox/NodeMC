NodeMC
=====

A modular Node-based Minecraft-like server whose gameplay systems live in plugins.
The core now owns only lifecycle and shared state. World generation/rendering,
connections, commands, chat routing, and mobs are independently loadable modules in `plugins/`.

Quick start
----------

1. Install (optional): npm install
2. Start: npm start

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

Contributing
------------
Open issues and PRs. New gameplay and protocol features should be implemented as plugins rather than added to the server kernel.
