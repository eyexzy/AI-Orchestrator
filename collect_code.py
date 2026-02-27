import os

SKIP_DIRS = {
    "node_modules", ".next", ".git", "__pycache__", "venv", "env",
    ".vscode", ".idea", "dist", "build", "coverage",
}

SKIP_FILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    ".DS_Store", ".env", ".env.local",
}

SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
    ".ttf", ".woff", ".woff2", ".eot",
}

# full project
INCLUDE_EXTENSIONS = {".ts", ".tsx", ".py", ".js", ".mjs", ".css", ".md"}
INCLUDE_BY_NAME = {"package.json", "requirements.txt", "tsconfig.json", "next.config.mjs"}

OUTPUT_FILE = "full_project_context.txt"
FRONTEND_OUTPUT_FILE = "frontend_context.txt"
SEPARATOR = "=" * 64

# --- frontend-only (app code only) ---
FRONTEND_INCLUDE_EXTS = {".ts", ".tsx", ".css"}

# only these roots count as "app UI code"
FRONTEND_ALLOWED_PREFIXES = (
    "app/",
    "components/",
    "lib/",
)

# exclude auth/login/api/ui-kit/infrastructure
FRONTEND_EXCLUDE_PREFIXES = (
    "app/api/",
    "app/login/",
    "components/ui/",
    "lib/store/",
)

# exclude single files (by relative path in frontend/)
FRONTEND_EXCLUDE_FILES = {
    "auth.ts",
    "middleware.ts",
    "lib/api.ts",
    "lib/config.ts",
    "lib/prisma.ts",
    "lib/templates.ts",
    "components/SessionProvider.tsx",
}


def should_include_full(filename: str, output_files: set[str]) -> bool:
    if filename in SKIP_FILES or filename in output_files:
        return False
    _, ext = os.path.splitext(filename)
    if ext.lower() in SKIP_EXTENSIONS:
        return False
    if filename in INCLUDE_BY_NAME:
        return True
    return ext.lower() in INCLUDE_EXTENSIONS


def collect_full(root_dir: str, output_files: set[str]) -> list[tuple[str, str]]:
    files: list[tuple[str, str]] = []
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        dirnames.sort()

        for fname in sorted(filenames):
            if not should_include_full(fname, output_files):
                continue
            full_path = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(full_path, root_dir).replace("\\", "/")
            try:
                with open(full_path, encoding="utf-8", errors="replace") as f:
                    files.append((rel_path, f.read()))
            except (OSError, PermissionError) as e:
                print(f"  [skip] {rel_path}: {e}")
    return files


def should_include_frontend(frontend_rel_path: str) -> bool:
    # normalize to forward slashes
    p = frontend_rel_path.replace("\\", "/")

    # must be within allowed roots
    if not any(p.startswith(pref) for pref in FRONTEND_ALLOWED_PREFIXES):
        return False

    # exclude unwanted folders
    if any(p.startswith(pref) for pref in FRONTEND_EXCLUDE_PREFIXES):
        return False

    # exclude specific files
    if p in FRONTEND_EXCLUDE_FILES:
        return False

    # extension filter
    _, ext = os.path.splitext(p)
    if ext.lower() not in FRONTEND_INCLUDE_EXTS:
        return False

    # also exclude obvious auth-related filenames anywhere
    low = os.path.basename(p).lower()
    if "auth" in low or "login" in low:
        return False

    return True


def collect_frontend(root_dir: str, frontend_dir: str) -> list[tuple[str, str]]:
    """
    root_dir: project root
    frontend_dir: absolute path to ./frontend
    returns list of (rel_path_from_project_root, content)
    """
    files: list[tuple[str, str]] = []

    for dirpath, dirnames, filenames in os.walk(frontend_dir):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        dirnames.sort()

        for fname in sorted(filenames):
            full_path = os.path.join(dirpath, fname)
            rel_from_frontend = os.path.relpath(full_path, frontend_dir).replace("\\", "/")

            if not should_include_frontend(rel_from_frontend):
                continue

            rel_from_root = os.path.relpath(full_path, root_dir).replace("\\", "/")
            try:
                with open(full_path, encoding="utf-8", errors="replace") as f:
                    files.append((rel_from_root, f.read()))
            except (OSError, PermissionError) as e:
                print(f"  [skip] {rel_from_root}: {e}")

    return files


def write_output(root: str, out_name: str, files: list[tuple[str, str]]) -> str:
    out_path = os.path.join(root, out_name)
    with open(out_path, "w", encoding="utf-8") as out:
        for rel_path, content in files:
            out.write(f"{SEPARATOR}\n")
            out.write(f"File: {rel_path}\n")
            out.write(f"{SEPARATOR}\n")
            out.write(content)
            if content and not content.endswith("\n"):
                out.write("\n")
            out.write("\n")
    return out_path


def main() -> None:
    root = os.path.dirname(os.path.abspath(__file__)) or "."
    output_files = {OUTPUT_FILE, FRONTEND_OUTPUT_FILE}

    print(f"Scanning full project: {root}")
    full_files = collect_full(root, output_files)
    full_path = write_output(root, OUTPUT_FILE, full_files)
    print(f"Done — {len(full_files)} files → {OUTPUT_FILE} ({os.path.getsize(full_path)/1024:.1f} KB)")

    frontend_root = os.path.join(root, "frontend")
    if os.path.isdir(frontend_root):
        print(f"Scanning frontend (app-only): {frontend_root}")
        fe_files = collect_frontend(root, frontend_root)
        fe_path = write_output(root, FRONTEND_OUTPUT_FILE, fe_files)
        print(f"Done — {len(fe_files)} files → {FRONTEND_OUTPUT_FILE} ({os.path.getsize(fe_path)/1024:.1f} KB)")
    else:
        print("Frontend folder not found: ./frontend (skip frontend export)")


if __name__ == "__main__":
    main()