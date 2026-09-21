"""使用标准库 smtplib 发送验证码邮件。"""

from __future__ import annotations

import os
import smtplib
from email.mime.text import MIMEText


def _smtp_config() -> dict[str, str]:
    """从环境变量读取 SMTP 配置。"""
    return {
        "host": os.getenv("FRUIT_ANALYSIS_SMTP_HOST", ""),
        "port": os.getenv("FRUIT_ANALYSIS_SMTP_PORT", "465"),
        "user": os.getenv("FRUIT_ANALYSIS_SMTP_USER", ""),
        "password": os.getenv("FRUIT_ANALYSIS_SMTP_PASSWORD", ""),
        "from_addr": os.getenv("FRUIT_ANALYSIS_SMTP_FROM", ""),
    }


def smtp_configured() -> bool:
    """SMTP 是否已配置。"""
    cfg = _smtp_config()
    return bool(cfg["host"] and cfg["user"] and cfg["password"] and cfg["from_addr"])


def send_verification_code(to_email: str, code: str, purpose: str = "register") -> None:
    """向指定邮箱发送验证码邮件。

    purpose 支持 "register"（注册）和 "reset_password"（重置密码）。
    失败时抛出异常，由调用方决定处理方式。
    """
    cfg = _smtp_config()
    if not smtp_configured():
        raise RuntimeError("SMTP 未配置，无法发送邮件")

    subject_map = {
        "register": "SLD-水果市场销售分析 - 注册验证码",
        "reset_password": "SLD-水果市场销售分析 - 重置密码验证码",
    }
    body_map = {
        "register": f"""您好！

您的注册验证码为：{code}

验证码 10 分钟内有效，请勿泄露给他人。

如果非您本人操作，请忽略此邮件。

--- SLD-水果市场销售分析团队""",
        "reset_password": f"""您好！

您正在重置 SLD-水果市场销售分析账号的登录密码。

验证码为：{code}

验证码 10 分钟内有效，请勿泄露给他人。
如非您本人操作，请忽略此邮件并检查账号安全。

--- SLD-水果市场销售分析团队""",
    }

    subject = subject_map.get(purpose, subject_map["register"])
    body = body_map.get(purpose, body_map["register"])

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = cfg["from_addr"]
    msg["To"] = to_email

    import ssl
    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL(cfg["host"], int(cfg["port"]), context=ctx) as server:
        server.login(cfg["user"], cfg["password"])
        server.send_message(msg)
