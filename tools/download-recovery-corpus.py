"""Fetch pinned public NIST fixtures without packaging or executing their contents.
Usage: python3 tools/download-recovery-corpus.py /path/on/healthy/drive
Requires curl and about 1 GiB of free space for a fresh download.
"""
import bz2
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

manifest = json.loads((Path(__file__).resolve().parent.parent / 'docs/recovery-corpus.json').read_text())
if len(sys.argv) != 2:
    raise SystemExit('Provide a destination directory on a healthy drive.')
root = Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=True)

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def valid(path, entry):
    return path.is_file() and path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256']

def fetch(url, path, cap):
    subprocess.run(['curl', '-fsSL', '-A', 'Mozilla/5.0', '--retry', '2', '--max-time', '180', '--max-filesize', str(cap), url, '-o', str(path)], check=True)

for section in ['images', 'originals']:
    for entry in manifest[section]:
        folder = root if section == 'images' else root / 'originals'
        folder.mkdir(exist_ok=True)
        dest = folder / entry['name']
        if valid(dest, entry):
            print('Verified existing:', dest.name)
            continue
        if dest.exists():
            raise SystemExit(f'Existing file does not match fixture; move it aside before retrying: {dest}')
        required = entry['bytes'] + (100*1024**2 if section == 'images' else 0) + 128*1024**2
        if shutil.disk_usage(root).free < required:
            raise SystemExit('Not enough space for the next fixture. Choose a destination with more room.')
        part = dest.with_suffix(dest.suffix + '.part')
        packed = dest.with_suffix(dest.suffix + '.bz2.part')
        try:
            if section == 'images':
                fetch(entry['url'], packed, 100*1024**2)
                if digest(packed) != entry['compressedSha256']:
                    raise ValueError('Compressed fixture checksum mismatch')
                with bz2.open(packed, 'rb') as source, part.open('wb') as target:
                    total = 0
                    while block := source.read(1024**2):
                        total += len(block)
                        if total > entry['bytes']:
                            raise ValueError('Expanded fixture exceeds expected size')
                        target.write(block)
            else:
                fetch(entry['url'], part, entry['bytes'])
            if not valid(part, entry):
                raise ValueError('Fixture checksum or size mismatch')
            part.replace(dest)
            print('Downloaded and verified:', dest.name)
        finally:
            part.unlink(missing_ok=True)
            packed.unlink(missing_ok=True)
