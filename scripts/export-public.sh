#!/bin/bash
# Copies the project into a separate folder for the public GitHub repository, without your own
# Cloudflare storage id (a new install creates its own), and with a fresh first commit when the
# folder isn't a git repository yet. Usage: bash scripts/export-public.sh ../wall-dashboard-public
set -e
DEST="${1:?Give the folder to export to}"
mkdir -p "$DEST"
git ls-files -z | while IFS= read -r -d '' f; do mkdir -p "$DEST/$(dirname "$f")"; cp "$f" "$DEST/$f"; done
# Drop the KV namespace id: Wrangler and the Deploy button create a new one for each install.
# Public installs are called stubli-home; your own keeps its name.
sed -i.bak -E 's/\{ "binding": "KV", "id": "[0-9a-f]+" \}/{ "binding": "KV" }/; s#^  // Replace with the id.*#  // Created automatically on the first deploy.#; s/"name": "wall-dashboard"/"name": "stubli-home"/' "$DEST/wrangler.jsonc" && rm "$DEST/wrangler.jsonc.bak"
if [ ! -d "$DEST/.git" ]; then
  git -C "$DEST" init -q -b main
  git -C "$DEST" add -A
  git -C "$DEST" -c user.name="Celestine Tan" -c user.email="hello@celestinetan.com" commit -q -m "Wall Dashboard 1.0"
fi
echo "Exported to $DEST"
