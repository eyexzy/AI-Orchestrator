import itertools
import os
from uuid import uuid4

from jose import jwt
from locust import HttpUser, between, task


def _is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


DEFAULT_USER_EMAILS = [
    "loadtest+01@example.com",
    "loadtest+02@example.com",
    "loadtest+03@example.com",
    "loadtest+04@example.com",
    "loadtest+05@example.com",
    "loadtest+06@example.com",
    "loadtest+07@example.com",
    "loadtest+08@example.com",
]

AUTH_SECRET = os.getenv("AIO_LOADTEST_AUTH_SECRET") or os.getenv("AUTH_SECRET", "loadtest-secret")
MODEL_ID = os.getenv("AIO_LOADTEST_MODEL", "gpt-4o-mini")
PERSIST_GENERATE = _is_truthy(os.getenv("AIO_LOADTEST_PERSIST_GENERATE", "0"))
USER_EMAILS = [
    item.strip()
    for item in os.getenv("AIO_LOADTEST_USER_EMAILS", ",".join(DEFAULT_USER_EMAILS)).split(",")
    if item.strip()
]
EMAILS = itertools.cycle(USER_EMAILS or DEFAULT_USER_EMAILS)


class OrchestratorUser(HttpUser):
    wait_time = between(0.2, 0.8)

    def on_start(self):
        self.user_email = next(EMAILS)
        token = jwt.encode(
            {"email": self.user_email},
            AUTH_SECRET,
            algorithm="HS256",
        )
        self.auth_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _new_id() -> str:
        return str(uuid4())

    @task(3)
    def generate(self):
        session_id = self._new_id() if PERSIST_GENERATE else None
        body = {
            "prompt": "Summarize three practical AI prompting tips for beginner students.",
            "system_message": "",
            "model": MODEL_ID,
            "temperature": 0.3,
            "max_tokens": 256,
            "top_p": 0.9,
            "stream": False,
            "session_id": session_id,
            "history": [],
            "history_limit": 10,
        }
        headers = self.auth_headers if session_id else {"Content-Type": "application/json"}

        with self.client.post(
            "/generate",
            name="POST /generate",
            json=body,
            headers=headers,
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"status={response.status_code} body={response.text[:200]}")
                return
            try:
                payload = response.json()
            except ValueError as exc:
                response.failure(f"invalid json: {exc}")
                return
            if not payload.get("text"):
                response.failure("missing generated text")

    @task(2)
    def analyze(self):
        body = {
            "prompt_text": "Create a 5-step workshop agenda about prompt engineering for students.",
            "session_id": self._new_id(),
            "chat_id": None,
            "metrics": {
                "chars_per_second": 4.2,
                "session_message_count": 4,
                "avg_prompt_length": 96,
                "changed_temperature": False,
                "changed_model": True,
                "used_system_prompt": False,
                "used_variables": False,
                "used_advanced_features_count": 1,
                "tooltip_click_count": 0,
                "suggestion_click_count": 0,
                "cancel_action_count": 0,
                "level_transition_count": 0,
                "session_duration_seconds": 45,
            },
        }

        with self.client.post(
            "/analyze",
            name="POST /analyze",
            json=body,
            headers=self.auth_headers,
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"status={response.status_code} body={response.text[:200]}")
                return
            try:
                payload = response.json()
            except ValueError as exc:
                response.failure(f"invalid json: {exc}")
                return
            if payload.get("final_level") not in {1, 2, 3}:
                response.failure(f"unexpected final_level: {payload}")

    @task(2)
    def events_batch(self):
        session_id = self._new_id()
        body = {
            "events": [
                {
                    "session_id": session_id,
                    "chat_id": None,
                    "event_type": "prompt_started",
                    "event_context": {"surface": "main_input"},
                    "payload": {},
                },
                {
                    "session_id": session_id,
                    "chat_id": None,
                    "event_type": "prompt_submitted",
                    "event_context": {"surface": "main_input"},
                    "payload": {"prompt_len": 72},
                },
                {
                    "session_id": session_id,
                    "chat_id": None,
                    "event_type": "tooltip_opened",
                    "event_context": {"surface": "config_sidebar"},
                    "payload": {"tooltip": "temperature"},
                },
            ]
        }

        with self.client.post(
            "/events/batch",
            name="POST /events/batch",
            json=body,
            headers=self.auth_headers,
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"status={response.status_code} body={response.text[:200]}")
                return
            try:
                payload = response.json()
            except ValueError as exc:
                response.failure(f"invalid json: {exc}")
                return
            if not payload.get("ok") or payload.get("saved") != 3:
                response.failure(f"unexpected batch response: {payload}")
