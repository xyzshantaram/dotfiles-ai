---
name: ecommerce
description: Fetch delivery-platform order history and itemize it from the Swiggy Food, Swiggy Instamart, Blinkit, and Zepto MCP servers. Use when the user wants past orders, delivery history, or item details for expense tracking or splitting, or wants to search or order groceries. Gates the swiggy, blinkit, and zepto MCP tools behind this skill.
whenToUse: The user asks about past food or grocery orders, wants delivery history itemized, wants delivery data for expense splitting, or wants to browse or order groceries. Trigger phrases are "swiggy orders", "instamart", "blinkit", "zepto", "delivery history", "order groceries", "what did I order".
tools-gated:
  - mcp__swiggy-food__*
  - mcp__swiggy-instamart__*
  - mcp__blinkit__*
  - mcp__zepto__*
---

# ecommerce skill

The swiggy MCP servers expose order history for Swiggy Food and Swiggy Instamart. The blinkit and zepto MCP servers expose grocery search and ordering. All of their tools stay hidden until this skill loads.

## Rules

- Pull order history with the swiggy MCP tools. List orders first, then read item details for the orders in scope.
- Hand the itemized results to the `expense-split` skill when the user wants expense splitting.
- Do not invent MCP method names. Enumerate the tools after the skill loads.
- Use the blinkit and zepto tools for grocery search, cart, and ordering. Confirm the cart with the user before any checkout or payment call.
