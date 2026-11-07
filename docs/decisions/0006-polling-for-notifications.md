# 0006. Notifications by polling, not push

Status: Accepted

Date: 2026-11-06

## Context
Notifications ("someone commented on your post") used a Supabase realtime channel. Without Supabase's client, the choices were server-sent events, WebSockets, or asking the API periodically.

## Decision
The notification bell asks `GET /api/v1/notifications` every 30 seconds and when the page loads.

## Consequences
- **Good:** trivial to run (stateless, works behind any proxy), no open connection per user, easy to test.
- **Cost:** up to 30 seconds of delay and a small constant request load. Fine for this app's volume; server-sent events are the next step if immediacy matters (see the [roadmap](../roadmap.md)).
