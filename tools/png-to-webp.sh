#!/usr/bin/env bash
# Convert PNGs under content/ to WebP and rewrite references in article.json / body.*.
#
# Run on a LOCAL Linux checkout (not over samba):
#   sudo apt install webp python3
#   git clone git@github.com:canonn-science/canonn.science.git && cd canonn.science
#   bash tools/png-to-webp.sh            # convert
#   DRY_RUN=1 bash tools/png-to-webp.sh  # just report what it would save
#
# Env: QUALITY=82 (0-100, lossy)  LOSSLESS=1 (exact pixels, smaller saving)  JOBS=<cpus>
#
# Safety: a PNG is only replaced if the WebP is at least 10% smaller, and only deleted once no
# text file in content/ still mentions its filename. Anything left over is reported.
set -euo pipefail

ROOT="${1:-content}"
QUALITY="${QUALITY:-82}"
LOSSLESS="${LOSSLESS:-0}"
JOBS="${JOBS:-$(nproc)}"
DRY_RUN="${DRY_RUN:-0}"

command -v cwebp >/dev/null   || { echo "cwebp not found: sudo apt install webp" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 not found" >&2; exit 1; }
[ -d "$ROOT" ] || { echo "no such directory: $ROOT (run from the repo root)" >&2; exit 1; }

export QUALITY LOSSLESS DRY_RUN

convert_one() {
  local src="$1" dir base out tmp a b
  dir="$(dirname "$src")"; base="$(basename "$src")"
  out="$dir/${base%.*}.webp"
  # never clobber an existing .webp (it may be a different image with the same stem)
  [ -e "$out" ] && return 0
  tmp="$out.tmp.webp"
  if [ "$LOSSLESS" = "1" ]; then
    cwebp -quiet -lossless -z 9 -m 6 "$src" -o "$tmp" 2>/dev/null || { rm -f "$tmp"; return 0; }
  else
    cwebp -quiet -q "$QUALITY" -m 6 -alpha_q 100 "$src" -o "$tmp" 2>/dev/null || { rm -f "$tmp"; return 0; }
  fi
  a=$(stat -c %s "$src"); b=$(stat -c %s "$tmp")
  if [ "$DRY_RUN" = "1" ]; then
    [ "$((b * 10))" -lt "$((a * 9))" ] && printf 'SAVE %d\n' "$((a - b))" >&2
    rm -f "$tmp"
  elif [ "$((b * 10))" -lt "$((a * 9))" ]; then
    mv "$tmp" "$out"
  else
    rm -f "$tmp"   # not worth it, keep the PNG
  fi
}
export -f convert_one

echo "Converting PNGs under $ROOT with $JOBS jobs (quality=$QUALITY lossless=$LOSSLESS dry=$DRY_RUN)..."
SAVED=$(find "$ROOT" -type f -iname '*.png' -print0 \
  | xargs -0 -n1 -P "$JOBS" bash -c 'convert_one "$0"' 2>&1 >/dev/null \
  | awk '/^SAVE/ {s+=$2; n++} END {printf "%d %d\n", n+0, s+0}')

if [ "$DRY_RUN" = "1" ]; then
  echo "Dry run: $(echo "$SAVED" | cut -d' ' -f1) PNGs would shrink, saving about $(( $(echo "$SAVED" | cut -d' ' -f2) / 1048576 )) MB."
  exit 0
fi

echo "Rewriting references and removing converted PNGs..."
python3 - "$ROOT" <<'PY'
import os, re, sys
from urllib.parse import quote

root = sys.argv[1]
TEXT_EXT = ('.html', '.md', '.json')

def walk():
    for d, _, fs in os.walk(root):
        for f in fs:
            yield os.path.join(d, f)

pngs = []
for p in walk():
    if p.lower().endswith('.png'):
        w = p[:-4] + '.webp'
        if os.path.exists(w):
            pngs.append((p, w))

texts = [p for p in walk() if p.lower().endswith(TEXT_EXT)]
contents = {}
for p in texts:
    with open(p, newline='', encoding='utf-8', errors='surrogateescape') as fh:
        contents[p] = fh.read()

def pattern(name):
    forms = {name, quote(name)}
    alt = '|'.join(re.escape(f) for f in sorted(forms, key=len, reverse=True))
    # preceded by / " ' ( space, ; or start; not followed by another filename char
    return re.compile(r'(?<![A-Za-z0-9_.%-])(' + alt + r')(?![A-Za-z0-9_.%-])')

def to_webp(m):
    s = m.group(1)
    return s[:-4] + '.webp'

changed = set()
for png, webp in pngs:
    name = os.path.basename(png)
    pat = pattern(name)
    parts = png.split(os.sep)
    # per-article media: only that article's files; shared-media (or anything else): all files
    if 'articles' in parts and parts.index('articles') + 2 < len(parts) and parts[parts.index('articles') + 2] == 'media':
        slug_dir = os.sep.join(parts[:parts.index('articles') + 2]) + os.sep
        scope = [t for t in texts if t.startswith(slug_dir)]
    else:
        scope = texts
    for t in scope:
        new = pat.sub(to_webp, contents[t])
        if new != contents[t]:
            contents[t] = new
            changed.add(t)

for t in changed:
    with open(t, 'w', newline='', encoding='utf-8', errors='surrogateescape') as fh:
        fh.write(contents[t])

blob = '\n'.join(contents.values())
removed = kept = 0
before = after = 0
leftovers = []
for png, webp in pngs:
    name = os.path.basename(png)
    if pattern(name).search(blob):
        # something still points at the PNG: keep both files, drop nothing
        kept += 1
        leftovers.append(png)
        continue
    before += os.path.getsize(png)
    after += os.path.getsize(webp)
    os.remove(png)
    removed += 1

print(f'Converted + removed: {removed} PNGs, {before/1048576:.0f} MB -> {after/1048576:.0f} MB '
      f'(saved {(before-after)/1048576:.0f} MB)')
print(f'Text files rewritten: {len(changed)}')
if leftovers:
    print(f'Kept {kept} PNGs still referenced somewhere (both PNG and WebP remain):')
    for p in leftovers[:20]:
        print('  ', p)
PY

echo
echo "Next: npm ci && npm run content:check, look at a few articles (npm start), then commit."
echo "Total content size now: $(du -sh "$ROOT" | cut -f1)"
