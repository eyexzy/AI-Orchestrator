import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ADMIN_EMAIL = "eyexzy@gmail.com";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function getApiKey() {
  return process.env.ADMIN_API_KEY ?? null;
}

function noKey() {
  return NextResponse.json({ error: "ADMIN_API_KEY not configured" }, { status: 503 });
}

// GET /api/admin/dataset-stats  → GET /admin/dataset/stats
// GET /api/admin/ml-stats       → GET /stats/ml
// GET /api/admin/health         → GET /health
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string[] }> },
) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const apiKey = getApiKey();
  if (!apiKey) return noKey();

  const { slug } = await context.params;
  const action = slug.join("/");

  const pathMap: Record<string, string> = {
    "dataset-stats": "/dataset/stats",
    "ml-stats":      "/stats/ml",
    "health":        "/health",
    "users-stats":   "/users/stats",
    "users-list":    "/users/list",
    "users-issues":  "/users/issues",
    "activity":      "/activity/hourly",
    "export-csv":    "/export-csv",
    "test-providers": "/test-providers",
  };

  const backendPath = pathMap[action];
  if (!backendPath) {
    return NextResponse.json({ error: `Unknown admin action: ${action}` }, { status: 404 });
  }

  try {
    const res = await fetch(`${BACKEND}${backendPath}`, {
      headers: { "X-Api-Key": apiKey },
      cache: "no-store",
    });

    if (action === "export-csv") {
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=interaction_logs.csv",
        },
      });
    }

    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

// POST /api/admin/retrain → POST /ml/retrain
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string[] }> },
) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const apiKey = getApiKey();
  if (!apiKey) return noKey();

  const { slug } = await context.params;
  const action = slug.join("/");

  if (action !== "retrain") {
    return NextResponse.json({ error: `Unknown admin action: ${action}` }, { status: 404 });
  }

  let body: { model_type?: string; min_samples?: number } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const qs = new URLSearchParams({
    model_type:  body.model_type  ?? "LogisticRegression",
    min_samples: String(body.min_samples ?? 10),
    use_tuning:  "true",
  });

  try {
    const res = await fetch(`${BACKEND}/ml/retrain?${qs}`, {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
    });
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
