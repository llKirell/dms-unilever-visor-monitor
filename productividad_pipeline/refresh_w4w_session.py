from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


REQUIRED_COOKIES = {"ASP.NET_SessionId", "ckDinet", "ckDinetW4WWEB"}


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def build_cookie(cookies: list[dict]) -> str:
    values = {cookie["name"]: cookie["value"] for cookie in cookies if cookie.get("name")}
    missing = REQUIRED_COOKIES.difference(values)
    if missing:
        raise RuntimeError(
            "W4W no genero una sesion completa. Faltan: " + ", ".join(sorted(missing))
        )
    return "; ".join(f"{name}={value}" for name, value in values.items())


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera una cookie W4W mediante navegador.")
    parser.add_argument("--out", required=True, help="Archivo temporal de salida para la cookie.")
    args = parser.parse_args()

    user = env("DINET_USER")
    password = env("DINET_PASSWORD")
    if not user or not password:
        raise RuntimeError("Faltan DINET_USER y DINET_PASSWORD para renovar la sesion.")

    payload = {
        "companyCode": env("DINET_COMPANY_CODE", "01"),
        "company": env("DINET_COMPANY_NAME", "DINET S.A."),
        "user": user,
        "password": password,
        "systemLanguage": env("DINET_SYSTEM_LANGUAGE", "ES"),
        "systemCode": env("DINET_SYSTEM_CODE", "W4WWEB"),
        "listarCodes": [code.strip() for code in env("DINET_LISTAR_CUENTAS_CODES", "E5,HU").split(",") if code.strip()],
        "dcCode": env("DINET_DC_CODE", "HU"),
        "dcName": env("DINET_DC_NAME", "HUACHIPA"),
        "accountCode": env("DINET_ACCOUNT_CODE", "I1002"),
        "account": env("DINET_ACCOUNT_NAME", "UNILEVER"),
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://app.dinet.com.pe/", wait_until="domcontentloaded", timeout=120000)
        login_result = page.evaluate(
            """async (payload) => {
                async function post(url, body, referer) {
                    const response = await fetch(url, {
                        method: "POST", credentials: "include",
                        headers: { "accept": "application/json, text/javascript, */*; q=0.01",
                            "content-type": "application/json; charset=UTF-8",
                            "x-requested-with": "XMLHttpRequest", "referer": referer },
                        body: JSON.stringify(body)
                    });
                    return { status: response.status,
                        json: (response.headers.get("content-type") || "").toLowerCase().includes("application/json") };
                }
                const login = await post("https://app.dinet.com.pe/Login/Ingresar", {
                    CompanyCode: payload.companyCode, Company: payload.company,
                    User: payload.user, Password: payload.password,
                    SystemLanguage: payload.systemLanguage
                }, "https://app.dinet.com.pe/");
                const redirect = await post("https://app.dinet.com.pe/Home/RedirectSystem",
                    { SystemCode: payload.systemCode }, "https://app.dinet.com.pe/Home/Index/");
                return [login, redirect];
            }""",
            payload,
        )
        if not all(item["status"] < 400 for item in login_result):
            raise RuntimeError("Dinet rechazo el inicio de sesion automatico.")
        page.goto("https://w4w.dinet.com.pe/AppWeb/", wait_until="domcontentloaded", timeout=120000)
        context_result = page.evaluate(
            """async (payload) => {
                async function post(url, body) {
                    const response = await fetch(url, {
                        method: "POST", credentials: "include",
                        headers: { "accept": "application/json, text/javascript, */*; q=0.01",
                            "content-type": "application/json; charset=UTF-8",
                            "x-requested-with": "XMLHttpRequest", "referer": "https://w4w.dinet.com.pe/AppWeb" },
                        body: JSON.stringify(body)
                    });
                    return { status: response.status,
                        json: (response.headers.get("content-type") || "").toLowerCase().includes("application/json") };
                }
                const responses = [];
                for (const code of payload.listarCodes) {
                    responses.push(await post("https://w4w.dinet.com.pe/AppWeb/IngresoSistema/ListarCuentas",
                        { CodigoCentroDistribucion: code }));
                }
                responses.push(await post("https://w4w.dinet.com.pe/AppWeb/IngresoSistema/AssignmentCredentials", {
                    distributionCenterCode: payload.dcCode, distributionCenter: payload.dcName,
                    accountCode: payload.accountCode, account: payload.account
                }));
                return responses;
            }""",
            payload,
        )
        if not all(item["json"] and item["status"] < 400 for item in context_result):
            raise RuntimeError("W4W no devolvio respuestas JSON validas al seleccionar el contexto.")
        page.goto("https://w4w.dinet.com.pe/AppWeb/Home/Index/", wait_until="domcontentloaded", timeout=120000)
        page.wait_for_timeout(1000)
        cookie = build_cookie(context.cookies(["https://app.dinet.com.pe", "https://w4w.dinet.com.pe"]))
        browser.close()

    output = Path(args.out)
    output.write_text(cookie, encoding="utf-8")
    output.chmod(0o600)
    print(f"[OK] Sesion W4W renovada; cookie temporal escrita en {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
