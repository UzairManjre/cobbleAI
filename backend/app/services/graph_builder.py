import uuid
from typing import List, Dict, Set, Tuple
from collections import defaultdict

class GraphBuilder:
    """Builds a cyclic knowledge graph from extracted triplets."""
    
    def __init__(self, triplets: List[Dict]):
        self.triplets = triplets
        self.nodes: Dict[str, Dict] = {}
        self.edges: List[Dict] = []
        self.incoming_count: Dict[str, int] = defaultdict(int)
        self.outgoing_count: Dict[str, int] = defaultdict(int)

    def build(self) -> Dict:
        """Build graph from triplets, deduplicate, and enforce cyclic structure."""
        self._create_nodes()
        self._create_edges()
        self._enforce_cyclic()
        self._add_ids()
        
        return {
            "nodes": list(self.nodes.values()),
            "edges": self.edges
        }

    def _create_nodes(self):
        """Create unique nodes from triplet heads and tails."""
        for triplet in self.triplets:
            head = triplet.get("head", "").strip()
            tail = triplet.get("tail", "").strip()
            
            if head and head not in self.nodes:
                self.nodes[head] = {
                    "label": head,
                    "description": f"Key concept related to the course material"
                }
            
            if tail and tail not in self.nodes:
                self.nodes[tail] = {
                    "label": tail,
                    "description": f"Key concept related to the course material"
                }

    def _create_edges(self):
        """Create edges from triplets, deduplicating duplicates."""
        seen_edges: Set[Tuple[str, str, str]] = set()
        
        for triplet in self.triplets:
            head = triplet.get("head", "").strip()
            tail = triplet.get("tail", "").strip()
            relation = triplet.get("relation", "relates_to").strip()
            
            if not head or not tail:
                continue
            
            edge_key = (head, tail, relation)
            if edge_key not in seen_edges:
                seen_edges.add(edge_key)
                self.edges.append({
                    "from": head,
                    "to": tail,
                    "relation": relation
                })
                self.incoming_count[tail] += 1
                self.outgoing_count[head] += 1

    def _enforce_cyclic(self):
        """Ensure every node has at least 2 incoming edges."""
        new_edges = []
        
        for node_label in self.nodes:
            incoming = self.incoming_count.get(node_label, 0)
            
            if incoming < 2:
                # Find nodes that have high outgoing count and add back-edges
                for edge in self.edges:
                    if edge["from"] == node_label:
                        target = edge["to"]
                        if self.incoming_count.get(target, 0) > 2:
                            reverse_edge = {
                                "from": target,
                                "to": node_label,
                                "relation": "relates_to"
                            }
                            if reverse_edge not in new_edges:
                                new_edges.append(reverse_edge)
                                self.incoming_count[node_label] += 1
                                if self.incoming_count[node_label] >= 2:
                                    break
        
        self.edges.extend(new_edges)

    def _add_ids(self):
        """Add UUIDs to nodes and edges."""
        label_to_id: Dict[str, str] = {}
        
        for label in self.nodes:
            node_id = f"uuid_{uuid.uuid4().hex[:12]}"
            label_to_id[label] = node_id
            self.nodes[label]["id"] = node_id
        
        # Update edges to use IDs
        for edge in self.edges:
            edge["id"] = f"uuid_{uuid.uuid4().hex[:12]}"
            edge["from"] = label_to_id.get(edge["from"], edge["from"])
            edge["to"] = label_to_id.get(edge["to"], edge["to"])
        
        # Convert nodes dict to list
        self.nodes = list(self.nodes.values())
