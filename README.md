NodeMC
=====

A modular Node-based Minecraft-like server with plugin support and an event-driven API.

Quick start
----------

1. Install (optional): npm install
2. Start: npm start

Plugin API
----------
Plugins export an object with:
- name, version
- onEnable(api) - called when plugin is loaded
- onDisable(api) - called when unloaded

API passed to plugins:
- events: central EventBus
- registerEvent(event, handler): auto-managed listener
- logger: plugin-scoped logger
- server: server instance

Events (examples)
- playerJoin (player)
- playerQuit (player)
- chatMessage ({player, message})
- tick ()

Example plugin (plugins/sample-plugin.js) demonstrates usage.

Contributing
------------
Open issues and PRs. This scaffold is minimal — implement Minecraft protocol handling in src/server.js or integrate with an existing protocol library.
