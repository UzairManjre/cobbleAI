import pytest
from pydantic import ValidationError
from app.models.graph import GraphNode, GraphEdge, MasteryState, RelationType
import uuid

def test_graph_node_defaults():
    # Only id, label, and description are required
    node = GraphNode(
        id=str(uuid.uuid4()),
        label="Test Concept",
        description="A test description"
    )
    
    assert node.category == "concept"
    assert node.difficulty == "intermediate"
    assert node.source_docs == []
    assert node.mastery_state == MasteryState.locked

def test_graph_node_valid_mastery():
    node = GraphNode(
        id="node1",
        label="Concept A",
        description="Desc",
        mastery_state="mastered"
    )
    assert node.mastery_state == MasteryState.mastered

def test_graph_node_invalid_mastery():
    with pytest.raises(ValidationError) as exc_info:
        GraphNode(
            id="node1",
            label="Concept A",
            description="Desc",
            mastery_state="partially_mastered" # Invalid
        )
    assert "Input should be 'locked', 'unlocked' or 'mastered'" in str(exc_info.value)

def test_graph_edge_aliasing():
    # The JSON from LLM typically uses 'from' and 'to'
    edge = GraphEdge(
        id="edge1",
        **{"from": "node1", "to": "node2"},
        relation="prerequisite_for"
    )
    assert edge.source == "node1"
    assert edge.target == "node2"
    assert edge.relation == RelationType.prerequisite_for
    assert edge.strength == 1.0

def test_graph_edge_populate_by_name():
    # Should also be able to instantiate with 'source' and 'target' directly
    edge = GraphEdge(
        id="edge2",
        source="node1",
        target="node2",
        relation="builds_on"
    )
    assert edge.source == "node1"
    assert edge.target == "node2"

def test_graph_edge_invalid_relation():
    with pytest.raises(ValidationError) as exc_info:
        GraphEdge(
            id="edge1",
            source="node1",
            target="node2",
            relation="is_better_than" # Invalid
        )
    assert "Input should be" in str(exc_info.value)
    assert "prerequisite_for" in str(exc_info.value)
