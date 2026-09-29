#!/usr/bin/env python3
"""Baixa os GIFs encontrados em uma página e os separa por categoria.

Uso: python3 baixar_gifs.py [--url URL] [--saida PASTA] [--cookie-arquivo ARQUIVO]
O arquivo de cookie deve conter o valor do cabeçalho Cookie da sessão do navegador.
"""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
import importlib.util
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urldefrag, urljoin, urlparse
from urllib.request import Request, urlopen


DEFAULT_URL = "https://gerafitpro.destravadigital.com/gifs"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.8037.57 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
}


def clean_name(value: str, fallback: str) -> str:
    value = unquote(value).strip()
    value = re.sub(r"\.(gif)(?:\?.*)?$", "", value, flags=re.I)
    value = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", "_", value)
    value = re.sub(r"\s+", " ", value).strip(" ._")
    return (value or fallback)[:120]


class PageParser(HTMLParser):
    def __init__(self, page_url: str):
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.heading = "Sem categoria"
        self.heading_depth = 0
        self.in_heading = False
        self.heading_text: list[str] = []
        self.images: list[tuple[str, str, str]] = []
        self.links: list[tuple[str, str]] = []
        self._anchor_text: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag in ("h1", "h2", "h3", "h4"):
            self.in_heading = True
            self.heading_depth += 1
            self.heading_text = []
        if tag == "a" and a.get("href"):
            self._anchor_text = []
            self.links.append((urljoin(self.page_url, a["href"]), ""))
        if tag == "img":
            src = next((a.get(k) for k in ("src", "data-src", "data-original", "data-lazy-src") if a.get(k)), "")
            srcset = a.get("srcset") or a.get("data-srcset") or ""
            if not src and srcset:
                src = srcset.split(",")[0].strip().split(" ")[0]
            if src:
                category = a.get("data-category") or a.get("data-group") or a.get("data-folder") or self.heading
                label = a.get("alt") or a.get("title") or a.get("data-name") or ""
                self.images.append((urljoin(self.page_url, src), category, label))

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._anchor_text is not None:
            if self.links:
                url, _ = self.links[-1]
                self.links[-1] = (url, " ".join("".join(self._anchor_text).split()))
            self._anchor_text = None
        if tag in ("h1", "h2", "h3", "h4") and self.in_heading:
            title = " ".join("".join(self.heading_text).split())
            if title:
                self.heading = title
            self.heading_depth = max(0, self.heading_depth - 1)
            self.in_heading = self.heading_depth > 0

    def handle_data(self, data: str) -> None:
        if self._anchor_text is not None:
            self._anchor_text.append(data)
        if self.in_heading:
            self.heading_text.append(data)


def fetch(url: str, cookie: str = "") -> tuple[bytes, str, str]:
    headers = dict(HEADERS)
    if cookie:
        headers["Cookie"] = cookie
    request = Request(url, headers=headers)
    with urlopen(request, timeout=30) as response:
        return response.read(), response.geturl(), response.headers.get_content_type()


def fetch_rendered(page, url: str) -> tuple[bytes, str, dict[str, bytes], list[dict], list[dict], dict[str, str], str]:
    """Carrega a página num navegador real e devolve HTML e URLs GIF vistas."""
    gif_responses: dict[str, bytes] = {}
    exercise_rows: list[dict] = []
    folder_rows: list[dict] = []
    api_headers: dict[str, str] = {}
    api_base = ""

    def record_request(request) -> None:
        nonlocal api_base
        parsed = urlparse(request.url)
        if ".supabase.co" in parsed.netloc and "/rest/v1/" in parsed.path:
            headers = request.headers
            for key in ("apikey", "authorization"):
                if headers.get(key):
                    api_headers[key] = headers[key]
            api_base = f"{parsed.scheme}://{parsed.netloc}/rest/v1"

    def record_gif(response) -> None:
        nonlocal exercise_rows, folder_rows
        try:
            if "image/gif" in response.headers.get("content-type", "").lower():
                gif_responses[response.url] = response.body()
            elif "/rest/v1/exercise_gifs?select=*" in response.url:
                exercise_rows = response.json()
            elif "/rest/v1/gif_folders?select=*" in response.url:
                folder_rows = response.json()
        except Exception:
            pass

    page.on("request", record_request)
    page.on("response", record_gif)
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    try:
        page.wait_for_load_state("networkidle", timeout=12000)
    except Exception:
        pass
    for _ in range(6):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(350)
    page.wait_for_timeout(1200)
    source = page.content().encode("utf-8")
    final_url = page.url
    page.remove_listener("request", record_request)
    page.remove_listener("response", record_gif)
    return source, final_url, gif_responses, exercise_rows, folder_rows, api_headers, api_base


def is_gif_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    return path.endswith(".gif") or ".gif/" in path


def download(url: str, destination: Path, cookie: str) -> bool:
    try:
        data, _, content_type = fetch(url, cookie)
    except (HTTPError, URLError, TimeoutError) as exc:
        print(f"  Falha ao baixar {url}: {exc}", file=sys.stderr)
        return False
    if not (content_type == "image/gif" or data[:6] in (b"GIF87a", b"GIF89a")):
        print(f"  Ignorado (resposta não é GIF): {url}", file=sys.stderr)
        return False
    if destination.exists():
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Baixa e organiza os GIFs de uma página por categoria.")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"página de origem (padrão: {DEFAULT_URL})")
    parser.add_argument("--saida", type=Path, default=Path("gifs"), help="pasta onde salvar (padrão: ./gifs)")
    parser.add_argument("--cookie-arquivo", type=Path, help="arquivo de texto com o cabeçalho Cookie da sua sessão")
    args = parser.parse_args()
    cookie = args.cookie_arquivo.read_text(encoding="utf-8").strip() if args.cookie_arquivo else ""
    browser = None
    browser_page = None
    if importlib.util.find_spec("playwright"):
        from playwright.sync_api import sync_playwright
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(headless=True)
        browser_page = browser.new_page()

    root = urlparse(args.url)
    allowed_origin = (root.scheme, root.netloc)
    base_path = root.path
    pending = [args.url]
    visited: set[str] = set()
    candidates: dict[str, tuple[str, str]] = {}
    rendered_gifs: dict[str, bytes] = {}
    api_headers: dict[str, str] = {}
    api_base = ""
    folder_labels: dict[str, str] = {}
    while pending:
        page_url = pending.pop(0)
        page_url, _ = urldefrag(page_url)
        if page_url in visited:
            continue
        visited.add(page_url)
        try:
            if browser_page:
                page_content, resolved_url, gif_responses, exercise_rows, folder_rows, seen_api_headers, seen_api_base = fetch_rendered(browser_page, page_url)
                rendered_gifs.update(gif_responses)
                api_headers.update(seen_api_headers)
                api_base = seen_api_base or api_base
            else:
                page_content, resolved_url, _ = fetch(page_url, cookie)
                gif_responses = set()
                exercise_rows = []
                folder_rows = []
        except HTTPError as exc:
            if exc.code == 403:
                print("O servidor recusou esta requisição (HTTP 403). Como a página é pública, isso pode ser uma restrição ao acesso automatizado deste ambiente; tente executar o script no seu computador.", file=sys.stderr)
                if not candidates:
                    return 1
            else:
                print(f"Não foi possível abrir a pasta {page_url}: HTTP {exc.code}", file=sys.stderr)
            continue
        except (URLError, TimeoutError) as exc:
            print(f"Não foi possível abrir a pasta {page_url}: {exc}", file=sys.stderr)
            continue
        except Exception as exc:
            print(f"Falha ao renderizar {page_url}: {exc}", file=sys.stderr)
            continue

        page = PageParser(resolved_url)
        page.feed(page_content.decode("utf-8", errors="replace"))
        query = parse_qs(urlparse(resolved_url).query)
        folder = query.get("folder", [""])[0]
        folder = clean_name(folder, "Sem categoria")

        for item in folder_rows:
            slug = str(item.get("name_normalized") or item.get("name") or "").strip()
            display_name = str(item.get("name") or slug).strip()
            if slug:
                folder_labels[slug] = display_name
                folder_url = f"{root.scheme}://{root.netloc}{base_path}?folder={quote(slug, safe='')}"
                if folder_url not in visited and folder_url not in pending:
                    pending.append(folder_url)

        if browser_page and api_base and api_headers and folder != "Sem categoria":
            api_url = (f"{api_base}/exercise_gifs?select=*&order=exercise_name.asc"
                       f"&folder=eq.{quote(query.get('folder', [''])[0], safe='')}&limit=1000")
            try:
                response = browser_page.request.get(api_url, headers=api_headers, timeout=60000)
                if response.ok:
                    rows = response.json()
                    if isinstance(rows, list):
                        exercise_rows = rows
            except Exception as exc:
                print(f"Não foi possível ler a lista completa da pasta {folder}: {exc}", file=sys.stderr)

        display_folder = folder_labels.get(query.get("folder", [""])[0], folder)
        for item in exercise_rows:
            gif_url = item.get("public_url") or item.get("gif_url")
            if not gif_url or not is_gif_url(gif_url):
                continue
            label = item.get("exercise_name") or item.get("file_name") or ""
            candidates.setdefault(gif_url, (display_folder, label))

        for url, category, label in page.images:
            if is_gif_url(url):
                candidates.setdefault(url, (display_folder if folder != "Sem categoria" else category, label))
        for url in gif_responses:
            candidates.setdefault(url, (display_folder, ""))
        # Links de subpastas usam o mesmo caminho e o parâmetro ?folder=...
        for url, label in page.links:
            clean_url, _ = urldefrag(url)
            parsed = urlparse(clean_url)
            if is_gif_url(clean_url):
                candidates.setdefault(clean_url, (display_folder, label))
                continue
            if (parsed.scheme, parsed.netloc) != allowed_origin or parsed.path != base_path:
                continue
            if parse_qs(parsed.query).get("folder") and clean_url not in visited and clean_url not in pending:
                pending.append(clean_url)

    if not candidates:
        if browser:
            browser.close()
            playwright.stop()
        if not importlib.util.find_spec("playwright"):
            print("Nenhum GIF foi encontrado no HTML estático. Para carregar os itens inseridos por JavaScript, instale o navegador: pip install playwright && playwright install chromium; depois execute o script novamente.", file=sys.stderr)
        else:
            print("Nenhum GIF foi encontrado nem mesmo após renderizar a página. Ela pode carregar os arquivos por uma API ou exigir interação adicional.", file=sys.stderr)
        return 2

    saved = 0
    for index, (url, (category, label)) in enumerate(candidates.items(), start=1):
        parsed = urlparse(url)
        basename = Path(unquote(parsed.path)).name
        title = label or Path(basename).stem or f"gif-{index:03d}"
        folder = clean_name(category, "Sem categoria")
        filename = clean_name(title, f"gif-{index:03d}") + ".gif"
        target = args.saida / folder / filename
        if target.exists():
            print(f"[{index}/{len(candidates)}] Já existe: {target}")
            continue
        print(f"[{index}/{len(candidates)}] {folder}/{filename}")
        if url in rendered_gifs:
            data = rendered_gifs[url]
        elif browser_page:
            try:
                response = browser_page.request.get(url, timeout=60000)
                data = response.body() if response.ok else b""
            except Exception as exc:
                print(f"  Falha ao baixar {url}: {exc}", file=sys.stderr)
                data = b""
        else:
            data = b""

        if data:
            if data[:6] in (b"GIF87a", b"GIF89a"):
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                saved += 1
            else:
                print(f"  Resposta não contém um GIF válido: {url}", file=sys.stderr)
        elif not browser_page and download(url, target, cookie):
            saved += 1
        time.sleep(0.15)

    if browser:
        browser.close()
        playwright.stop()

    print(f"Concluído: {saved} GIF(s) novo(s) em {args.saida.resolve()}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
