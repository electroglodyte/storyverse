#!/bin/bash

# Log startup
echo "MCP wrapper starting..." >&2

# Create a temporary file for the request
REQUEST_FILE=$(mktemp)

# Read stdin (MCP request) to temp file
cat > "$REQUEST_FILE"

# Check if the file was created and has content
if [ -s "$REQUEST_FILE" ]; then
  echo "Received request, forwarding to Edge Function..." >&2
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -d @"$REQUEST_FILE" \
    https://rkmjjhjjpnhjymqmcvpe.supabase.co/functions/v1/mcp-server
else
  echo "Error: No input received" >&2
  echo "{\"error\":\"No input received\"}"
fi

# Clean up
rm "$REQUEST_FILE"