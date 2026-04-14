#!/bin/bash
# Start dev server accessible from mobile devices on the same network.
# Usage: ./dev-mobile.sh

IP=$(ipconfig getifaddr en0)
if [ -z "$IP" ]; then
  echo "Error: No Wi-Fi IP found. Are you connected to a network?"
  exit 1
fi

# Update .env.local with current IP
sed -i '' "s|NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=http://${IP}:54321|" .env.local

# Update next.config.ts with current IP for allowedDevOrigins
sed -i '' "s|allowedDevOrigins:.*|allowedDevOrigins: [\"${IP}\"],|" next.config.ts

echo "================================================"
echo "  Open on your phone: http://${IP}:3000"
echo "================================================"
echo ""

pnpm dev --hostname 0.0.0.0

# Restore localhost when done
sed -i '' "s|NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321|" .env.local
echo "Restored NEXT_PUBLIC_SUPABASE_URL to localhost."
