#!/usr/bin/env python3
import json
import sys


def extract_with_pymupdf(path):
    import fitz

    doc = fitz.open(path)
    pages = []
    for index, page in enumerate(doc, start=1):
        text = page.get_text("markdown") or page.get_text("text") or ""
        text = text.strip()
        if text:
            pages.append(f"## Page {index}\n\n{text}")
    return "\n\n".join(pages).strip()


def extract_with_pdfplumber(path):
    import pdfplumber

    pages = []
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            text = text.strip()
            if text:
                pages.append(f"## Page {index}\n\n{text}")
    return "\n\n".join(pages).strip()


def extract_with_pypdf2(path):
    from PyPDF2 import PdfReader

    reader = PdfReader(path)
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        text = text.strip()
        if text:
            pages.append(f"## Page {index}\n\n{text}")
    return "\n\n".join(pages).strip()


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "Usage: pdf_to_markdown.py <pdf-path>"}))
        return 2

    path = sys.argv[1]
    errors = []

    for name, extractor in (
        ("pymupdf", extract_with_pymupdf),
        ("pdfplumber", extract_with_pdfplumber),
        ("pypdf2", extract_with_pypdf2),
    ):
        try:
            markdown = extractor(path)
            if markdown:
                print(json.dumps({"ok": True, "markdown": markdown, "engine": name}))
                return 0
            errors.append(f"{name}: no extractable text")
        except Exception as exc:
            errors.append(f"{name}: {exc}")

    print(json.dumps({"ok": False, "error": "; ".join(errors)}))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
