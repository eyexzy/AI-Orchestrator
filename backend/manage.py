"""
CLI management tool for AI-Orchestrator.

Usage:
  python manage.py dataset stats          - show dataset quality report
  python manage.py dataset export <file>  - export training CSV
  python manage.py ml status              - show current model info
  python manage.py ml train               - retrain the model
  python manage.py ml train --model RandomForest --no-tuning
  python manage.py users list             - list all users with metrics
  python manage.py users issues           - show adaptation problems
  python manage.py health                 - check DB + cache health
"""
import argparse
import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))


# ── helpers ──────────────────────────────────────────────────────────────────

def _col(text: str, code: str) -> str:
    if not sys.stdout.isatty():
        return str(text)
    return f"\033[{code}m{text}\033[0m"

def green(t):  return _col(t, "32")
def yellow(t): return _col(t, "33")
def red(t):    return _col(t, "31")
def bold(t):   return _col(t, "1")
def dim(t):    return _col(t, "2")


def _bar(value: float, width: int = 20, char: str = "█") -> str:
    filled = round(value * width)
    return char * filled + dim("░") * (width - filled)


def _table(headers: list[str], rows: list[list], col_widths: list[int] | None = None):
    if not col_widths:
        col_widths = [max(len(str(h)), max((len(str(r[i])) for r in rows), default=0)) for i, h in enumerate(headers)]
    sep = "  "
    header_line = sep.join(bold(str(h).ljust(w)) for h, w in zip(headers, col_widths))
    divider = sep.join("─" * w for w in col_widths)
    print(header_line)
    print(dim(divider))
    for row in rows:
        print(sep.join(str(v).ljust(w) for v, w in zip(row, col_widths)))


# ── dataset ──────────────────────────────────────────────────────────────────

async def _cmd_dataset_stats():
    from database import init_db, AsyncSessionLocal, AdaptationFeedback, AdaptationDecision, MLFeedback
    from sqlalchemy import func, select

    await init_db()
    async with AsyncSessionLocal() as db:
        gold_r   = await db.execute(select(func.count(AdaptationFeedback.id)))
        gold     = gold_r.scalar() or 0

        silver_r = await db.execute(
            select(func.count(AdaptationDecision.id))
            .where(AdaptationDecision.confidence >= 0.6)
        )
        silver   = silver_r.scalar() or 0

        bronze_r = await db.execute(select(func.count(MLFeedback.id)))
        bronze   = bronze_r.scalar() or 0

        dist_r   = await db.execute(
            select(AdaptationFeedback.ui_level_at_time, func.count(AdaptationFeedback.id))
            .where(AdaptationFeedback.ui_level_at_time.in_([1, 2, 3]))
            .group_by(AdaptationFeedback.ui_level_at_time)
        )
        dist = {row[0]: row[1] for row in dist_r.all()}

    synthetic = 60
    real_total = gold + silver + bronze
    total = real_total + synthetic

    print(bold("\n── Dataset Statistics ───────────────────────────────"))
    rows = [
        ["Gold (explicit feedback)", str(gold),  "✓ highest quality"],
        ["Silver (high-conf auto)",  str(silver), "✓ reliable labels"],
        ["Bronze (implicit)",        str(bronze), "~ lower confidence"],
        ["Synthetic (hardcoded)",    str(synthetic), "~ bootstrap only"],
        ["Real total",               str(real_total), ""],
        ["Grand total",              str(total), ""],
    ]
    _table(["Source", "Count", "Note"], rows, [28, 7, 25])

    print()
    print(bold("Gold label distribution:"))
    for lvl in (1, 2, 3):
        count = dist.get(lvl, 0)
        pct = count / gold if gold else 0
        bar = _bar(pct, 15)
        print(f"  L{lvl}  {bar}  {count:>4} ({pct:.0%})")

    print()
    issues: list[str] = []
    if gold < 200:
        issues.append(f"Low gold samples: {gold}/200 recommended")
    if real_total < 1000:
        issues.append(f"Low real samples: {real_total}/1000 (target for ~100 testers)")
    missing = [f"L{l}" for l in (1, 2, 3) if dist.get(l, 0) == 0]
    if missing:
        issues.append(f"Missing gold labels for: {', '.join(missing)}")
    elif dist:
        counts = [dist.get(l, 0) for l in (1, 2, 3)]
        mn, mx = min(counts), max(counts)
        if mn > 0 and mx / mn > 3:
            issues.append("Class imbalance in gold labels (>3x ratio)")

    if issues:
        print(yellow("Issues:"))
        for i in issues:
            print(f"  {yellow('⚠')}  {i}")
    else:
        print(green("✓ Dataset looks healthy"))

    recommendation = "ready" if not issues else "collect_more"
    print()
    print(f"Recommendation: {green('ready') if recommendation == 'ready' else yellow('collect more data')}")
    print()


async def _cmd_dataset_export(output_path: str):
    import csv
    from database import init_db, AsyncSessionLocal, InteractionLog
    from sqlalchemy import select

    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(InteractionLog).order_by(InteractionLog.timestamp.asc())
        )
        logs = result.scalars().all()

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["Timestamp", "SessionID", "ChatID", "UserEmail", "Level",
                        "Prompt", "Score", "NormalizedScore", "TypingSpeed", "Metrics"],
        )
        writer.writeheader()
        for log in logs:
            writer.writerow(log.to_csv_row())

    print(green(f"✓ Exported {len(logs)} rows → {output_path}"))


# ── ml ────────────────────────────────────────────────────────────────────────

async def _cmd_ml_status():
    from database import init_db, AsyncSessionLocal, MLModelCache
    from sqlalchemy import select

    await init_db()
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(MLModelCache)
            .order_by(MLModelCache.updated_at.desc(), MLModelCache.id.desc())
            .limit(1)
        )
        cached = row.scalars().first()

    print(bold("\n── ML Model Status ──────────────────────────────────"))
    if not cached:
        print(yellow("No model found in database"))
        return

    print(f"  Model type:   {cached.model_type or 'LogisticRegression'}")
    print(f"  Accuracy:     {cached.accuracy or 0:.1%}")
    print(f"  F1 macro:     {cached.f1_score or 0:.1%}")
    print(f"  Samples used: {cached.samples_used or 0}")
    print(f"  Updated at:   {cached.updated_at.isoformat() if cached.updated_at else 'unknown'}")
    print(f"  DB row ID:    {cached.id}")

    try:
        report = json.loads(cached.classification_report_json or "{}")
        if report:
            print()
            print(bold("  Per-class metrics:"))
            for cls_name in ("L1 Novice", "L2 Intermediate", "L3 Expert"):
                m = report.get(cls_name, {})
                if m:
                    f1  = m.get("f1-score", 0)
                    sup = int(m.get("support", 0))
                    bar = _bar(f1, 12)
                    print(f"    {cls_name:<16} {bar}  F1={f1:.2f}  n={sup}")
    except Exception:
        pass
    print()


async def _cmd_ml_train(model_type: str, min_samples: int, no_tuning: bool):
    from database import init_db
    from retrain import retrain_from_db

    print(bold(f"\n── Retrain: {model_type} ─────────────────────────────"))
    print(f"  min_samples={min_samples}  tuning={'off' if no_tuning else 'on'}")
    print()

    await init_db()
    result = await retrain_from_db(
        min_samples=min_samples,
        model_type=model_type,
        use_tuning=not no_tuning,
    )

    print()
    print(bold("── Results ──────────────────────────────────────────"))
    print(f"  Samples:   {result['samples_total']}")
    print(f"  Accuracy:  {result['accuracy']:.1%}")
    print(f"  F1 macro:  {result['f1_macro']:.1%}")
    if result.get("had_proper_split"):
        print(f"  CV F1:     {result['cv_f1_mean']:.3f} ± {result['cv_f1_std']:.3f} ({result['cv_folds']}-fold)")
    else:
        print(yellow("  (No train/test split — too few samples)"))

    stats = result.get("dataset_stats", {})
    if stats:
        print(f"  Gold:      {stats.get('gold', 0)}")
        print(f"  Silver:    {stats.get('silver', 0)}")
        print(f"  Bronze:    {stats.get('bronze', 0)}")
        print(f"  Synthetic: {stats.get('synthetic', 0)}")

    print()
    print(green("✓ Model saved to database"))
    print()


# ── users ─────────────────────────────────────────────────────────────────────

async def _cmd_users_list():
    from database import init_db, AsyncSessionLocal, UserExperienceProfile, InteractionLog
    from sqlalchemy import select, func

    await init_db()
    async with AsyncSessionLocal() as db:
        stats_sub = (
            select(
                InteractionLog.user_email,
                func.count(InteractionLog.id).label("cnt"),
                func.max(InteractionLog.timestamp).label("last"),
            )
            .group_by(InteractionLog.user_email)
            .subquery()
        )
        result = await db.execute(
            select(
                UserExperienceProfile.user_email,
                UserExperienceProfile.current_level,
                UserExperienceProfile.confidence_last,
                UserExperienceProfile.profile_features_json,
                stats_sub.c.cnt,
                stats_sub.c.last,
            )
            .outerjoin(stats_sub, UserExperienceProfile.user_email == stats_sub.c.user_email)
            .order_by(stats_sub.c.last.desc().nullslast())
        )
        rows = result.all()

    print(bold(f"\n── Users ({len(rows)}) ──────────────────────────────────────"))
    if not rows:
        print(dim("  No users yet"))
        return

    table_rows = []
    for row in rows:
        try:
            feat = json.loads(row.profile_features_json or "{}")
        except Exception:
            feat = {}
        help_r = float(feat.get("help_ratio", 0) or 0)
        sessions = int(feat.get("sessions_count", 0) or 0)
        last = row.last.strftime("%Y-%m-%d %H:%M") if row.last else "—"
        conf = float(row.confidence_last or 0)
        table_rows.append([
            row.user_email,
            f"L{row.current_level or 1}",
            f"{conf:.2f}",
            str(row.cnt or 0),
            str(sessions),
            f"{help_r:.2f}",
            last,
        ])

    _table(
        ["Email", "Level", "Conf", "Interactions", "Sessions", "Help%", "Last Active"],
        table_rows,
        [30, 6, 5, 13, 9, 6, 18],
    )
    print()


async def _cmd_users_issues():
    from database import init_db, AsyncSessionLocal, UserExperienceProfile, InteractionLog
    from sqlalchemy import select, func

    await init_db()
    async with AsyncSessionLocal() as db:
        stats_sub = (
            select(
                InteractionLog.user_email,
                func.count(InteractionLog.id).label("cnt"),
                func.max(InteractionLog.timestamp).label("last"),
            )
            .group_by(InteractionLog.user_email)
            .subquery()
        )
        result = await db.execute(
            select(
                UserExperienceProfile.user_email,
                UserExperienceProfile.current_level,
                UserExperienceProfile.confidence_last,
                UserExperienceProfile.profile_features_json,
                stats_sub.c.cnt,
                stats_sub.c.last,
            )
            .outerjoin(stats_sub, UserExperienceProfile.user_email == stats_sub.c.user_email)
        )
        rows = result.all()

    issues = []
    for row in rows:
        try:
            feat = json.loads(row.profile_features_json or "{}")
        except Exception:
            feat = {}
        email = row.user_email
        level = int(row.current_level or 1)
        conf  = float(row.confidence_last or 0)
        cnt   = int(row.cnt or 0)
        help_r = float(feat.get("help_ratio", 0) or 0)
        avg_pl = float(feat.get("avg_prompt_length_rolling", 0) or 0)

        if cnt >= 15 and level < 3 and conf < 0.3:
            issues.append(("warning", email, "stuck_level",
                           f"Stuck at L{level}", f"{cnt} prompts, confidence {conf:.2f}"))
        if cnt >= 5 and help_r >= 0.7:
            issues.append(("warning", email, "high_help_ratio",
                           "High help ratio", f"ratio={help_r:.2f}"))
        if cnt >= 8 and avg_pl < 20 and level >= 2:
            issues.append(("info", email, "short_prompts",
                           f"Short prompts at L{level}", f"avg={avg_pl:.0f} chars"))

    print(bold(f"\n── Adaptation Issues ({len(issues)}) ────────────────────────"))
    if not issues:
        print(green("  ✓ No issues found"))
        return

    issues.sort(key=lambda x: (0 if x[0] == "warning" else 1, x[1]))
    for severity, email, code, title, detail in issues:
        icon = yellow("⚠") if severity == "warning" else dim("ℹ")
        print(f"  {icon}  {bold(title)}")
        print(f"      {dim(email)}  ·  {code}")
        print(f"      {detail}")
    print()


# ── health ────────────────────────────────────────────────────────────────────

async def _cmd_health():
    from database import init_db, AsyncSessionLocal
    from sqlalchemy import text

    print(bold("\n── Health Check ─────────────────────────────────────"))

    await init_db()
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        print(f"  Database:  {green('connected')}")
    except Exception as e:
        print(f"  Database:  {red(f'error: {e}')}")

    print()


# ── main ──────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="manage.py",
        description="AI-Orchestrator management CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = p.add_subparsers(dest="group", required=True)

    # dataset
    ds = sub.add_parser("dataset", help="Dataset commands")
    ds_sub = ds.add_subparsers(dest="action", required=True)
    ds_sub.add_parser("stats", help="Show dataset quality report")
    ds_export = ds_sub.add_parser("export", help="Export training data as CSV")
    ds_export.add_argument("output", nargs="?", default="dataset_export.csv", help="Output CSV path")

    # ml
    ml = sub.add_parser("ml", help="ML model commands")
    ml_sub = ml.add_subparsers(dest="action", required=True)
    ml_sub.add_parser("status", help="Show current model info")
    ml_train = ml_sub.add_parser("train", help="Retrain the classifier")
    ml_train.add_argument("--model", default="LogisticRegression",
                          choices=["LogisticRegression", "RandomForest", "SVC"])
    ml_train.add_argument("--min-samples", type=int, default=10)
    ml_train.add_argument("--no-tuning", action="store_true")

    # users
    us = sub.add_parser("users", help="User monitoring commands")
    us_sub = us.add_subparsers(dest="action", required=True)
    us_sub.add_parser("list", help="List all users with metrics")
    us_sub.add_parser("issues", help="Show adaptation problems")

    # health
    sub.add_parser("health", help="Check DB and cache health")

    return p


async def _run(args: argparse.Namespace):
    if args.group == "dataset":
        if args.action == "stats":
            await _cmd_dataset_stats()
        elif args.action == "export":
            await _cmd_dataset_export(args.output)

    elif args.group == "ml":
        if args.action == "status":
            await _cmd_ml_status()
        elif args.action == "train":
            await _cmd_ml_train(args.model, args.min_samples, args.no_tuning)

    elif args.group == "users":
        if args.action == "list":
            await _cmd_users_list()
        elif args.action == "issues":
            await _cmd_users_issues()

    elif args.group == "health":
        await _cmd_health()


if __name__ == "__main__":
    parser = build_parser()
    ns = parser.parse_args()
    asyncio.run(_run(ns))
