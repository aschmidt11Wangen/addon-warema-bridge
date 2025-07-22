# Warema Bridge Add-on

![Supports aarch64 Architecture][aarch64-shield]
![Supports amd64 Architecture][amd64-shield]
![Supports armhf Architecture][armhf-shield]
![Supports armv7 Architecture][armv7-shield]
![Supports i386 Architecture][i386-shield]

A Home Assistant add-on that bridges Warema WMS devices to Home Assistant via MQTT.

## About

This add-on provides a bridge between Warema WMS venetian blinds and Home Assistant using MQTT discovery. It automatically detects your MQTT broker configuration from Home Assistant.

## Installation

1. Add this repository to Home Assistant:
   - Navigate to **Settings** → **Add-ons** → **Add-on Store**
   - Click the three dots menu → **Repositories**
   - Add: `https://github.com/aschmidt11Wangen/addon-warema-bridge`

2. Find and install the "Warema Bridge" add-on
3. Start the add-on

## Configuration

The add-on automatically discovers your MQTT broker configuration from Home Assistant. No manual configuration is required.

## Support

For issues and feature requests, please visit the [GitHub repository](https://github.com/aschmidt11Wangen/addon-warema-bridge).

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armhf-shield]: https://img.shields.io/badge/armhf-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[i386-shield]: https://img.shields.io/badge/i386-yes-green.svg
