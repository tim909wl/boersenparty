-- Generalized registry for every physical ESP32 chip (buzzer, relay controller, future sensors/
-- displays-on-chip), independent from display_devices (which is for browser-based screens).
-- Keyed by a durable device identity (derived from the chip's own MAC, never from its IP, which
-- drifts on this venue's DHCP network with no router admin access to fix it).
CREATE TABLE chip_devices(
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  firmware_version TEXT,
  ip_address TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  reported_state_json TEXT NOT NULL DEFAULT '{}',
  desired_state_json TEXT NOT NULL DEFAULT '{}'
);
