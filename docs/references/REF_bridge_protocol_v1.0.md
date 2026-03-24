# Bridge Protocol v1.0

## Envelope

Request:

```json
{
  "protocolVersion": "1.0",
  "requestId": "optional-string",
  "command": "bootstrap|list|inspect|doctor|add|apply|update|uninstall",
  "payload": {}
}
```

Response:

```json
{
  "protocolVersion": "1.0",
  "requestId": "optional-string",
  "command": "...",
  "ok": true,
  "data": {},
  "warnings": [{ "code": "...", "message": "..." }],
  "errors": [{ "code": "...", "message": "..." }]
}
```

## Commands

- `bootstrap`: bootstrap workspace state for desktop startup.
- `list`: list workflow summaries.
- `inspect`: payload `{ "sourceId": "..." }`.
- `doctor`: run diagnostics.
- `add`: payload `{ "locator": "...", "applyNow": boolean, "options": {} }`.
- `apply`: payload `{ "sourceId": "...", "draft": {"selectedLeafIds":[],"enabledTargets":[]} }`.
- `update`: payload `{ "sourceIds": ["..."] }`.
- `uninstall`: payload `{ "sourceIds": ["..."] }`.
