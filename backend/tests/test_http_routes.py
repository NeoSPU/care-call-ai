from app.http_routes import NestedResourceRoute, ResourceRoute, nested_resource_id, resource_id


def test_resource_id_extracts_single_path_resource_id():
    assert resource_id("/api/runs/run-123", "/api/runs/") == "run-123"
    assert resource_id("/api/runs/", "/api/runs/") is None
    assert resource_id("/api/recipients/rec-001", "/api/runs/") is None


def test_nested_resource_id_extracts_id_between_prefix_and_suffix():
    assert nested_resource_id("/api/runs/run-123/import", "/api/runs/", "/import") == "run-123"
    assert nested_resource_id("/api/runs/run-123/result", "/api/runs/", "/import") is None
    assert nested_resource_id("/api/runs//import", "/api/runs/", "/import") is None


def test_nested_resource_route_matches_with_named_pattern():
    route = NestedResourceRoute("/api/recipients/", "/special-handling-approval")

    assert route.match("/api/recipients/rec-002/special-handling-approval") == "rec-002"
    assert route.match("/api/recipients/rec-002/card") is None


def test_resource_route_matches_with_named_pattern():
    route = ResourceRoute("/api/service-requests/")

    assert route.match("/api/service-requests/svc-001") == "svc-001"
    assert route.match("/api/service-requests/") is None
    assert route.match("/api/runs/run-001") is None
