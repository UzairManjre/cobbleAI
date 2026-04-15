from qdrant_client import QdrantClient

client = QdrantClient('http://localhost:6333')
collections = client.get_collections()

print('Qdrant Collections:')
for c in collections.collections:
    info = client.get_collection(c.name)
    print(f'  - {c.name}: {info.points_count} vectors')
