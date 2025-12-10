# Changes Downloaded from Remote Beta-2-Branch

## Commit: ce1b8fe (Dec 9, 2025)
**Author:** jvco226  
**Message:** Add files via upload

## Summary of Changes

This commit adds **public lobby support** to differentiate between public and private games.

### Changes Made:

1. **Frontend (index.html)**:
   - Added `share-pin-container` div to wrap the PIN display section
   - Modified `joinSuccess` handler to accept `isPublic` parameter
   - Added logic to hide PIN display for public games (shows "Public Game" instead)
   - Shows/hides PIN container based on `isPublic` flag
   - Minor formatting changes (button elements on single lines)

2. **Backend (server.js)**:
   - Modified `joinSuccess` event to include `isPublic` flag
   - Sends `isPublic: rooms[code].isPublic || false` to clients

## Files Changed:
- `index.html` - 30 insertions, 23 deletions
- `server.js` - 7 insertions, 1 deletion

## What This Adds:

This change enables the UI to differentiate between public and private lobbies:
- **Private lobbies**: Show PIN code and "Share this PIN" message
- **Public lobbies**: Hide PIN display, show "Public Game" text instead

## Integration Notes:

To integrate these changes:
1. The `isPublic` property needs to be set when creating rooms (likely in `/api/create-room` endpoint)
2. The frontend already handles the display logic
3. This is a UI enhancement that doesn't break existing functionality

