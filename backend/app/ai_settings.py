"""大模型（AI 分析）配置读取。

配置来源优先级：进程环境变量 → 仓库根 ``.env``。
根 ``.env`` 已被 Git 忽略，密钥只允许留在这里，禁止写入代码或提交。
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env", override=False)

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"


@dataclass(frozen=True)
class AiSettings:
    """调用大模型所需的连接信息。"""

    api_key: str
    base_url: str
    model: str

    def chat_completions_url(self) -> str:
        """返回 OpenAI 兼容的对话补全地址。"""

        base = self.base_url.rstrip("/")
        if base.endswith("/chat/completions"):
            return base
        return f"{base}/chat/completions"


def ai_settings() -> AiSettings | None:
    """读取大模型配置；未配置 API Key 时返回 ``None``。"""

    api_key = (os.getenv("FRUIT_ANALYSIS_AI_API_KEY") or "").strip()
    if not api_key:
        return None
    base_url = (os.getenv("FRUIT_ANALYSIS_AI_BASE_URL") or "").strip() or DEFAULT_BASE_URL
    model = (os.getenv("FRUIT_ANALYSIS_AI_MODEL") or "").strip() or DEFAULT_MODEL
    return AiSettings(api_key=api_key, base_url=base_url, model=model)


__all__ = ["AiSettings", "ai_settings", "DEFAULT_BASE_URL", "DEFAULT_MODEL", "ROOT_DIR"]
