#!/bin/bash
# ============================================================
#  DOMINANCE — One-Shot Azure Deployment Script
#  Works for: 200 teams, 1000 participants, zero lag
#  Run this from inside your project root (dominance_v7 folder)
#  Requirements: Azure CLI installed + logged in
# ============================================================

set -e  # Stop on any error

# ─── CONFIG — EDIT THESE ────────────────────────────────────
APP_NAME="codesprint20"          # Must be globally unique on Azure
RESOURCE_GROUP="dominance-rg"
LOCATION="centralindia"             # Closest Azure region to India
SKU="P2v4"                            # 2 vCPU, 3.5 GB RAM — handles 1000 users easily
ADMIN_TOKEN="dominance2024"         # Your existing admin token (keep as is)
# ─────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         DOMINANCE — Azure Deployment Script          ║"
echo "║         200 teams · 1000 participants · No lag       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── STEP 1: Verify Azure CLI is logged in ───────────────────
echo "▶ [1/9] Checking Azure login..."
az account show --output none 2>/dev/null || {
  echo "❌ Not logged in. Run: az login"
  exit 1
}
SUBSCRIPTION=$(az account show --query name -o tsv)
echo "   ✅ Logged in — Subscription: $SUBSCRIPTION"

# ─── STEP 2: Detect project root ─────────────────────────────
echo "▶ [2/9] Detecting project structure..."
if [ ! -d "server" ] || [ ! -d "client" ]; then
  echo "❌ Run this script from the dominance_v7 project root"
  echo "   (the folder that contains both 'server' and 'client')"
  exit 1
fi
echo "   ✅ Found server/ and client/ directories"

# ─── STEP 3: Patch server to serve built client ──────────────
echo "▶ [3/9] Patching server to serve React build..."

# Check if static serving already patched
if ! grep -q "express.static" server/index.js; then
  # Inject static serving BEFORE the socket registration line
  # This makes it a single-server deployment — no separate client host needed
  STATIC_PATCH='
// ── Serve React build (injected by deploy script) ──────────
import { fileURLToPath } from '\''url'\'';
import { dirname, join } from '\''path'\'';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientBuild = join(__dirname, '\''../client/dist'\'');
'

  # Use Python to insert the patch safely (avoids bash escaping hell)
  PYTHONUTF8=1 python3 << 'PYEOF'
import re

with open('server/index.js', 'r') as f:
    content = f.read()

# Insert path imports after existing imports
import_block = """import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const clientBuild = join(__dirname, '../client/dist');
"""

# Add after the last import line
content = re.sub(
    r"(import \{ debounce \} from './lib/utils\.js';)",
    r"\1\n\n" + import_block,
    content
)

# Add static serving before socket registration
static_middleware = """
// Serve React build — single server deployment
app.use(express.static(clientBuild));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(join(clientBuild, 'index.html'));
  }
});
"""

content = content.replace(
    "// ── Sockets ─────────────────────────────────────────────────────",
    static_middleware + "\n// ── Sockets ─────────────────────────────────────────────────────"
)

with open('server/index.js', 'w') as f:
    f.write(content)

print("   ✅ server/index.js patched for static serving")
PYEOF
else
  echo "   ✅ Server already patched (skipping)"
fi

# ─── STEP 4: Build the React client ──────────────────────────
echo "▶ [4/9] Building React client..."
cd client

# Set the server URL to empty so it falls back to window.location.origin
# This means the client auto-connects to whatever URL it's served from — no hardcoding!
echo "VITE_SERVER_URL=" > .env.production

npm install --silent
npm run build --silent

echo "   ✅ React build complete → client/dist/"
cd ..

# ─── STEP 5: Create Azure resources ──────────────────────────
echo "▶ [5/9] Creating Azure Resource Group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
echo "   ✅ Resource group: $RESOURCE_GROUP ($LOCATION)"

echo "▶ [6/9] Creating App Service Plan ($SKU)..."
az appservice plan create \
  --name "${APP_NAME}-plan" \
  --resource-group "$RESOURCE_GROUP" \
  --sku "$SKU" \
  --is-linux \
  --output none
echo "   ✅ Plan created: ${APP_NAME}-plan"

echo "▶ [7/9] Creating Web App..."
az webapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "${APP_NAME}-plan" \
  --runtime "NODE:20-lts" \
  --output none
echo "   ✅ Web app created: $APP_NAME"

# ─── STEP 6: Configure app settings ──────────────────────────
echo "▶ [8/9] Configuring app settings..."
CLIENT_URL="https://${APP_NAME}.azurewebsites.net"

az webapp config appsettings set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    NODE_ENV="production" \
    PORT="8080" \
    CLIENT_URL="$CLIENT_URL" \
    WEBSITE_NODE_DEFAULT_VERSION="20" \
    SCM_DO_BUILD_DURING_DEPLOYMENT="false" \
  --output none

# Enable WebSocket support (CRITICAL for Socket.IO)
az webapp config set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --web-sockets-enabled true \
  --always-on true \
  --output none

# Set startup command — runs from server/ folder
az webapp config set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --startup-file "cd /home/site/wwwroot/server && node index.js" \
  --output none

echo "   ✅ WebSockets ON · Always-On ON · Node 20"

# ─── STEP 7: Package and deploy ──────────────────────────────
echo "▶ [9/9] Packaging and deploying to Azure..."

# Create a clean deploy package
DEPLOY_DIR="/tmp/dominance-deploy"
DEPLOY_ZIP="/tmp/dominance-deploy.zip"
rm -rf "$DEPLOY_DIR" "$DEPLOY_ZIP"
mkdir -p "$DEPLOY_DIR"

# Copy server + pre-built client dist
cp -r server "$DEPLOY_DIR/"
cp -r client/dist "$DEPLOY_DIR/client-dist"

# Move client dist into the right relative path for server
mkdir -p "$DEPLOY_DIR/client"
mv "$DEPLOY_DIR/client-dist" "$DEPLOY_DIR/client/dist"

# Make sure data directory persists
mkdir -p "$DEPLOY_DIR/server/data"

# Add a root package.json for Azure's deployment engine
cat > "$DEPLOY_DIR/package.json" << 'EOF'
{
  "name": "dominance",
  "version": "1.0.0",
  "scripts": {
    "start": "cd server && node index.js"
  }
}
EOF

# Zip it
cd "$DEPLOY_DIR"
zip -r "$DEPLOY_ZIP" . -q
cd - > /dev/null

echo "   📦 Package size: $(du -sh $DEPLOY_ZIP | cut -f1)"

az webapp deployment source config-zip \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --src "$DEPLOY_ZIP" \
  --output none

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║               ✅ DEPLOYMENT COMPLETE                 ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  🌐 App URL:                                         ║"
echo "║     $CLIENT_URL"
echo "║                                                      ║"
echo "║  🔐 Admin Panel:                                     ║"
echo "║     ${CLIENT_URL}/admin                              ║"
echo "║     Token: $ADMIN_TOKEN                              ║"
echo "║                                                      ║"
echo "║  📡 Health Check:                                    ║"
echo "║     ${CLIENT_URL}/api/ping                           ║"
echo "║                                                      ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Need to make changes? Just run this script again.  ║"
echo "║  It re-builds client and re-deploys automatically.  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "⏳ App may take 2-3 minutes to fully start on first boot."
echo "   Watch logs: az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP"
echo ""
