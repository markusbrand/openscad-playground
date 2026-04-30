import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_rate_limiting_chat_stream(client):
    payload = {
        "messages": [{"role": "user", "content": "hello"}],
        "model": "gemini/gemini-1.5-flash"
    }
    headers = {"x-test-rate-limit": "true"}

    # We should be able to make 5 requests
    for i in range(5):
        response = client.post("/api/v1/chat/stream", json=payload, headers=headers)
        assert response.status_code == 200

    # The 6th request should be rate limited
    response = client.post("/api/v1/chat/stream", json=payload, headers=headers)
    assert response.status_code == 429

def test_rate_limiting_api_keys(client):
    payload = {"provider": "openai", "api_key": "sk-123"}

    # We should be able to make 10 requests
    for i in range(10):
        response = client.post("/api/v1/config/api-keys", json=payload)
        assert response.status_code == 200

    # The 11th request should be rate limited
    response = client.post("/api/v1/config/api-keys", json=payload)
    assert response.status_code == 429
