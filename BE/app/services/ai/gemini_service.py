from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Dict, Optional

from google import genai
from google.genai import errors

logger = logging.getLogger("mfg.ai.gemini")

DEFAULT_TIMEOUT_SECONDS = 30.0
MAX_RETRIES = 3


class GeminiService:
    """Shared Gemini API client service with connection pooling, timeout, retry and error handling."""

    def __init__(self) -> None:
        self._api_key: Optional[str] = os.getenv("GEMINI_API_KEY")
        self._default_model: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        self._client: Optional[genai.Client] = None
        if self._api_key:
            try:
                self._client = genai.Client(api_key=self._api_key)
            except Exception as e:
                logger.error(
                    "Không thể khởi tạo Gemini client: %s", type(e).__name__
                )

    def is_configured(self) -> bool:
        """Kiểm tra dịch vụ Gemini đã được cấu hình API Key hay chưa."""
        return bool(self._api_key and self._client)

    @property
    def model_name(self) -> str:
        """Tên model Gemini mặc định từ biến môi trường."""
        return self._default_model

    def reload_config(self) -> None:
        """Cập nhật lại cấu hình từ biến môi trường nếu có thay đổi."""
        self._api_key = os.getenv("GEMINI_API_KEY")
        self._default_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        if self._api_key:
            try:
                self._client = genai.Client(api_key=self._api_key)
            except Exception as e:
                logger.error(
                    "Không thể khởi tạo lại Gemini client: %s", type(e).__name__
                )
        else:
            self._client = None

    async def generate_content_safe(
        self,
        prompt: str,
        model: Optional[str] = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = MAX_RETRIES,
    ) -> Dict[str, Any]:
        """Gọi Gemini API an toàn với timeout, retry và xử lý lỗi 429/503.
        
        Không log API key, secret hoặc dữ liệu riêng tư.
        """
        if not self.is_configured():
            return {
                "success": False,
                "error_code": "GEMINI_NOT_CONFIGURED",
                "message": "Hệ thống chưa được cấu hình GEMINI_API_KEY trong môi trường.",
                "response": None,
                "latency_ms": 0,
            }

        target_model = model or self._default_model
        start_time = time.perf_counter()

        last_error_message = ""
        last_error_code = ""

        for attempt in range(max_retries):
            try:
                # Chạy cuộc gọi SDK đồng bộ trong luồng riêng để không chặn FastAPI event loop
                def _call():
                    assert self._client is not None
                    return self._client.models.generate_content(
                        model=target_model,
                        contents=prompt,
                    )

                response = await asyncio.wait_for(
                    asyncio.to_thread(_call),
                    timeout=timeout_seconds,
                )

                latency_ms = int((time.perf_counter() - start_time) * 1000)
                text_response = response.text if response and response.text else ""

                return {
                    "success": True,
                    "model": target_model,
                    "response": text_response,
                    "latency_ms": latency_ms,
                }

            except asyncio.TimeoutError:
                last_error_code = "TIMEOUT"
                last_error_message = (
                    f"Yêu cầu đến Gemini API bị quá thời gian ({timeout_seconds}s)."
                )
                logger.warning(
                    "Gemini API timeout tại lần thử %d/%d (model=%s)",
                    attempt + 1,
                    max_retries,
                    target_model,
                )

            except errors.APIError as api_err:
                status_code = getattr(api_err, "code", None)
                err_message = str(api_err)

                if status_code == 429 or "RESOURCE_EXHAUSTED" in err_message:
                    last_error_code = "RATE_LIMIT_EXCEEDED"
                    last_error_message = (
                        "Gemini API đang bận hoặc vượt quá giới hạn tần suất (429 Rate Limit). Vui lòng thử lại sau giây lát."
                    )
                    logger.warning(
                        "Gemini API 429 Rate Limit tại lần thử %d/%d", attempt + 1, max_retries
                    )
                elif status_code == 503 or "UNAVAILABLE" in err_message:
                    last_error_code = "SERVICE_UNAVAILABLE"
                    last_error_message = (
                        "Dịch vụ Gemini AI tạm thời không khả dụng (503 Service Unavailable). Đang thử lại..."
                    )
                    logger.warning(
                        "Gemini API 503 Service Unavailable tại lần thử %d/%d", attempt + 1, max_retries
                    )
                else:
                    last_error_code = f"API_ERROR_{status_code}"
                    last_error_message = f"Lỗi Gemini API: {type(api_err).__name__}"
                    logger.error("Lỗi Gemini API (code=%s): %s", status_code, type(api_err).__name__)
                    # Các lỗi 400 hoặc 403 không retry
                    break

            except Exception as exc:
                last_error_code = "UNEXPECTED_ERROR"
                last_error_message = f"Lỗi kết nối Gemini: {type(exc).__name__}"
                logger.error("Lỗi ngoại lệ Gemini: %s", type(exc).__name__)
                break

            # Exponential backoff trước khi retry: 1s, 2s, 4s
            if attempt < max_retries - 1:
                delay = 1.0 * (2 ** attempt)
                await asyncio.sleep(delay)

        latency_ms = int((time.perf_counter() - start_time) * 1000)
        return {
            "success": False,
            "error_code": last_error_code,
            "message": last_error_message or "Không thể kết nối đến Gemini AI sau nhiều lần thử.",
            "response": None,
            "latency_ms": latency_ms,
        }


# Singleton instance dùng chung trong FastAPI
gemini_service = GeminiService()

