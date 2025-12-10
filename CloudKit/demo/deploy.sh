#!/bin/bash
set -e

echo "🚀 MOSS CloudKit Deployment"
echo "=========================="
echo ""

# Check wrangler
if ! command -v npx &> /dev/null; then
    echo "❌ npx not found. Please install Node.js first."
    exit 1
fi

echo "📋 Checking Cloudflare authentication..."
npx wrangler whoami || {
    echo ""
    echo "❌ Not logged in to Cloudflare."
    echo "Run: npx wrangler login"
    exit 1
}

echo ""
echo "📦 Creating Cloudflare resources..."

# Create D1 database
echo "  → Creating D1 database..."
DB_OUTPUT=$(npx wrangler d1 create cloudkit-db 2>&1) || {
    if echo "$DB_OUTPUT" | grep -q "already exists"; then
        echo "  → Database already exists, continuing..."
    else
        echo "$DB_OUTPUT"
        exit 1
    fi
}

# Extract database ID
DB_ID=$(echo "$DB_OUTPUT" | grep -o '"database_id": "[^"]*"' | cut -d'"' -f4)
if [ -z "$DB_ID" ]; then
    # Try to get it from existing database
    DB_ID=$(npx wrangler d1 list 2>/dev/null | grep cloudkit-db | awk '{print $1}')
fi

echo "  → Database ID: $DB_ID"

# Create R2 bucket
echo "  → Creating R2 bucket..."
npx wrangler r2 bucket create cloudkit-files 2>&1 || echo "  → Bucket already exists, continuing..."

# Create Queue
echo "  → Creating Queue..."
npx wrangler queues create cloudkit-processing 2>&1 || echo "  → Queue already exists, continuing..."

echo ""
echo "🔧 Updating configuration..."

# Update wrangler.toml with database ID
if [ -n "$DB_ID" ]; then
    sed -i.bak "s/database_id = \".*\"/database_id = \"$DB_ID\"/" api/wrangler.toml
    rm -f api/wrangler.toml.bak
fi

echo ""
echo "📡 Deploying API..."
cd api
npm install
npx wrangler d1 execute cloudkit-db --remote --file=./schema.sql 2>/dev/null || echo "  → Schema already applied"
API_OUTPUT=$(npx wrangler deploy 2>&1)
API_URL=$(echo "$API_OUTPUT" | grep -o 'https://[^[:space:]]*\.workers\.dev' | head -1)
echo "  → API deployed: $API_URL"

echo ""
echo "🎨 Deploying Portal..."
cd ../portal

# Update API URL in portal
if [ -n "$API_URL" ]; then
    sed -i.bak "s|https://[^']*\.workers\.dev|$API_URL|g" src/App.tsx
    rm -f src/App.tsx.bak
fi

npm install
npm run build

# Create Pages project if needed
npx wrangler pages project create cloudkit-portal --production-branch=main 2>&1 || echo "  → Pages project already exists"

PAGES_OUTPUT=$(npx wrangler pages deploy dist --project-name=cloudkit-portal 2>&1)
PORTAL_URL=$(echo "$PAGES_OUTPUT" | grep -o 'https://[^[:space:]]*\.pages\.dev' | tail -1)

echo ""
echo "✅ Deployment complete!"
echo ""
echo "=========================="
echo "🌐 Portal: $PORTAL_URL"
echo "📡 API:    $API_URL"
echo "=========================="
echo ""
echo "Next steps:"
echo "1. Open $PORTAL_URL"
echo "2. Click ⚙️ Settings"
echo "3. Add your API keys:"
echo "   - Deepgram: https://deepgram.com"
echo "   - Claude: https://console.anthropic.com"
echo "4. Upload your first recording!"
echo ""
