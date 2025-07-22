# Warema Bridge Add-on

A Home Assistant add-on that bridges Warema WMS devices to Home Assistant via MQTT.

## Installation

1. Add this repository to Home Assistant:
   - Go to **Settings** → **Add-ons** → **Add-on Store**
   - Click the three dots menu → **Repositories**
   - Add: `https://github.com/aschmidt11Wangen/addon-warema-bridge`

2. Install the "Warema Bridge" add-on

3. Start the add-on

## Configuration

The add-on will automatically discover your MQTT broker configuration from Home Assistant.

## Version History

- **3.0.0-mqtt-auth-fix**: MQTT-only test mode with automatic credential discovery
- **2.0.0**: Docker build optimizations and permission fixes
- **1.2.0**: Initial release with basic functionality

## Support

For issues and feature requests, please visit the [GitHub repository](https://github.com/aschmidt11Wangen/addon-warema-bridge).
