# Glossary

## ADB

Android Debug Bridge. A command-line tool that lets your computer communicate with an Android device over USB or TCP/IP. ADB is the foundation of everything Phone Farm does.

## USB Debugging

A developer mode setting on Android phones that allows ADB to interact with the device. You must enable it in Developer Options before Phone Farm can connect.

## Scrcpy

A tool that displays and controls Android devices from your computer screen. Phone Farm uses Scrcpy for screen capture and remote control in some tasks.

## Tailscale

A VPN service that creates a secure network between your devices. Phone Farm uses Tailscale to reach phones that are not on the same local network, mainly in Office mode.

## Parsec

A low-latency remote desktop tool. Phone Farm can use Parsec as an alternative to Tailscale for remote device access in Office mode.

## APK

Android Package Kit. The file format Android uses to distribute and install apps. Phone Farm can install APK files on connected devices as part of automation tasks.

## Device Serial

A unique identifier assigned to each Android device. You see serials in `adb devices` output and use them to target specific phones in Phone Farm commands.

## Job / Task

A **task** is a single action Phone Farm can run on a device, like making a call or unlocking the screen. A **job** is a submitted task tracked by ID. You check job status with the `status` command.

## EV / Home Mode

Everyday mode for personal use. Phones connect directly via USB. The GUI shows a simple device list. Best for small setups and testing.

## OFIS / Office Mode

Office mode for managing phones across a network. Supports remote device access via Tailscale or Parsec. Includes job queues, scheduling, and a dashboard. Best for larger phone farms.

## Related Docs

- [Getting Started](getting-started.md): Prerequisites and installation.
- [Setup Wizard](setup-wizard.md): Choosing between Home and Office mode.
- [CLI Reference](cli-reference.md): Command usage.
