from typing import Any, Dict, Optional
import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


logger = logging.getLogger(__name__)


class AppException(Exception):
    """统一应用异常基类，便于在业务层抛出标准化错误。"""

    def __init__(self, message: str, *, status_code: int = 400, code: str = "APP_ERROR", details: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


def _build_error_payload(
    *,
    message: str,
    status_code: int,
    code: str = "APP_ERROR",
    details: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    """构建标准化错误响应载荷。
    """
    rid = request_id or str(uuid.uuid4())
    payload: Dict[str, Any] = {
        "success": False,
        "error": {
            "message": message,
            "code": code,
            **({"details": details} if details else {}),
        },
        "request_id": rid,
        "status_code": status_code,
    }
    return payload


def register_exception_handlers(app: FastAPI) -> None:
    """注册全局异常处理器，统一错误响应格式。"""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):  # type: ignore[override]
        req_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        # FastAPI/Starlette 可能提供 str 或 dict 作为 detail
        message = exc.detail if isinstance(exc.detail, str) else "请求处理失败"
        code = "HTTP_ERROR"
        payload = _build_error_payload(
            message=message,
            status_code=exc.status_code,
            code=code,
            request_id=req_id,
        )
        logger.warning(
            "HTTPException: status=%s code=%s path=%s request_id=%s",
            exc.status_code,
            code,
            request.url.path,
            req_id,
        )
        return JSONResponse(status_code=exc.status_code, content=payload, headers={"X-Request-ID": req_id})

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):  # type: ignore[override]
        req_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        errors = exc.errors()
        payload = _build_error_payload(
            message="请求参数验证失败",
            status_code=422,
            code="VALIDATION_ERROR",
            details={"errors": errors},
            request_id=req_id,
        )
        logger.info(
            "ValidationError: path=%s errors=%d request_id=%s",
            request.url.path,
            len(errors),
            req_id,
        )
        return JSONResponse(status_code=422, content=payload, headers={"X-Request-ID": req_id})

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):  # type: ignore[override]
        req_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        payload = _build_error_payload(
            message=exc.message,
            status_code=exc.status_code,
            code=exc.code,
            details=exc.details,
            request_id=req_id,
        )
        logger.warning(
            "AppException: status=%s code=%s path=%s request_id=%s",
            exc.status_code,
            exc.code,
            request.url.path,
            req_id,
        )
        return JSONResponse(status_code=exc.status_code, content=payload, headers={"X-Request-ID": req_id})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):  # type: ignore[override]
        req_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        logger.exception("UnhandledException: path=%s request_id=%s", request.url.path, req_id)
        payload = _build_error_payload(
            message="服务器内部错误",
            status_code=500,
            code="INTERNAL_SERVER_ERROR",
            request_id=req_id,
        )
        return JSONResponse(status_code=500, content=payload, headers={"X-Request-ID": req_id})

