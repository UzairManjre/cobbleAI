import json
from pathlib import Path

# Read uncached files
uncached = Path('.graphify_uncached.txt').read_text(encoding='utf-8').strip().split('\n')
uncached = [f for f in uncached if f.strip()]

# Separate images from other files
image_exts = {'.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'}
images = []
others = []

for f in uncached:
    ext = Path(f).suffix.lower()
    if ext in image_exts:
        images.append(f)
    else:
        others.append(f)

print("Images: %d" % len(images))
print("Other files: %d" % len(others))

# Each image gets its own chunk
chunks = [[img] for img in images]

# Split others into chunks of 20-25
chunk_size = 22
for i in range(0, len(others), chunk_size):
    chunk = others[i:i+chunk_size]
    chunks.append(chunk)

print("Total chunks: %d" % len(chunks))
for i, chunk in enumerate(chunks):
    print("Chunk %d: %d files" % (i+1, len(chunk)))

# Write chunks to files for subagents to read
for i, chunk in enumerate(chunks):
    chunk_file = Path('.graphify_chunk_%02d.txt' % (i+1))
    chunk_file.write_text('\n'.join(chunk), encoding='utf-8')

print("\nChunks written to .graphify_chunk_XX.txt files")
print("CHUNK_COUNT:%d" % len(chunks))
