from __future__ import annotations

import argparse
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


def first_selector(page, selectors: list[str], description: str) -> str:
    for selector in selectors:
        try:
            page.wait_for_selector(selector, timeout=8000)
            return selector
        except Exception:
            continue
    raise RuntimeError(f"No se encontro {description} en el login de Dinet.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera una cookie W4W mediante navegador.")
    parser.add_argument("--out", required=True, help="Archivo temporal de salida para la cookie.")
    args = parser.parse_args()

    user = env("DINET_USER")
    password = env("DINET_PASSWORD")
    if not user or not password:
        raise RuntimeError("Faltan DINET_USER y DINET_PASSWORD para renovar la sesion.")

    system_code = env("DINET_SYSTEM_CODE", "W4WWEB")
    dc_code = env("DINET_DC_CODE", "HU")
    dc_name = env("DINET_DC_NAME", "HUACHIPA")
    account_code = env("DINET_ACCOUNT_CODE", "I1002")
    account = env("DINET_ACCOUNT_NAME", "UNILEVER")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="es-PE",
            ignore_https_errors=True,
        )
        context.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
            "window.chrome={runtime:{}};"
            "Object.defineProperty(navigator,'languages',{get:()=>['es-PE','es','en-US']});"
            "Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3]});"
        )
        page = context.new_page()
        try:
            page.goto("https://app.dinet.com.pe/", wait_until="domcontentloaded", timeout=120000)
            try:
                page.wait_for_load_state("networkidle", timeout=20000)
            except Exception:
                pass
            user_selector = first_selector(
                page,
                ["#txtUsuario", "input[name='txtUsuario']", "input[id*='usuario' i]", "input[type='text']"],
                "el campo Usuario",
            )
            password_selector = first_selector(
                page,
                ["#txtContrasenia", "input[name='txtContrasenia']", "input[type='password']"],
                "el campo Contrasena",
            )
            submit_selector = first_selector(
                page,
                ["#btnIngresar", "button[type='submit']", "button:has-text('Ingresar')", "input[type='submit']"],
                "el boton Ingresar",
            )
            page.fill(user_selector, user)
            page.fill(password_selector, password)
            page.click(submit_selector)
            try:
                page.wait_for_load_state("networkidle", timeout=30000)
            except Exception:
                page.wait_for_timeout(3000)
            response_redirect = context.request.post(
                "https://app.dinet.com.pe/Home/RedirectSystem",
                data={"SystemCode": system_code},
                timeout=120000,
            )
            response_accounts = context.request.post(
                "https://w4w.dinet.com.pe/AppWeb/IngresoSistema/ListarCuentas",
                data={"CodigoCentroDistribucion": dc_code},
                timeout=120000,
            )
            response_assignment = context.request.post(
                "https://w4w.dinet.com.pe/AppWeb/IngresoSistema/AssignmentCredentials",
                data={
                    "distributionCenterCode": dc_code,
                    "distributionCenter": dc_name,
                    "accountCode": account_code,
                    "account": account,
                },
                timeout=120000,
            )
            statuses = [response_redirect.status, response_accounts.status, response_assignment.status]
            print(f"[INFO] Contexto W4W: {statuses}")
            if not all(response.ok for response in (response_redirect, response_accounts, response_assignment)):
                raise RuntimeError("W4W no acepto el contexto despues del login visual.")
            page.goto("https://w4w.dinet.com.pe/AppWeb/Home/Index/", wait_until="domcontentloaded", timeout=120000)
            page.wait_for_timeout(1000)
            cookie = build_cookie(context.cookies(["https://app.dinet.com.pe", "https://w4w.dinet.com.pe"]))
        finally:
            context.close()
            browser.close()

    output = Path(args.out)
    output.write_text(cookie, encoding="utf-8")
    output.chmod(0o600)
    print(f"[OK] Sesion W4W renovada; cookie temporal escrita en {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
