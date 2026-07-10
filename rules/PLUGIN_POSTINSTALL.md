# PLUGIN_POSTINSTALL

Severity: high

## What It Detects

`package.json` lifecycle scripts such as `preinstall`, `install`, `postinstall`, or `prepare`.

## Why It Matters

Install lifecycle scripts can execute code during package installation.

## False Positive Notes

Build tooling sometimes uses lifecycle scripts legitimately.

## Recommended Action

Read the script and package source before installing globally or enabling the plugin.
