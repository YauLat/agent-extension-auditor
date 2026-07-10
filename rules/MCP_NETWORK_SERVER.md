# MCP_NETWORK_SERVER

Severity: medium

## What It Detects

MCP definitions with URL-like server fields or network transport markers.

## Why It Matters

Network-connected servers can send prompts, tool inputs, or metadata outside the machine.

## False Positive Notes

Remote MCP servers can be legitimate when the provider and scopes are understood.

## Recommended Action

Review the endpoint owner, auth model, and data handling policy.
