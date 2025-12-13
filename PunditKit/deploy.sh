#!/bin/bash
set -e

echo ""
echo "  ____                  _ _ _     _   _  ___  "
echo " |  _ \ _   _ _ __   __| (_) |_  | | | |/ _ \ "
echo " | |_) | | | | '_ \ / _\` | | __| | |_| | | | |"
echo " |  __/| |_| | | | | (_| | | |_  |  _  | |_| |"
echo " |_|    \__,_|_| |_|\__,_|_|\__| |_| |_|\__\_\\"
echo ""
echo "  Autonomous Prediction Market Agent"
echo ""
echo "=========================================="
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "[1/8] Checking prerequisites..."

# Check for node
if ! command -v node &> /dev/null; then
    echo "  ERROR: Node.js not found. Please install Node.js first."
    exit 1
fi
echo "  Node.js: $(node --version)"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "  ERROR: npm not found. Please install Node.js first."
    exit 1
fi
echo "  npm: $(npm --version)"

echo ""
echo "[2/8] Checking Cloudflare authentication..."
echo "  Running: wrangler whoami"

# Run wrangler whoami with visible output
WHOAMI_OUTPUT=$(npx wrangler whoami 2>&1) || {
    echo ""
    echo "  ERROR: Not logged in to Cloudflare."
    echo ""
    echo "  Please run: npx wrangler login"
    echo ""
    exit 1
}

# Check if authenticated
if echo "$WHOAMI_OUTPUT" | grep -q "You are logged in"; then
    ACCOUNT=$(echo "$WHOAMI_OUTPUT" | grep -o 'account.*' | head -1 || echo "")
    echo "  Authenticated: $ACCOUNT"
elif echo "$WHOAMI_OUTPUT" | grep -q "You are not authenticated"; then
    echo ""
    echo "  ERROR: Not logged in to Cloudflare."
    echo ""
    echo "  Please run: npx wrangler login"
    echo ""
    exit 1
else
    echo "  Authentication check passed"
fi

echo ""
echo "[3/8] Creating D1 database..."
echo "  Running: wrangler d1 create pundit-db"

DB_OUTPUT=$(npx wrangler d1 create pundit-db 2>&1) || {
    if echo "$DB_OUTPUT" | grep -qi "already exists"; then
        echo "  Database 'pundit-db' already exists"
    else
        echo "  Output: $DB_OUTPUT"
    fi
}

# Try to extract database ID from creation output
DB_ID=""
if echo "$DB_OUTPUT" | grep -q "database_id"; then
    DB_ID=$(echo "$DB_OUTPUT" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2 || echo "")
fi

# If not found, get from list
if [ -z "$DB_ID" ]; then
    echo "  Fetching database ID from list..."
    D1_LIST=$(npx wrangler d1 list 2>&1) || true
    # Extract UUID from table format (handles │ separators)
    DB_ID=$(echo "$D1_LIST" | grep "pundit-db" | sed 's/│/|/g' | awk -F'|' '{print $2}' | tr -d ' ' || echo "")
fi

if [ -n "$DB_ID" ]; then
    echo "  Database ID: $DB_ID"
else
    echo "  WARNING: Could not determine database ID"
fi

echo ""
echo "[4/8] Creating R2 bucket..."
echo "  Running: wrangler r2 bucket create pundit-artifacts"

R2_OUTPUT=$(npx wrangler r2 bucket create pundit-artifacts 2>&1) || {
    if echo "$R2_OUTPUT" | grep -qi "already exists"; then
        echo "  Bucket 'pundit-artifacts' already exists"
    else
        echo "  Output: $R2_OUTPUT"
    fi
}
echo "  R2 bucket ready"

echo ""
echo "[5/8] Creating Queue..."
echo "  Running: wrangler queues create pundit-research"

QUEUE_OUTPUT=$(npx wrangler queues create pundit-research 2>&1) || {
    if echo "$QUEUE_OUTPUT" | grep -qi "already exists"; then
        echo "  Queue 'pundit-research' already exists"
    else
        echo "  Output: $QUEUE_OUTPUT"
    fi
}
echo "  Queue ready"

echo ""
echo "[6/8] Deploying Agent Worker..."

# Update wrangler.toml with database ID
if [ -n "$DB_ID" ]; then
    echo "  Updating wrangler.toml with database ID..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/database_id = \"YOUR_DATABASE_ID\"/database_id = \"$DB_ID\"/" demo/agent/wrangler.toml 2>/dev/null || true
        sed -i '' "s/database_id = \"[a-f0-9-]*\"/database_id = \"$DB_ID\"/" demo/agent/wrangler.toml 2>/dev/null || true
    else
        sed -i "s/database_id = \"YOUR_DATABASE_ID\"/database_id = \"$DB_ID\"/" demo/agent/wrangler.toml 2>/dev/null || true
        sed -i "s/database_id = \"[a-f0-9-]*\"/database_id = \"$DB_ID\"/" demo/agent/wrangler.toml 2>/dev/null || true
    fi
fi

cd demo/agent

echo "  Installing dependencies..."
npm install

echo "  Applying database schema..."
npx wrangler d1 execute pundit-db --remote --file=./schema.sql 2>&1 || {
    echo "  Schema may already be applied"
}

echo "  Deploying worker..."
API_OUTPUT=$(npx wrangler deploy 2>&1)
echo "$API_OUTPUT" | tail -5

API_URL=$(echo "$API_OUTPUT" | grep -o 'https://[^[:space:]]*\.workers\.dev' | head -1 || echo "")

if [ -z "$API_URL" ]; then
    echo "  WARNING: Could not extract API URL"
    API_URL="https://pundit-agent.YOUR_SUBDOMAIN.workers.dev"
else
    echo "  Agent URL: $API_URL"
fi

cd ../..

echo ""
echo "[7/8] Deploying Portal..."
cd demo/portal

# Update API URL in portal
if [ -n "$API_URL" ] && [ "$API_URL" != "https://pundit-agent.YOUR_SUBDOMAIN.workers.dev" ]; then
    echo "  Updating API URL in portal..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|https://pundit-agent\.YOUR_SUBDOMAIN\.workers\.dev|$API_URL|g" src/App.tsx 2>/dev/null || true
    else
        sed -i "s|https://pundit-agent\.YOUR_SUBDOMAIN\.workers\.dev|$API_URL|g" src/App.tsx 2>/dev/null || true
    fi
fi

echo "  Installing dependencies..."
npm install

echo "  Building portal..."
npm run build

echo ""
echo "[8/8] Deploying to Cloudflare Pages..."

echo "  Creating Pages project..."
npx wrangler pages project create pundit-hq --production-branch=main 2>&1 || {
    echo "  Pages project may already exist"
}

echo "  Uploading to Pages..."
PAGES_OUTPUT=$(npx wrangler pages deploy dist --project-name=pundit-hq 2>&1)
echo "$PAGES_OUTPUT" | tail -5

PORTAL_URL=$(echo "$PAGES_OUTPUT" | grep -o 'https://[^[:space:]]*\.pages\.dev' | tail -1 || echo "")

if [ -z "$PORTAL_URL" ]; then
    PORTAL_URL="https://pundit-hq.pages.dev"
fi

cd ../..

echo ""
echo "=========================================="
echo ""
echo "  DEPLOYMENT COMPLETE!"
echo ""
echo "  Portal: $PORTAL_URL"
echo "  Agent:  $API_URL"
echo ""
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Open $PORTAL_URL"
echo "  2. Click the Settings icon (gear, top right)"
echo "  3. Add your API keys:"
echo "     - Claude: https://console.anthropic.com"
echo "     - Gemini: https://ai.google.dev"
echo "  4. Install Playwriter extension for market scanning:"
echo "     https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe"
echo "  5. Click 'Scan Markets' to start!"
echo ""
