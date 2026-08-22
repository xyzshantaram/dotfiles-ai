---
name: ecommerce
description: Fetch delivery-platform order history and itemize it from the Swiggy Food and Swiggy Instamart MCP servers. Use when the user wants past orders, delivery history, or item details for expense tracking or splitting. Gates the swiggy MCP tools behind this skill.
whenToUse: The user asks about past food or grocery orders, wants delivery history itemized, or wants delivery data for expense splitting. Trigger phrases are "swiggy orders", "instamart", "delivery history", "what did I order".
tools-gated:
  - mcp__swiggy-food__*
  - mcp__swiggy-instamart__*
---

# ecommerce skill

The swiggy MCP servers expose order history for Swiggy Food and Swiggy Instamart. Their tools stay hidden until this skill loads.

## Rules

- Pull order history with the swiggy MCP tools. List orders first, then read item details for the orders in scope.
- Hand the itemized results to the `expense-split` skill when the user wants expense splitting.
- Do not invent MCP method names. Enumerate the tools after the skill loads.
- Blinkit and Zepto MCP servers are not installed yet. Add their patterns here when they are.
